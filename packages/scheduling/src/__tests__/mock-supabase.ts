/**
 * Mock Supabase client for testing @autamedica/scheduling.
 *
 * Creates a chainable mock that records method calls and returns
 * configured data/errors.
 */

import type { SupabaseLike } from '../supabase';

interface MockResponse {
  data: unknown;
  error: { message: string } | null;
}

type ChainMethod =
  | 'select'
  | 'insert'
  | 'update'
  | 'delete'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not'
  | 'order'
  | 'limit'
  | 'single'
  | 'maybeSingle';

/**
 * Creates a mock Supabase client with configurable responses per table.
 *
 * Usage:
 * ```ts
 * const sb = createMockSupabase({
 *   doctor_availability: { data: [...], error: null },
 *   appointments: { data: [...], error: null },
 * });
 * ```
 */
export function createMockSupabase(
  tableResponses: Record<string, MockResponse>,
  rpcResponses?: Record<string, MockResponse>,
): SupabaseLike & { calls: Array<{ table: string; method: string; args: unknown[] }> } {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

  function createChain(table: string, opOverride?: MockResponse): Record<string, unknown> {
    const response = opOverride ?? tableResponses[table] ?? { data: null, error: null };

    const chainMethods: ChainMethod[] = [
      'select', 'insert', 'update', 'delete',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
      'in', 'not', 'order', 'limit', 'single', 'maybeSingle',
    ];

    const chain: Record<string, unknown> = {};

    // Each method returns the chain and is also a thenable that resolves to the response
    for (const method of chainMethods) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }

    // Make the chain thenable (for await)
    chain.then = (resolve: (v: MockResponse) => void, reject?: (e: unknown) => void) => {
      return Promise.resolve(response).then(resolve, reject);
    };

    // Direct data/error access
    chain.data = response.data;
    chain.error = response.error;

    return chain;
  }

  return {
    calls,
    from(table: string) {
      calls.push({ table, method: 'from', args: [table] });
      return createChain(table);
    },
    rpc(fn: string, args?: Record<string, unknown>) {
      calls.push({ table: '__rpc__', method: fn, args: [args] });
      const response = rpcResponses?.[fn] ?? { data: null, error: null };
      return Promise.resolve(response);
    },
  };
}

/**
 * Creates a mock Supabase where specific table+operation combos can return
 * different data. Useful when the same table is queried multiple times
 * with different results expected.
 */
export function createSequentialMockSupabase(
  sequences: Record<string, MockResponse[]>,
): SupabaseLike {
  const counters: Record<string, number> = {};

  function createChain(table: string): Record<string, unknown> {
    const idx = counters[table] ?? 0;
    const responses = sequences[table] ?? [];
    const response = responses[idx] ?? { data: null, error: null };
    counters[table] = idx + 1;

    const chainMethods: ChainMethod[] = [
      'select', 'insert', 'update', 'delete',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
      'in', 'not', 'order', 'limit', 'single', 'maybeSingle',
    ];

    const chain: Record<string, unknown> = {};

    for (const method of chainMethods) {
      chain[method] = () => chain;
    }

    chain.then = (resolve: (v: MockResponse) => void, reject?: (e: unknown) => void) => {
      return Promise.resolve(response).then(resolve, reject);
    };

    chain.data = response.data;
    chain.error = response.error;

    return chain;
  }

  return {
    from(table: string) {
      return createChain(table);
    },
    rpc() {
      return Promise.resolve({ data: null, error: null });
    },
  };
}
