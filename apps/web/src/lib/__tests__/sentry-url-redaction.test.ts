import { describe, expect, it } from 'vitest';
import { sanitizeEvent } from '../observability/sentry';

describe('Sentry URL redaction', () => {
  it('removes the complete query and fragment from password-reset URLs', () => {
    const event = {
      request: {
        url: 'https://www.autamedica.com/auth/reset-password?token_hash=single-use-otp&type=recovery#access_token=legacy',
      },
    };

    sanitizeEvent(event);

    expect(event.request.url).toBe('https://www.autamedica.com/auth/reset-password');
    expect(JSON.stringify(event)).not.toContain('single-use-otp');
    expect(JSON.stringify(event)).not.toContain('legacy');
  });

  it('redacts PKCE and bearer tokens from other request URLs without removing safe parameters', () => {
    const event = {
      request: {
        url: 'https://www.autamedica.com/auth/callback?code=pkce-code&next=%2Fdashboard',
      },
    };

    sanitizeEvent(event);

    expect(event.request.url).toContain('next=%2Fdashboard');
    expect(event.request.url).not.toContain('pkce-code');
  });

  it('redacts token values from Sentry breadcrumbs', () => {
    const event = {
      breadcrumbs: [{
        category: 'navigation',
        data: {
          url: 'https://www.autamedica.com/auth/callback?access_token=bearer-secret&next=%2Fhome',
        },
      }],
    };

    sanitizeEvent(event);

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('bearer-secret');
    expect(serialized).toContain('[Redacted]');
  });
});
