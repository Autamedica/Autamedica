import { describe, expect, it } from 'vitest';
import { pharmacyErrorCode } from './errors';

describe('pharmacy telemetry redaction', () => {
  it('keeps a machine-readable SQL code without clinical diagnostics', () => {
    const error = { code: '23514', message: 'private diagnosis', details: 'Failing row contains private prescription' };
    expect(pharmacyErrorCode(error)).toBe('23514');
    expect(JSON.stringify({ code: pharmacyErrorCode(error) })).not.toMatch(/diagnosis|prescription|Failing row/);
  });
  it.each([new Error('private text'), null, { code: 'private text' }])('does not turn arbitrary error text into telemetry', error => {
    expect(pharmacyErrorCode(error)).toBe('INTERNAL');
  });
});
