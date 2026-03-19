/**
 * Redirect validation to prevent open redirect vulnerabilities
 * Validates URLs against whitelist patterns
 */

/**
 * Get allowed redirect patterns from environment
 * Example: "https://autamedica-*.pages.dev,https://*.autamedica.com"
 */
function getAllowedPatterns(): string[] {
  const envPatterns = process.env.NEXT_PUBLIC_ALLOWED_REDIRECTS || '';
  const patterns = envPatterns
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Always include our known Cloudflare Pages URLs
  const defaultPatterns = [
    process.env.NEXT_PUBLIC_BASE_URL_PATIENTS,
    process.env.NEXT_PUBLIC_BASE_URL_DOCTORS,
    process.env.NEXT_PUBLIC_BASE_URL_COMPANIES,
    process.env.NEXT_PUBLIC_BASE_URL_ADMIN,
    process.env.NEXT_PUBLIC_BASE_URL_WEB_APP,
  ].filter((url): url is string => Boolean(url));

  return [...patterns, ...defaultPatterns];
}

function buildWildcardRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // Wildcards are limited to a single host/path segment to avoid open-redirect overreach.
  const wildcardSafe = escaped.replace(/\\\*/g, '[^./?#]+');
  return new RegExp(`^${wildcardSafe}$`, 'i');
}

function matchesExactPattern(url: URL, pattern: string): boolean {
  try {
    const allowed = new URL(pattern);
    if (url.origin !== allowed.origin) {
      return false;
    }

    // Origin-only patterns allow any path on the same origin.
    if (allowed.pathname === '/' && !allowed.search && !allowed.hash) {
      return true;
    }

    // If query/hash are specified in pattern, require exact URL match.
    if (allowed.search || allowed.hash) {
      return url.href === allowed.href;
    }

    // Path-based pattern: allow exact path or nested routes.
    const allowedPath = allowed.pathname.endsWith('/')
      ? allowed.pathname
      : `${allowed.pathname}/`;
    return url.pathname === allowed.pathname || url.pathname.startsWith(allowedPath);
  } catch {
    return false;
  }
}

/**
 * Check if a URL is allowed for redirect
 * Prevents open redirect vulnerabilities
 */
export function isAllowedRedirect(urlStr?: string | null): boolean {
  if (!urlStr) {
    return false;
  }

  try {
    const url = new URL(urlStr);
    const patterns = getAllowedPatterns();

    return patterns.some(pattern => {
      if (!pattern) return false;

      // Exact match
      if (matchesExactPattern(url, pattern)) {
        return true;
      }

      // Wildcard pattern match (e.g., https://autamedica-*.pages.dev)
      if (pattern.includes('*')) {
        const regex = buildWildcardRegex(pattern);
        return regex.test(url.origin) || regex.test(url.href);
      }

      return false;
    });
  } catch {
    // Invalid URL
    return false;
  }
}

/**
 * Get safe redirect URL or fallback
 * Use this for all redirect operations
 */
export function safeRedirectOrFallback(
  urlStr: string | null | undefined,
  fallback: string
): string {
  if (!urlStr) {
    return fallback;
  }

  return isAllowedRedirect(urlStr) ? urlStr : fallback;
}

function normalizeOrigin(urlValue: string): string | null {
  try {
    const parsed = new URL(urlValue);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function inferFallbackAuthOrigin(returnTo?: string | null): string {
  if (returnTo) {
    try {
      const returnToUrl = new URL(returnTo);
      if (returnToUrl.hostname === 'localhost' || returnToUrl.hostname === '127.0.0.1') {
        // Auth hub local por convención en este monorepo.
        return 'http://localhost:3005';
      }
    } catch {
      // Ignore invalid returnTo and use production-safe default.
    }
  }

  return 'https://www.autamedica.com';
}

function resolveAuthBaseOrigin(returnTo?: string | null): string {
  const candidates = [
    process.env.NEXT_PUBLIC_BASE_URL_AUTH,
    process.env.NEXT_PUBLIC_AUTH_URL,
    process.env.NEXT_PUBLIC_BASE_URL_WEB,
    process.env.NEXT_PUBLIC_SITE_URL,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const origin = normalizeOrigin(candidate);
    if (!origin) continue;

    // Skip localhost — dev-only values baked at build time must never leak into production auth redirects
    try {
      const hostname = new URL(origin).hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') continue;
    } catch {
      continue;
    }

    return origin;
  }

  return inferFallbackAuthOrigin(returnTo);
}

/**
 * Build safe login redirect URL
 * Ensures returnTo parameter is validated
 */
export function buildSafeLoginUrl(
  portal: string,
  returnTo?: string | null,
  error?: string
): string {
  const baseOrigin = resolveAuthBaseOrigin(returnTo);
  const loginUrl = new URL('/auth/login', baseOrigin);

  loginUrl.searchParams.set('portal', portal);

  if (returnTo && isAllowedRedirect(returnTo)) {
    loginUrl.searchParams.set('returnTo', returnTo);
  }

  if (error) {
    loginUrl.searchParams.set('error', error);
  }

  return loginUrl.toString();
}

/**
 * Check if two URLs are from the same origin
 * Used for security checks in redirects
 */
export function isSameOrigin(url1: string, url2: string): boolean {
  try {
    const urlA = new URL(url1);
    const urlB = new URL(url2);
    return urlA.origin === urlB.origin;
  } catch {
    return false;
  }
}

/**
 * Sanitize return URL by validating and normalizing
 * Returns null if URL is invalid or not allowed
 */
export function sanitizeReturnUrl(urlStr?: string | null): string | null {
  if (!urlStr) {
    return null;
  }

  // Trim whitespace
  const trimmed = urlStr.trim();

  // Must be absolute URL or relative path starting with /
  if (!trimmed.startsWith('http') && !trimmed.startsWith('/')) {
    return null;
  }

  // If absolute URL, check if allowed
  if (trimmed.startsWith('http')) {
    return isAllowedRedirect(trimmed) ? trimmed : null;
  }

  // Relative URL - ensure it's safe (no protocol-relative URLs)
  if (trimmed.startsWith('//')) {
    return null;
  }

  return trimmed;
}
