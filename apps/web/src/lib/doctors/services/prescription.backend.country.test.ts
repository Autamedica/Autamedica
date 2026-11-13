import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UUID } from '@/lib/doctors/types/medical';
import { doctorPrescriptionBackendService } from './prescription.backend';

vi.mock('@/lib/doctors/lib/resolve-room', () => ({
  doctorHasPatientAccess: vi.fn().mockResolvedValue(true),
}));

function fixture(doctorCountry: string | null, patientCountry: string | null, matchedExternalPatient?: Record<string, unknown>) {
  const inserts: Array<Record<string, unknown>> = [];
  const db = {
    from(table: string) {
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() {
          if (table === 'doctors') return {data:{care_country:doctorCountry,active:true},error:null};
          if (table === 'patients') return {data: matchedExternalPatient ?? {care_country:patientCountry,active:true},error:null};
          return {data:null,error:null};
        },
        insert(input: Record<string,unknown>) {
          inserts.push(input);
          return {
            select() {
              return {
                async single() {
                  const now='2026-11-03T12:00:00.000Z';
                  return {error:null,data:{
                    ...input,id:'prescription-test',created_at:now,updated_at:now,
                    status:'draft',cuir:null,vendor_id:null,qr_code_content:null,
                    signed_pdf_url:null,
                  }};
                },
              };
            },
          };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return {db,inserts};
}

const doctor={userId:'doctor-user',doctorId:'doctor-uuid'};
const payload={patient_id:'00000000-0000-4000-8000-000000000001' as UUID,medication_name:'PARACETAMOL',dosage:'500 mg'};

describe('doctor prescription creation uses canonical medical-care country', () => {
  it.each(['AR','BR'] as const)('%s: writes the doctor country, not an untrusted browser country', async (country) => {
    const {db,inserts}=fixture(country,country);
    const result=await doctorPrescriptionBackendService.create(
      db as never,doctor,payload,
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      country_code:country,doctor_id:doctor.doctorId,patient_id:payload.patient_id,
    });
    expect(result.source).toBe('prescriptions_core');
  });

  it.each([
    ['AR','BR'],['BR','AR'],['AR',null],['BR',null],
  ])('refuses mismatched or unset patient country %s / %s without inserting',async(doc,pat)=>{
    const {db,inserts}=fixture(doc,pat);
    await expect(doctorPrescriptionBackendService.create(db as never,doctor,payload))
      .rejects.toThrow('prescription_country_mismatch');
    expect(inserts).toHaveLength(0);
  });

  it('refuses a doctor without a resolved credential country', async () => {
    const {db,inserts}=fixture(null,'AR');
    await expect(doctorPrescriptionBackendService.create(db as never,doctor,payload))
      .rejects.toThrow('prescription_doctor_country_required');
    expect(inserts).toHaveLength(0);
  });

  it('cannot create an external patient without explicit confirmation', async()=>{
    const {db,inserts}=fixture('AR','AR');
    await expect(doctorPrescriptionBackendService.create(db as never,doctor,{
      medication_name:'PARACETAMOL',dosage:'500 mg',
      external_patient:{name:'Paciente Demo',dni:'12345678',address:'CABA'},
    })).rejects.toThrow('external_patient_care_country_confirmation_required');
    expect(inserts).toHaveLength(0);
  });


  it('creates the BR external patient and prescription only with an explicit country attestation and valid CPF',async()=>{
    const {db,inserts}=fixture('BR','BR');
    await doctorPrescriptionBackendService.create(db as never,doctor,{
      medication_name:'PARACETAMOL',dosage:'500 mg',
      external_patient:{
        name:'Paciente Demo',cpf:'52998224725',address:'Rua Teste, 100',
        care_country:'BR',care_country_confirmed:true,
      },
    });
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toMatchObject({
      care_country:'BR',cpf:'52998224725',
    });
    expect(inserts[1]).toMatchObject({
      country_code:'BR',
      clinical_data: {
        external_patient: {care_country:'BR',care_country_confirmed:true},
      },
    });
  });

  it('rejects BR external CPF with invalid check digits',async()=>{
    const {db,inserts}=fixture('BR','BR');
    await expect(doctorPrescriptionBackendService.create(db as never,doctor,{
      medication_name:'PARACETAMOL',dosage:'500 mg',
      external_patient:{
        name:'Paciente Demo',cpf:'11111111111',address:'Rua Teste, 100',
        care_country:'BR',care_country_confirmed:true,
      },
    })).rejects.toThrow('external_patient_cpf_required');
    expect(inserts).toHaveLength(0);
  });


  it('never modifies a linked patient account from a matching document',async()=>{
    const {db,inserts}=fixture('AR','AR',{
      id:'linked-patient',user_id:'registered-user',care_country:'AR',active:true,
    });
    await expect(doctorPrescriptionBackendService.create(db as never,doctor,{
      medication_name:'PARACETAMOL',dosage:'500 mg',
      external_patient:{
        name:'Paciente Demo',dni:'12345678',address:'CABA',
        care_country:'AR',care_country_confirmed:true,
      },
    })).rejects.toThrow('external_patient_registered_account_required');
    expect(inserts).toHaveLength(0);
  });

  it('does not reassign a pre-existing external patient from AR to BR',async()=>{
    const {db,inserts}=fixture('BR','BR',{
      id:'historical-patient',user_id:null,care_country:'AR',active:true,
    });
    await expect(doctorPrescriptionBackendService.create(db as never,doctor,{
      medication_name:'PARACETAMOL',dosage:'500 mg',
      external_patient:{
        name:'Paciente Demo',cpf:'52998224725',address:'Rua Teste',
        care_country:'BR',care_country_confirmed:true,
      },
    })).rejects.toThrow('external_patient_country_mismatch_or_unset');
    expect(inserts).toHaveLength(0);
  });

  it('cannot accept a doctor-entered mismatched country even with an attestation',async()=>{
    const {db,inserts}=fixture('BR','BR');
    await expect(doctorPrescriptionBackendService.create(db as never,doctor,{
      medication_name:'PARACETAMOL',dosage:'500 mg',
      external_patient:{name:'Paciente Demo',dni:'12345678',address:'CABA',
        care_country:'AR',care_country_confirmed:true},
    })).rejects.toThrow('external_patient_care_country_confirmation_required');
    expect(inserts).toHaveLength(0);
  });
});
