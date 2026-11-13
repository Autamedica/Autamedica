/** Error metadata must never contain PostgreSQL failing rows or clinical payloads. */
export function pharmacyErrorCode(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'INTERNAL';
}
