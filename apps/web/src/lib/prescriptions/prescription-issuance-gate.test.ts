import { describe, expect, it } from 'vitest';
import {
  checkDirectPrescriptionIssuance as check,
  hasEligibleProfessionalPadesCertificate as eligibleCertificate,
} from './prescription-issuance-gate';

const approvedAR = {
  prescriptionCountry: 'AR',
  doctorCountry: 'AR',
  patientCountry: 'AR',
  argentinaProductionApproved: true,
} as const;

describe('proof-of-issuance clinical gate', () => {
  it('does not infer Argentina from a missing or unsupported country', () => {
    expect(check({ ...approvedAR, prescriptionCountry: null })).toEqual({
      ok: false, code: 'prescription_country_required',
    });
    expect(check({ ...approvedAR, prescriptionCountry: 'UY' })).toEqual({
      ok: false, code: 'prescription_country_required',
    });
  });

  it('rejects country mismatches or missing country even with approval enabled', () => {
    expect(check({ ...approvedAR, doctorCountry: 'BR' })).toEqual({
      ok: false, code: 'doctor_country_mismatch',
    });
    expect(check({ ...approvedAR, patientCountry: null })).toEqual({
      ok: false, code: 'patient_country_required_or_mismatched',
    });
  });

  it('never emits Brazilian internal PDF/CUIR instead of Memed', () => {
    expect(check({
      prescriptionCountry: 'BR', doctorCountry: 'BR', patientCountry: 'BR',
      argentinaProductionApproved: true,
    })).toEqual({ ok: false, code: 'br_requires_memed_provider' });
  });

  it('defaults Argentina to not approved until production homologation', () => {
    expect(check({ ...approvedAR, argentinaProductionApproved: false })).toEqual({
      ok: false, code: 'ar_production_homologation_required',
    });
  });

  it('rejects self-signed and expired certificates before external provider calls', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    const base = {
      acProvider: 'accredited_demo_ca',
      signatureMethod: 'ac_external',
      certValidUntil: '2027-11-04T12:00:00Z',
    };
    expect(eligibleCertificate(null, now)).toBe(false);
    expect(eligibleCertificate({ ...base, acProvider: 'self_signed' }, now)).toBe(false);
    expect(eligibleCertificate({ ...base, signatureMethod: 'electronic_simple' }, now)).toBe(false);
    expect(eligibleCertificate({ ...base, certValidUntil: '2025-11-04T12:00:00Z' }, now)).toBe(false);
    expect(eligibleCertificate(base, now)).toBe(true);
  });

  it('only allows matched Argentine clinical country with explicit approval', () => {
    expect(check(approvedAR)).toEqual({ ok: true, country: 'AR' });
  });
});
