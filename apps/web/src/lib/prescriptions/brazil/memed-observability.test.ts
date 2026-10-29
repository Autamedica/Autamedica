import { describe, expect, it } from 'vitest';
// Shared runtime sanitizer is also used for server spans and breadcrumbs.
import { sanitizeSentryEvent, getBaseSentryConfig } from '../../../../sentry.shared.config.js';

describe('Memed telemetry protection', () => {
  it('removes credential URLs and CPF from breadcrumbs and spans', () => {
    const url = 'https://api.memed.com.br/v1/sinapse-prescricao/usuarios/52998224725?api-key=synthetic-key&secret-key=synthetic-secret';
    const event = sanitizeSentryEvent({ request: { url },
      breadcrumbs: [{ data: { url, cpf: '52998224725' } }], spans: [{ description: `GET ${url}` }] });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('synthetic-secret'); expect(serialized).not.toContain('52998224725');
    expect(serialized).toContain('redacted');
  });
  it('disables default PII and sanitizes transaction/log channels', () => {
    const config = getBaseSentryConfig('server');
    expect(config.sendDefaultPii).toBe(false);
    expect(config.beforeSendTransaction).toBeTypeOf('function');
    expect(config.beforeSendLog).toBeTypeOf('function');
  });
});
