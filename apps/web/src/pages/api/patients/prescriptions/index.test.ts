import { describe, expect, it } from 'vitest';
import { supportsPatientPdfDownload } from './index';

describe('patient prescription PDF visibility', () => {
  it.each([
    ['ac_external', 'AR', true, 'active'],
    ['electronic_simple', 'AR', true, 'active'],
    ['electronic_simple', 'BR', false, 'active'],
    ['ac_external', 'BR', true, 'active'],
    ['electronic_simple', null, false, 'active'],
    ['ac_external', 'AR', false, 'draft'],
  ] as const)('applies country and issuance policy (%s, %s)', (signature_method, country_code, expected, status) => {
    expect(supportsPatientPdfDownload({ status, signature_method, country_code })).toBe(expected);
  });
});
