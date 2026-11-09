/**
 * Recognizes callback payloads supported by the password-recovery screen.
 *
 * Supabase PKCE redirects with ?code=..., while older implicit-flow links
 * may carry access_token in the query string or URL fragment.
 */
export function hasPasswordRecoveryCallback(url: URL): boolean {
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const params = [url.searchParams, hashParams];
  const hasAuthError = params.some((searchParams) =>
    ['error', 'error_code', 'error_description'].some((key) => {
      const value = searchParams.get(key);
      return typeof value === 'string' && value.trim().length > 0;
    }),
  );

  if (hasAuthError) return false;

  const hasPkceCode = Boolean(url.searchParams.get('code')?.trim());
  const hasAccessToken = params.some((searchParams) =>
    Boolean(searchParams.get('access_token')?.trim()),
  );

  return hasPkceCode || hasAccessToken;
}
