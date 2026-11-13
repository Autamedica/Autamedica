import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { primeRuntimeEnv, resetRuntimeEnvCache } from '@/lib/runtime-env';
import { FarmalinkClient, FarmalinkHttpError } from './farmalink.client';
import { claimFarmalinkIssue, recordFarmalinkIssue } from './farmalink.issue-gate';
import { __testables, issuePrescription } from './issue-prescription.service';
import * as pdfService from './pdf-prescription.service';

const RX = 'bdbfd64b-4280-41b6-bb8c-630b09a0b9a5';
const USER = 'cac6f6b3-dc8a-4f4f-8833-45207e063f65';
const ATTEMPT = '55bb9df3-e203-42a7-bef4-8a0f9cfb53e2';
const HASH = 'a'.repeat(64);

const clinical = {
  supabase: {} as SupabaseClient,
  prescriptionId: RX,
  actorUserId: USER,
  clinicalData: { diagnosis: 'Control' },
  doctor: {
    id: 'a50aac2f-6090-428f-8377-b9613d5105bb',
    license_number: '123456',
    specialty: 'Clinica Medica',
    refeps_id: '54122333444',
    enrollment_entity: 'MN',
    enrollment_jurisdiction: 'C',
    professional_address: 'CABA',
  },
  doctorName: 'Dr. Medico Prueba',
  item: { generic_name: 'AMOXICILINA', quantity: 1, dosage: '500 MG' },
  patient: {
    dni: '30123456', cuil: '27301234560', birth_date: '1990-01-01', gender: 'female',
    insurance_info: { farmalink: { codEntidad: 7110, pan: '20123456786', plan: 'NO POSEE' } },
  },
  patientName: 'Paciente Prueba',
  now: '2026-11-03T09:00:00.000Z',
  expiresAt: '2026-11-12T09:00:00.000Z',
};

function db(responses: Array<{data: unknown; error: unknown} | Error>) {
  const rpc = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) rpc.mockRejectedValueOnce(response);
    else rpc.mockResolvedValueOnce(response);
  }
  return { rpc } as unknown as SupabaseClient;
}

function setup() {
  primeRuntimeEnv({
    FARMALINK_ENABLED: 'true',
    FARMALINK_OAUTH_USERNAME: 'fake-user',
    FARMALINK_OAUTH_PASSWORD: 'fake-pass',
    FARMALINK_BASIC_USER: 'fake-client',
    FARMALINK_BASIC_PASSWORD: 'fake-pass',
    FARMALINK_ORG_ID: '182',
    FARMALINK_IP_ORIGIN: '8.8.8.8',
    FARMALINK_DEFAULT_PRODUCT_CODE: '56800',
    FARMALINK_DEFAULT_DRUG_CODE: '01033',
    FARMALINK_PRESCRIBER_DOCUMENT_NUMBER: '12345678',
    FARMALINK_PRESCRIBER_BIRTH_DATE: '1980-01-01',
  });
}

describe('Farmalink once-only persistent issue guard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetRuntimeEnvCache();
  });

  it('fails closed when the DB RPC is not available', async () => {
    const supabase = db([new Error('Missing RPC')]);
    expect(await claimFarmalinkIssue(supabase, RX, HASH, USER))
      .toMatchObject({ok:false, reason:'database_failure'});
  });

  it('rejects an existing/unknown attempt without transmitting alta again', async () => {
    setup();
    const supabase = db([{data:{claimed:false,attempt_id:ATTEMPT,state:'unknown'},error:null}]);
    const alta = vi.fn();
    vi.spyOn(FarmalinkClient, 'fromEnv').mockReturnValue({altaReceta:alta} as unknown as FarmalinkClient);

    const result = await __testables.registerFarmalinkIfEnabled({...clinical,supabase});
    expect(result).toMatchObject({ok:false,error:{code:'farmalink_pending_reconciliation'}});
    expect(alta).not.toHaveBeenCalled();
    expect((supabase as unknown as {rpc:ReturnType<typeof vi.fn>}).rpc).toHaveBeenCalledTimes(1);
  });

  it('never contacts Farmalink when the RPC fails', async () => {
    setup();
    const supabase = db([{data:null,error:{message:'permission denied'}}]);
    const alta = vi.fn();
    vi.spyOn(FarmalinkClient, 'fromEnv').mockReturnValue({altaReceta:alta} as unknown as FarmalinkClient);
    const result = await __testables.registerFarmalinkIfEnabled({...clinical,supabase});
    expect(result).toMatchObject({ok:false,error:{code:'farmalink_idempotency_unavailable'}});
    expect(alta).not.toHaveBeenCalled();
  });

  it('persists a confirmed number BEFORE completing the issue', async () => {
    setup();
    const supabase = db([
      {data:{claimed:true,attempt_id:ATTEMPT,state:'reserved'},error:null},
      {data:true,error:null},
    ]);
    const alta = vi.fn().mockResolvedValue({
      approved:true,nroRecElectronica:'9600000002991',
      responseCode:'00',raw:{},
    });
    vi.spyOn(FarmalinkClient, 'fromEnv').mockReturnValue({altaReceta:alta} as unknown as FarmalinkClient);

    const result = await __testables.registerFarmalinkIfEnabled({...clinical,supabase});
    expect(result).toMatchObject({ok:true,registration:{vendorId:'9600000002991'}});
    const rpc = (supabase as unknown as {rpc:ReturnType<typeof vi.fn>}).rpc;
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][0]).toBe('claim_farmalink_issue');
    expect(rpc.mock.calls[1]).toEqual(['record_farmalink_issue',expect.objectContaining({
      p_state:'confirmed',p_vendor_id:'9600000002991',p_actor_user_id:USER,
    })]);
    expect(alta).toHaveBeenCalledOnce();
  });

  it('marks a timeout as unknown and does NOT automatically retry', async () => {
    setup();
    const supabase = db([
      {data:{claimed:true,attempt_id:ATTEMPT,state:'reserved'},error:null},
      {data:true,error:null},
    ]);
    const alta = vi.fn().mockRejectedValueOnce(Object.assign(new Error('timeout'), {name:'TimeoutError'}));
    vi.spyOn(FarmalinkClient, 'fromEnv').mockReturnValue({altaReceta:alta} as unknown as FarmalinkClient);
    const result = await __testables.registerFarmalinkIfEnabled({...clinical,supabase});
    expect(result).toMatchObject({ok:false,error:{code:'farmalink_pending_reconciliation'}});
    expect(alta).toHaveBeenCalledTimes(1);
    const rpc = (supabase as unknown as {rpc:ReturnType<typeof vi.fn>}).rpc;
    expect(rpc.mock.calls[1]).toEqual(['record_farmalink_issue',expect.objectContaining({
      p_state:'unknown',p_vendor_id:null,
    })]);
  });

  it('keeps the claim blocked even if a vendor rejection is explicit', async () => {
    setup();
    const supabase = db([
      {data:{claimed:true,attempt_id:ATTEMPT,state:'reserved'},error:null},
      {data:true,error:null},
    ]);
    const alta = vi.fn().mockResolvedValue({
      approved:false,responseCode:'55',raw:{},
    });
    vi.spyOn(FarmalinkClient, 'fromEnv').mockReturnValue({altaReceta:alta} as unknown as FarmalinkClient);
    const result = await __testables.registerFarmalinkIfEnabled({...clinical,supabase});
    expect(result).toMatchObject({ok:false,error:{code:'farmalink_rejected',responseCode:'55'}});
    expect((supabase as unknown as {rpc:ReturnType<typeof vi.fn>}).rpc.mock.calls[1][1])
      .toMatchObject({p_state:'rejected'});
    expect(alta).toHaveBeenCalledOnce();
  });

  it('does not accept a fake claim lacking the required UUID', async () => {
    const supabase = db([{data:{claimed:true,attempt_id:'invalid',state:'reserved'},error:null}]);
    expect(await claimFarmalinkIssue(supabase,RX,HASH,USER))
      .toMatchObject({ok:false,reason:'unexpected_result'});
  });

  it('fails closed if recording the outcome is rejected by the database', async () => {
    const supabase = db([{data:false,error:null}]);
    expect(await recordFarmalinkIssue(supabase,RX,ATTEMPT,USER,'confirmed','9600000002991','00'))
      .toBe(false);
  });
  it('rejects an inconsistent successful claim in a terminal state', async () => {
    const supabase = db([{data:{claimed:true,attempt_id:ATTEMPT,state:'confirmed'},error:null}]);
    expect(await claimFarmalinkIssue(supabase,RX,HASH,USER))
      .toMatchObject({ok:false,reason:'unexpected_result'});
  });

  it('keeps HTTP 504 unknown and blocks a subsequent invocation', async () => {
    setup();
    const supabase = db([
      {data:{claimed:true,attempt_id:ATTEMPT,state:'reserved'},error:null},
      {data:true,error:null},
      {data:{claimed:false,attempt_id:ATTEMPT,state:'unknown'},error:null},
    ]);
    const alta = vi.fn().mockRejectedValueOnce(new FarmalinkHttpError(504, null));
    vi.spyOn(FarmalinkClient, 'fromEnv').mockReturnValue({altaReceta:alta} as unknown as FarmalinkClient);
    for (let i=0; i<2; i++) {
      expect(await __testables.registerFarmalinkIfEnabled({...clinical,supabase}))
        .toMatchObject({ok:false,error:{code:'farmalink_pending_reconciliation'}});
    }
    expect(alta).toHaveBeenCalledOnce();
    expect((supabase as unknown as {rpc:ReturnType<typeof vi.fn>}).rpc.mock.calls[1][1])
      .toMatchObject({p_state:'unknown'});
  });

  it('does not issue again after remote approval even when result persistence fails', async () => {
    setup();
    const supabase = db([
      {data:{claimed:true,attempt_id:ATTEMPT,state:'reserved'},error:null},
      new Error('database connection lost'),
      {data:{claimed:false,attempt_id:ATTEMPT,state:'reserved'},error:null},
    ]);
    const alta = vi.fn().mockResolvedValue({approved:true,nroRecElectronica:'9600000002991',responseCode:'00',raw:{}});
    vi.spyOn(FarmalinkClient, 'fromEnv').mockReturnValue({altaReceta:alta} as unknown as FarmalinkClient);
    for (let i=0; i<2; i++) {
      expect(await __testables.registerFarmalinkIfEnabled({...clinical,supabase}))
        .toMatchObject({ok:false,error:{code:'farmalink_pending_reconciliation'}});
    }
    expect(alta).toHaveBeenCalledOnce();
  });

  it.each([
    {external_patient:{name:'Other Person',dni:'40000000'}},
    {items:[clinical.item,clinical.item]},
  ])('refuses unverified proxy patients or multiple medications without an alta', async (extra) => {
    setup();
    const supabase = db([]);
    const alta = vi.fn();
    vi.spyOn(FarmalinkClient, 'fromEnv').mockReturnValue({altaReceta:alta} as unknown as FarmalinkClient);
    expect(await __testables.registerFarmalinkIfEnabled({
      ...clinical,supabase,clinicalData:{...clinical.clinicalData,...extra},
    })).toMatchObject({ok:false,error:{code:'farmalink_mapping_failed'}});
    expect(alta).not.toHaveBeenCalled();
  });

  it('denies legacy issuance before Farmalink, PDF generation or upload when homologation is not approved', async () => {
    setup();
    const supabase = db([]);
    const upload = vi.fn();
    Object.assign(supabase, {
      from: vi.fn((table: string) => {
        const rows: Record<string, unknown> = {
          doctors: { ...clinical.doctor, active: true, license_type: 'MN', care_country: 'AR' },
          prescriptions: {
            id: RX, doctor_id: clinical.doctor.id, patient_id: 'test-patient',
            status: 'draft', cuir: null, country_code: 'AR',
            clinical_data: { diagnosis: 'Control', items: [clinical.item] },
          },
          profiles: { role: 'doctor', active: true, sss_validation_status: 'valid' },
          patients: {
            ...clinical.patient, active: true, care_country: 'AR', user_id: 'test-patient-user',
            address: 'Fixture CABA',
          },
        };
        const chain = {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: rows[table], error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: rows[table], error: null }),
        };
        return chain;
      }),
      storage: { from: vi.fn().mockReturnValue({ upload }) },
    });
    const pdf = vi.spyOn(pdfService, 'generatePrescriptionPdf');
    const alta = vi.fn();
    vi.spyOn(FarmalinkClient, 'fromEnv')
      .mockReturnValue({ altaReceta: alta } as unknown as FarmalinkClient);

    for (let i = 0; i < 2; i++) {
      expect(await issuePrescription(supabase, RX, USER))
        .toMatchObject({ ok: false, error: { code: 'ar_production_homologation_required' } });
    }
    expect(alta).not.toHaveBeenCalled();
    expect(pdf).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect((supabase as unknown as {rpc: ReturnType<typeof vi.fn>}).rpc)
      .not.toHaveBeenCalled();
  });

});

