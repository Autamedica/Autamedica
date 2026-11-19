/**
 * Keep only the non-secret role selector when navigating between auth pages.
 * Recovery tokens, PKCE codes and arbitrary callback parameters must not be
 * copied from the reset URL to login/register links.
 */
export function getSafeAuthNavigationSearch(searchParams: URLSearchParams): string {
  const role = searchParams.get('role')?.trim();

  if (!role || !/^[a-z][a-z0-9_-]{0,31}$/i.test(role)) {
    return '';
  }

  return `?role=${encodeURIComponent(role)}`;
}
