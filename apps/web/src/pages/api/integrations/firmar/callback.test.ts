import { describe, expect, it } from 'vitest';
import { GET, HEAD, POST } from './callback';

describe('FirmAR TAD registered callback preflight', () => {
  it('reports reachable but does not falsely claim readiness to sign', async () => {
    const response = await GET({} as Parameters<typeof GET>[0]);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reachable).toBe(true);
    expect(body.acceptingSignatures).toBe(false);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('allows a HEAD availability check without returning content', async () => {
    const response = await HEAD({} as Parameters<typeof HEAD>[0]);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('refuses any incoming document until an independent signature verifier exists', async () => {
    const response = await POST({} as Parameters<typeof POST>[0]);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
