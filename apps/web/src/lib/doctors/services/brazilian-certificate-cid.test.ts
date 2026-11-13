import { describe, expect, it } from 'vitest';
import { resolveBrazilianCidDisclosure } from './brazilian-certificate-cid';

const br = {
  countryCode: 'BR' as const,
  doctorLicenseType: 'CRM',
  doctorUfBrazil: 'RS',
};

describe('Brazilian certificate CID-10 disclosure (CFM 2.381/2024)', () => {
  it('does not add CID when patient did not request it', () => {
    expect(resolveBrazilianCidDisclosure({ ...br, patientRequested: false })).toBeNull();
  });

  it('normalizes and accepts a patient-requested physician-selected CID', () => {
    expect(resolveBrazilianCidDisclosure({ ...br, patientRequested: true, code: ' j06.9 ' })).toBe('J06.9');
  });

  it('does not disclose employer-requested CID without patient agreement', () => {
    expect(() => resolveBrazilianCidDisclosure({ ...br, patientRequested: false, code: 'J06.9' }))
      .toThrow('cid10_patient_request_required');
  });

  it('does not record patient request without a selected code', () => {
    expect(() => resolveBrazilianCidDisclosure({ ...br, patientRequested: true }))
      .toThrow('cid10_code_required_when_requested');
  });

  it.each(['RANDOM', '123', 'A1', 'J06.999', 'J06-9'])('rejects malformed CID: %s', code => {
    expect(() => resolveBrazilianCidDisclosure({ ...br, patientRequested: true, code }))
      .toThrow('cid10_code_invalid');
  });

  it('cannot attach Brazilian CID to Argentine document', () => {
    expect(() => resolveBrazilianCidDisclosure({
      countryCode: 'AR', code: 'J06.9', patientRequested: true,
      doctorLicenseType: 'MN',
    })).toThrow('cid10_brazil_only');
  });

  it('requires a Brazilian CRM registration', () => {
    expect(() => resolveBrazilianCidDisclosure({
      ...br, doctorLicenseType: 'MN', patientRequested: true, code: 'J06.9',
    })).toThrow('cid10_brazilian_doctor_required');
  });

  it('requires a Brazilian UF to segregate physician registration', () => {
    expect(() => resolveBrazilianCidDisclosure({
      ...br, doctorUfBrazil: null, patientRequested: true, code: 'J06.9',
    })).toThrow('cid10_brazilian_doctor_required');
  });
});
