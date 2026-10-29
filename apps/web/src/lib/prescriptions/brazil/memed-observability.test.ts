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
  it('preserves exception frames and useful log messages', () => {
    const event = sanitizeSentryEvent({ exception: { values: [{ type: 'Error', value: 'Network failure', stacktrace: { frames: [{ filename: 'app.js', lineno: 10 }] } }] } });
    expect(event.exception.values[0].stacktrace.frames).toEqual([{ filename: 'app.js', lineno: 10 }]);
    const log = getBaseSentryConfig('server').beforeSendLog({ message: 'Provider timeout', attributes: {} });
    expect(log.message).toBe('Provider timeout');
  });
  it('disables default PII and sanitizes transaction/log channels', () => {
    const config = getBaseSentryConfig('server');
    expect(config.sendDefaultPii).toBe(false);
    expect(config.beforeSendTransaction).toBeTypeOf('function');
    expect(config.beforeSendLog).toBeTypeOf('function');
  });
});
