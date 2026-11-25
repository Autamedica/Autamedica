import { describe, expect, it } from 'vitest';
import { supportsSignedPrescriptionDownload } from './pdf';

describe('private prescription PDF policy', () => {
  it('supports PAdES governance policy only for Argentina', () => {
    expect(supportsSignedPrescriptionDownload('AR', 'electronic_simple')).toBe(true);
    expect(supportsSignedPrescriptionDownload('BR', 'electronic_simple')).toBe(false);
    expect(supportsSignedPrescriptionDownload('AR', 'ac_external')).toBe(true);
  });
});
