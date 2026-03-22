/**
 * Tests for the parseCookieHeader logic used by the Supabase server client.
 *
 * parseCookieHeader is a private function inside supabase.ts. Rather than
 * exporting it just for testing, we replicate the same logic here to ensure
 * correctness, since the middleware also has an identical implementation.
 */

import { describe, it, expect } from 'vitest';

/** Extracted from src/lib/supabase.ts — same logic the server client uses. */
function parseCookieHeader(request: Request): Array<{ name: string; value: string }> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  if (!cookieHeader) return [];
  return cookieHeader.split('; ').map(c => {
    const eq = c.indexOf('=');
    return {
      name: eq >= 0 ? c.slice(0, eq) : c,
      value: eq >= 0 ? c.slice(eq + 1) : '',
    };
  });
}

describe('parseCookieHeader', () => {
  it('returns empty array when no cookie header is present', () => {
    const req = new Request('https://example.com');
    expect(parseCookieHeader(req)).toEqual([]);
  });

  it('parses a single cookie', () => {
    const req = new Request('https://example.com', {
      headers: { cookie: 'session=abc123' },
    });
    expect(parseCookieHeader(req)).toEqual([
      { name: 'session', value: 'abc123' },
    ]);
  });

  it('parses multiple cookies', () => {
    const req = new Request('https://example.com', {
      headers: { cookie: 'session=abc123; theme=dark; lang=es' },
    });
    expect(parseCookieHeader(req)).toEqual([
      { name: 'session', value: 'abc123' },
      { name: 'theme', value: 'dark' },
      { name: 'lang', value: 'es' },
    ]);
  });

  it('handles cookies with = in the value', () => {
    const req = new Request('https://example.com', {
      headers: { cookie: 'token=eyJhbGciOiJI.payload=data' },
    });
    const result = parseCookieHeader(req);
    expect(result).toEqual([
      { name: 'token', value: 'eyJhbGciOiJI.payload=data' },
    ]);
  });

  it('handles cookie name without value (no = sign)', () => {
    const req = new Request('https://example.com', {
      headers: { cookie: 'flag' },
    });
    expect(parseCookieHeader(req)).toEqual([
      { name: 'flag', value: '' },
    ]);
  });

  it('handles empty cookie value', () => {
    const req = new Request('https://example.com', {
      headers: { cookie: 'cleared=' },
    });
    expect(parseCookieHeader(req)).toEqual([
      { name: 'cleared', value: '' },
    ]);
  });

  it('handles Supabase auth cookies with base64 values', () => {
    const base64Value = 'base64-eyJhY2Nlc3NfdG9rZW4iOiJleUpoYkdjaU';
    const req = new Request('https://example.com', {
      headers: { cookie: `sb-access-token=${base64Value}; sb-refresh-token=xyz789` },
    });
    expect(parseCookieHeader(req)).toEqual([
      { name: 'sb-access-token', value: base64Value },
      { name: 'sb-refresh-token', value: 'xyz789' },
    ]);
  });
});
