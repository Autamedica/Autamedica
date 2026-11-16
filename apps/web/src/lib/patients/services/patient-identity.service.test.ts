import { describe, expect, it, vi } from 'vitest';
import type { OfficialIdentityResult, RenaperPersonResult } from '@/lib/interoperability/non-fhir.service';
import {
  buildOfficialIdentityRecord,
  claimRenaperIdentityLookup,
  persistOfficialIdentityResult,
} from './patient-identity.service';

const PERSON: RenaperPersonResult = {
  idtramiteprincipal: null,
  idtramitetarjetareimpresa: null,
  ejemplar: null,
  vencimiento: null,
  emision: null,
  apellido: 'García',
  nombres: 'María José',
  fechaNacimiento: '29/02/2000',
  cuil: '27-12345678-9',
  calle: 'Calle Falsa',
  numero: '123',
  piso: null,
  departamento: null,
  cpostal: null,
  barrio: null,
  monoblock: null,
  ciudad: 'Rosario',
  municipio: null,
  provincia: 'Santa Fe',
  pais: 'Argentina',
  mensaf: null,
  origenf: null,
  fechaf: null,
  foto: null,
  sexo: 'F',
  numeroDocumento: '12.345.678',
  fechaConsulta: '2026-11-16',
  idciudadano: null,
  descripcionError: null,
  codigoError: null,
};

const RESULT: OfficialIdentityResult = {
  person: PERSON,
  coverages: [{ rnos: '123456', cobertura: 'IOSFA', servicio: 'PUCO' }],
};

function createDbMock() {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: true, error: null };
    },
  };
  return { db, calls };
}

describe('patient identity persistence (synthetic RENAPER / PUCO fixtures)', () => {
  it('normalizes official identity only when the declared name matches', () => {
    const identity = buildOfficialIdentityRecord(RESULT, '12345678', 'Maria Jose Garcia');
    expect(identity.identityStatus).toBe('verified_renaper');
    expect(identity.dni).toBe('12345678');
    expect(identity.cuil).toBe('27123456789');
    expect(identity.birthDate).toBe('2000-02-29');
    expect(identity.gender).toBe('F');
    expect(identity.pucoCoverageName).toBe('IOSFA');
  });

  it('marks mismatched names without promoting untrusted canonical patient fields', async () => {
    const { db, calls } = createDbMock();
    const identity = await persistOfficialIdentityResult({
      supabase: db,
      result: RESULT,
      dni: '12345678',
      patientId: 'patient-1',
      dispatchRequestId: 'dispatch-1',
      userId: 'user-1',
      declaredName: 'Juan Perez',
      syncProfileName: true,
    });

    expect(identity.identityStatus).toBe('mismatch');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('persist_renaper_identity_result');
    expect(calls[0]?.args).toMatchObject({
      p_patient_id: 'patient-1',
      p_dispatch_request_id: 'dispatch-1',
      p_user_id: 'user-1',
      p_identity_status: 'mismatch',
      p_sync_profile_name: true,
    });
  });

  it('keeps identity pending when RENAPER returns an unsupported sex value', () => {
    const incompleteResult = {
      ...RESULT,
      person: { ...PERSON, sexo: null },
    };
    expect(buildOfficialIdentityRecord(incompleteResult, '12345678', 'Maria Jose Garcia').identityStatus)
      .toBe('pending');
  });

  it('rejects invalid calendar dates instead of storing normalized but impossible dates', () => {
    const invalidResult = {
      ...RESULT,
      person: { ...PERSON, fechaNacimiento: '31/02/2000' },
    };
    expect(buildOfficialIdentityRecord(invalidResult, '12345678', 'Maria Jose Garcia').birthDate).toBeNull();
  });

  it('reserves the lookup budget atomically and maps the database limit sentinel', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    await expect(claimRenaperIdentityLookup({
      supabase: { rpc },
      patientId: 'patient-1',
    })).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith('claim_renaper_identity_lookup', {
      p_patient_id: 'patient-1',
      p_dispatch_request_id: null,
      p_limit: 3,
    });

    rpc.mockResolvedValueOnce({ data: -1, error: null });
    await expect(claimRenaperIdentityLookup({
      supabase: { rpc },
      dispatchRequestId: 'dispatch-1',
    })).rejects.toMatchObject({ code: 'RENAPER_LOOKUP_LIMIT_REACHED' });
  });
});
