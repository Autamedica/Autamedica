/** Public anon keys and request-body flags never authorize privileged push delivery. */
export function trustedPushAuthorization(
  authorization: string | null,
  credentials: { cronSecret?: string; serviceRoleKey?: string },
): boolean {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return false;
  return [credentials.cronSecret, credentials.serviceRoleKey]
    .some(secret => Boolean(secret) && token === secret);
}
