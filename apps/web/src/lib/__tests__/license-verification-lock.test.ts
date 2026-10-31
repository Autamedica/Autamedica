import { describe, expect, it } from 'vitest';
import { createLicenseVerificationLock } from '../admin/license-verification-lock';

describe('administrative license verification lock', () => {
  it('prevents changing physician or draft while a delayed response is pending', async () => {
    const lock = createLicenseVerificationLock();
    let selected = 'doctor-a';
    let license = '123456';
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const verification = (async () => {
      expect(lock.start()).toBe(true);
      try { await pending; license = '123456-verified'; } finally { lock.finish(); }
    })();
    if (!lock.isRunning()) { selected = 'doctor-b'; license = '999999'; }
    expect(selected).toBe('doctor-a'); expect(license).toBe('123456');
    expect(lock.start()).toBe(false);
    release(); await verification;
    expect(selected).toBe('doctor-a'); expect(license).toBe('123456-verified');
    expect(lock.isRunning()).toBe(false);
    if (!lock.isRunning()) selected = 'doctor-b';
    expect(selected).toBe('doctor-b');
  });

  it('allows another verification after a failed request releases the lock', async () => {
    const lock = createLicenseVerificationLock();
    const request = async () => {
      if (!lock.start()) return;
      try { await Promise.reject(new Error('upstream unavailable')); } finally { lock.finish(); }
    };
    await expect(request()).rejects.toThrow('upstream unavailable');
    expect(lock.start()).toBe(true);
  });
});
