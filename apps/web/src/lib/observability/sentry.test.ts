import { describe, expect, it, vi } from 'vitest';

vi.mock('@autamedica/shared', () => ({ registerLogReporter: vi.fn() }));
import { getBaseSentryConfig, sanitizeSentryEvent } from '../../../sentry.shared.config.js';
import { sanitizeEvent as sanitizeRuntimeEvent } from './sentry';

describe('Sentry telemetry sanitization', () => {
  it('removes personal identifiers, credentials, request bodies and user identity', () => {
    const event = sanitizeSentryEvent({
      request: {
        url: 'https://api.example.test/patient/12345678?access_token=synthetic-secret',
        headers: {
          Authorization: 'Bearer synthetic-token',
          'X-Api-Key': 'synthetic-api-key',
          'Content-Type': 'application/json',
        },
        data: { email: 'test@example.com', clinical_data: 'synthetic clinical text' },
      },
      user: { id: 'patient-123', email: 'test@example.com', username: 'test-user' },
      message: 'Failure for CPF 52998224725 and DNI 12345678; contact test@example.com',
      transaction: '/patient/12345678/checkout',
      tags: { patientId: 'patient-123', runtime: 'web' },
      breadcrumbs: [{ data: { cpf: '52998224725', access_token: 'synthetic-secret' } }],
      spans: [{ description: 'GET https://api.example.test/?token=synthetic-secret' }],
      exception: {
        values: [{
          type: 'Error',
          value: 'Request failed for 52998224725 test@example.com',
          stacktrace: { frames: [{ filename: 'app.js', lineno: 10 }] },
        }],
      },
    });

    const json = JSON.stringify(event);
    for (const secret of [
      '52998224725',
      '12345678',
      'synthetic-secret',
      'synthetic-token',
      'synthetic-api-key',
      'test@example.com',
      'patient-123',
      'synthetic clinical text',
    ]) {
      expect(json).not.toContain(secret);
    }

    expect(event.user).toBeUndefined();
    expect(event.request.data).toBeUndefined();
    expect(event.request.headers.Authorization).toBeUndefined();
    expect(event.request.headers['X-Api-Key']).toBeUndefined();
    expect(event.request.headers['Content-Type']).toBe('application/json');
    expect(event.exception.values[0].stacktrace.frames).toEqual([
      { filename: 'app.js', lineno: 10 },
    ]);
    expect(event.tags.runtime).toBe('web');
  });

  it('sanitizes the event path used by the Astro client/server runtime', () => {
    const event = sanitizeRuntimeEvent({
      request: {
        url: 'https://api.example.test/patient/12345678?access_token=synthetic-secret',
        headers: { Authorization: 'Bearer synthetic-token', 'X-Api-Key': 'synthetic-api-key' },
        data: { cpf: '52998224725', email: 'test@example.com' },
      },
      user: { id: 'patient-123', email: 'test@example.com', ip_address: '203.0.113.10' },
      message: 'Patient 52998224725 test@example.com failed',
      tags: { patient_id: 'patient-123', runtime: 'web' },
      exception: { values: [{ type: 'Error', value: 'DNI 12345678 test@example.com' }] },
    });

    const json = JSON.stringify(event);
    for (const secret of [
      '12345678', '52998224725', 'synthetic-secret', 'synthetic-token',
      'synthetic-api-key', 'test@example.com', 'patient-123', '203.0.113.10',
    ]) expect(json).not.toContain(secret);
    expect(event.request.data).toBeUndefined();
    expect(event.user.id).toBeUndefined();
    expect(event.tags.runtime).toBe('web');
  });

  it('disables default PII and sanitizes breadcrumbs, spans and logs', () => {
    const config = getBaseSentryConfig('server');
    expect(config.sendDefaultPii).toBe(false);

    const breadcrumb = config.beforeBreadcrumb({
      message: 'Request from test@example.com',
      data: { patientId: 'patient-123', outcome: 'failed' },
    });
    expect(JSON.stringify(breadcrumb)).not.toContain('test@example.com');
    expect(JSON.stringify(breadcrumb)).not.toContain('patient-123');

    const span = config.beforeSendSpan({
      description: 'GET /payments?token=synthetic-secret',
    });
    expect(JSON.stringify(span)).not.toContain('synthetic-secret');

    const log = config.beforeSendLog({
      message: 'CPF 52998224725',
    });
    expect(JSON.stringify(log)).not.toContain('52998224725');
  });
});
