/**
 * Duck-typed Supabase client interface to avoid SupabaseClient<Database, ...>
 * assignment incompatibility caused by 'protected' members in class-based
 * structural typing checks.
 */
export interface SupabaseLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc(fn: string, args?: Record<string, unknown>): any;
}
