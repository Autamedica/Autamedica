import { describe, expect, it } from 'vitest';
import { isMemedEnabled, isMemedMobileEnabled, isMemedPilotDoctor } from './memed-pilot';

describe('Memed pilot configuration', () => {
  it('uses RX flag for web issuance and requires both flags for Android mobile', () => {
    expect(isMemedEnabled({ MEMED_RX_ENABLED: 'true' })).toBe(true);
    expect(isMemedEnabled({ MEMED_MOBILE_ENABLED: 'true' })).toBe(false);
    expect(isMemedMobileEnabled({ MEMED_RX_ENABLED: 'true', MEMED_MOBILE_ENABLED: 'true' })).toBe(true);
    expect(isMemedMobileEnabled({ MEMED_RX_ENABLED: 'false', MEMED_MOBILE_ENABLED: 'true' })).toBe(false);
    expect(isMemedMobileEnabled({ MEMED_RX_ENABLED: 'true', MEMED_MOBILE_ENABLED: 'false' })).toBe(false);
  });

  it('treats pilot doctor allowlist as optional and supports single or comma-separated ids', () => {
    expect(isMemedPilotDoctor({ MEMED_PILOT_DOCTOR_ID: 'doctor-a' }, 'doctor-a')).toBe(true);
    expect(isMemedPilotDoctor({ MEMED_PILOT_DOCTOR_ID: 'doctor-a, doctor-b' }, 'doctor-b')).toBe(true);
    expect(isMemedPilotDoctor({ MEMED_MOBILE_PILOT_DOCTOR_ID: 'doctor-b' }, 'doctor-b')).toBe(true);
    expect(isMemedPilotDoctor({ MEMED_MOBILE_PILOT_DOCTOR_ID: 'doctor-b' }, 'doctor-a')).toBe(false);
    expect(isMemedPilotDoctor({}, 'verified-crm-doctor')).toBe(true);
    expect(isMemedPilotDoctor({ MEMED_PILOT_DOCTOR_ID: '  ', MEMED_MOBILE_PILOT_DOCTOR_ID: '' }, 'verified-crm-doctor')).toBe(true);
    expect(isMemedPilotDoctor({}, null)).toBe(false);
  });
});
