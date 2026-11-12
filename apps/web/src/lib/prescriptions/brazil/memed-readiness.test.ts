import { describe, expect, it } from 'vitest';
import { assessMemedPilotReadiness } from './memed-readiness';

const doctor = {
  id: 'a1111111-1111-4111-8111-111111111111',
  active: true, license_type: 'CRM', license_number: '123456',
  uf_brazil: 'RS', cpf: '52998224725',
};
const license = {
  license_number: '123456', license_type: 'CRM', uf_brazil: 'RS',
  status: 'active', cfm_validation_status: 'valid',
  cfm_evidence_path: 'doctor-1/license-1/cfm-proof.pdf',
  cfm_review_notes: 'Consulta oficial CFM, CRM y UF confirmados.',
  cfm_reviewed_by: 'reviewer-1', cfm_reviewed_at: '2026-11-12T18:00:00.000Z',
  cfm_last_checked_at: '2026-11-12T18:00:00.000Z',
};
const profile = { first_name: 'Medico', last_name: 'Teste', cpf: null };
const standard = {
  doctor,
  licenses: [license],
  profile,
  privateCpf: null,
};

describe('Memed pilot readiness is no-PII and fail-closed', () => {
  it('accepts a validated active CRM pilot with valid CPF and full name', () => {
    expect(assessMemedPilotReadiness(standard)).toEqual({
      pilotPresent: true, activeBrazilianDoctor: true,
      cfmLicenseVerified: true, identityComplete: true, readyForPilot: true,
    });
  });
  it('fails closed for no configured or found pilot', () => {
    expect(assessMemedPilotReadiness({ ...standard, doctor: null }).readyForPilot).toBe(false);
  });
  it.each([
    [{ ...doctor, active: false }, 'inactive'],
    [{ ...doctor, license_type: 'MN' }, 'non-CRM'],
    [{ ...doctor, uf_brazil: 'AR' }, 'wrong country'],
  ])('blocks invalid prescriber %s (%s)', (changed) => {
    expect(assessMemedPilotReadiness({ ...standard, doctor: changed }).readyForPilot).toBe(false);
  });
  it.each([
    [{ ...license, license_number: '123457' }, 'wrong CRM'],
    [{ ...license, uf_brazil: 'SP' }, 'wrong UF'],
    [{ ...license, cfm_validation_status: 'pending' }, 'unverified CFM'],
    [{ ...license, status: 'inactive' }, 'inactive license'],
    [{ ...license, cfm_evidence_path: null }, 'missing evidence'],
    [{ ...license, cfm_reviewed_by: null }, 'missing reviewer'],
  ])('rejects license mismatch (%s, %s)', (changed) => {
    expect(assessMemedPilotReadiness({ ...standard, licenses: [changed] }).cfmLicenseVerified).toBe(false);
  });
  it('requires valid CPF and first and last name', () => {
    expect(assessMemedPilotReadiness({ ...standard,
      doctor: { ...doctor, cpf: null }, profile: { ...profile, cpf: null },
    }).identityComplete).toBe(false);
    expect(assessMemedPilotReadiness({ ...standard,
      profile: { ...profile, first_name: '' },
    }).readyForPilot).toBe(false);
  });
  it('never exposes CPF, CRM or identity fields in the returned result', () => {
    const r = assessMemedPilotReadiness(standard);
    expect(JSON.stringify(r)).not.toContain(doctor.cpf);
    expect(JSON.stringify(r)).not.toContain(doctor.license_number);
    expect(JSON.stringify(r)).not.toContain(doctor.id);
  });
});
