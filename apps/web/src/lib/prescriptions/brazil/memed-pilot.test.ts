import { describe, expect, it } from 'vitest';
import { isMemedEnabled, isMemedPilotDoctor } from './memed-pilot';

describe('Memed pilot configuration', () => {
  it('enables issuance when either supported feature flag is active', () => {
    expect(isMemedEnabled({ MEMED_RX_ENABLED: 'true' })).toBe(true);
    expect(isMemedEnabled({ MEMED_MOBILE_ENABLED: 'true' })).toBe(true);
    expect(isMemedEnabled({ MEMED_RX_ENABLED: 'false', MEMED_MOBILE_ENABLED: 'false' })).toBe(false);
  });

  it('recognizes both legacy and mobile pilot doctor ids', () => {
    expect(isMemedPilotDoctor({ MEMED_PILOT_DOCTOR_ID: 'doctor-a' }, 'doctor-a')).toBe(true);
    expect(isMemedPilotDoctor({ MEMED_MOBILE_PILOT_DOCTOR_ID: 'doctor-b' }, 'doctor-b')).toBe(true);
    expect(isMemedPilotDoctor({ MEMED_MOBILE_PILOT_DOCTOR_ID: 'doctor-b' }, 'doctor-a')).toBe(false);
    expect(isMemedPilotDoctor({}, null)).toBe(false);
  });
});
