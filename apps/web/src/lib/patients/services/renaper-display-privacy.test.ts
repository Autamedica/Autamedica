import { describe, expect, it } from 'vitest';
import { isOfficialPhotoAvailable, maskOfficialAddress } from './renaper-display-privacy';

describe('Argentina RENAPER protected address/photo preview', () => {
  it('shows only three letters per comma-separated address part and never digits', () => {
    const masked = maskOfficialAddress('Calle Ficticia 123, Rosario, Santa Fe');
    expect(masked).toBe('Cal** ******** *' + '**' + ', Ros****, San** Fe');
    expect(masked).not.toContain('123');
    expect(masked).not.toContain('Ficticia');
    expect(masked).not.toContain('Rosario');
  });

  it('handles empty data without generating a false preview', () => {
    expect(maskOfficialAddress(null)).toBe('');
    expect(maskOfficialAddress('')).toBe('');
    expect(isOfficialPhotoAvailable(null)).toBe(false);
    expect(isOfficialPhotoAvailable('  ')).toBe(false);
  });

  it('returns photo presence only, never the provider bytes', () => {
    const sample = 'SYNTHETIC_BASE64_IMAGE_NOT_REAL';
    const available = isOfficialPhotoAvailable(sample);
    expect(available).toBe(true);
    expect(JSON.stringify({ photoAvailable: available })).not.toContain(sample);
  });

  it('does not disclose a house number when it is the first token', () => {
    const address = maskOfficialAddress('123 Avenida de Prueba, Cordoba');
    expect(address).toBe('*** Ave**** ** ******, Cor****');
  });
});
