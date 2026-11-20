import { describe, expect, it } from 'vitest';
import { parsePharmacyQrAttribution } from './qr-attribution';

describe('parsePharmacyQrAttribution', () => {
  it('normalizes and preserves partner and physical QR source identifiers', () => {
    const params = new URL('https://www.autamedica.com/farmacia/solicitar?careCountry=BR&ref=jordan&qr_source=santana_do_livramento_01').searchParams;

    expect(parsePharmacyQrAttribution(params)).toEqual({
      referralCode: 'JORDAN',
      qrSourceCode: 'SANTANA_DO_LIVRAMENTO_01',
    });
  });

  it('keeps missing or malformed source attribution optional', () => {
    const params = new URL('https://www.autamedica.com/farmacia/solicitar?ref=JORDAN&qr_source=bad%20source').searchParams;

    expect(parsePharmacyQrAttribution(params)).toEqual({
      referralCode: 'JORDAN',
      qrSourceCode: null,
    });
  });

  it('does not turn an unknown partner into a referral', () => {
    const params = new URL('https://www.autamedica.com/farmacia/solicitar?ref=%3Cscript%3E&qr_source=POINT_01').searchParams;

    expect(parsePharmacyQrAttribution(params)).toEqual({
      referralCode: null,
      qrSourceCode: 'POINT_01',
    });
  });
});
