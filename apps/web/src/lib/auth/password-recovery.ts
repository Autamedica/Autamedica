/**
 * Recognizes callback payloads supported by the password-recovery screen.
 *
 * PKCE callbacks use ?code=..., older implicit-flow links may carry
 * access_token, and scanner-safe email templates use token_hash + type.
 */
function hasAuthError(url: URL): boolean {
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  return [url.searchParams, hashParams].some((params) =>
    ['error', 'error_code', 'error_description'].some((key) => {
      const value = params.get(key);
      return typeof value === 'string' && value.trim().length > 0;
    }),
  );
}

/** Returns a recovery token hash only for an explicit recovery callback. */
export function getPasswordRecoveryTokenHash(url: URL): string | null {
  if (hasAuthError(url) || url.searchParams.get('type') !== 'recovery') {
    return null;
  }

  const tokenHash = url.searchParams.get('token_hash')?.trim();
  return tokenHash || null;
}

/**
 * Supabase can fall back to Site URL when a recovery redirect is not accepted.
 * Route that scanner-safe callback to the dedicated reset screen without
 * redeeming the single-use token during the redirect.
 */
export function getPasswordRecoveryRedirectUrl(url: URL): string | null {
  const tokenHash = getPasswordRecoveryTokenHash(url);
  if (!tokenHash) return null;

  const redirectUrl = new URL('/auth/reset-password', url.origin);
  redirectUrl.searchParams.set('token_hash', tokenHash);
  redirectUrl.searchParams.set('type', 'recovery');
  return redirectUrl.toString();
}

/**
 * The production Site URL is www.autamedica.com. Normalize the apex host so
 * resetPasswordForEmail never sends an unlisted apex redirect to Supabase.
 * Keep localhost and Pages preview origins intact.
 */
export function getPasswordRecoveryRequestRedirectUrl(currentUrl: URL): string {
  const origin =
    currentUrl.protocol === 'https:' && currentUrl.hostname.toLowerCase() === 'autamedica.com'
      ? 'https://www.autamedica.com'
      : currentUrl.origin;

  return new URL('/auth/reset-password', origin).toString();
}

export function hasPasswordRecoveryCallback(url: URL): boolean {
  if (hasAuthError(url)) return false;
  if (getPasswordRecoveryTokenHash(url)) return true;

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const hasPkceCode = Boolean(url.searchParams.get('code')?.trim());
  const hasAccessToken = [url.searchParams, hashParams].some((params) =>
    Boolean(params.get('access_token')?.trim()),
  );

  return hasPkceCode || hasAccessToken;
}
