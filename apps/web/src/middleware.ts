/**
 * Middleware de Astro para autenticación y protección de rutas.
 *
 * Security: Uses getUser() for server-side JWT verification.
 * Auth routes are checked BEFORE public routes to prevent authenticated users
 * from seeing login/register forms.
 */

import { logger } from "@autamedica/shared";
import type { AstroCookieSetOptions } from "astro";
import { defineMiddleware } from "astro:middleware";
import { detectLocale, LOCALE_COOKIE } from "./i18n/index";
import { isProduction, validateRedirectUrl } from "./lib/auth-utils";
import { initServerSentry } from "./lib/observability/sentry";
import { checkRateLimit } from "./lib/rate-limit";
import { primeRuntimeEnv, resolvePublicSupabaseEnv } from "./lib/runtime-env";
import {
  createSupabaseCookieClient,
  type CookieMethodsServer,
} from "./lib/supabase";
import "./lib/patients/services/clinical-orchestrator.service";
import "./lib/notifications/notification-triggers";
import "./lib/payments/triggers";

// Rutas que requieren autenticación
const PROTECTED_ROUTES = [
  "/profile",
  "/admin",
  "/settings",
  "/appointments",
  "/patients",
  "/doctors",
  "/pharmacy",
  "/companies",
];

// Rutas de autenticación (redirigen si ya está autenticado)
const AUTH_ROUTES = ["/auth/login", "/auth/register"];

// Rutas públicas que no requieren verificación
// NOTE: /auth/login and /auth/register are NOT here — they're handled by AUTH_ROUTES
// to ensure authenticated users get redirected to their dashboard.
const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
  "/privacidad",
  "/auth/callback",
  "/auth/select-role",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/api/health",
  "/verify",
  "/doctors/pricing",
  "/reserva-saude",
  "/planos",
  "/api/reserva-saude",
  "/call/join",
  // External webhooks: validated via their own secret (HMAC/Bearer) inside the handler.
  // They do NOT carry Supabase session cookies, so passing them through the Supabase
  // auth pipeline produces noisy "auth error, clearing session" logs (ASTRO-3).
  "/api/webhooks",
  // Calls API: guest bootstrap uses Bearer guest tokens, authenticated bootstrap uses
  // withAuth() inside the handler. The middleware-level Supabase check adds latency
  // and can produce false 401s for guests with valid guest tokens (ASTRO-A/9).
  "/api/calls",
  "/api/preanamnesis",
];

// Static showcase pages are prerendered at build time and should bypass
// request-header-dependent middleware logic entirely.
const STATIC_BUILD_BYPASS_ROUTES = new Set(["/design-system", "/showcase"]);

// ── RATE LIMITING CONFIG ──────────────────────────────────────────────────────
const AUTH_RATE_LIMIT_MAX = 20; // auth requests per window
const AUTH_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

const GENERAL_RATE_LIMIT_MAX = 120; // general requests per window (per IP)
const GENERAL_RATE_LIMIT_WINDOW_MS = 60_000;

const API_RATE_LIMIT_MAX = 60; // API requests per window (per IP)
const API_RATE_LIMIT_WINDOW_MS = 60_000;

// ── BOT DETECTION ────────────────────────────────────────────────────────────
const BLOCKED_BOT_PATTERNS = [
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /dotbot/i,
  /blexbot/i,
  /megaindex/i,
  /seekport/i,
  /serpstatbot/i,
  /zoominfobot/i,
  /dataforseo/i,
  /bytespider/i,
  /petalbot/i,
  /yandexbot/i,
  /sogou/i,
  /exabot/i,
  /claudebot/i,
  /gptbot/i,
  /ccbot/i,
  /anthropic-ai/i,
  /cohere-ai/i,
  /scrapy/i,
  /httpclient/i,
  /python-requests/i,
  /go-http-client/i,
  /java\//i,
  /libwww-perl/i,
];

// Good bots we allow (Google, Bing, etc.)
const ALLOWED_BOT_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /google-inspectiontool/i,
  /apis-google/i,
  /mediapartners-google/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /slackbot/i,
  /discordbot/i,
  /cloudflare/i,
];

function isBlockedBot(userAgent: string | null): boolean {
  if (!userAgent || userAgent.length < 5) return true; // empty/garbage UA
  if (ALLOWED_BOT_PATTERNS.some((p) => p.test(userAgent))) return false;
  return BLOCKED_BOT_PATTERNS.some((p) => p.test(userAgent));
}

// ── IP ABUSE TRACKING ────────────────────────────────────────────────────────
const abuseMap = new Map<string, { count: number; blockedUntil: number }>();
const ABUSE_THRESHOLD = 500; // requests in window to trigger temp block
const ABUSE_WINDOW_MS = 60_000; // 1 minute window
const ABUSE_BLOCK_DURATION_MS = 300_000; // block for 5 minutes
let lastAbuseCleanup = Date.now();

function checkAbuse(ip: string): "allowed" | "blocked" {
  const now = Date.now();

  // Periodic cleanup
  if (now - lastAbuseCleanup > 120_000) {
    lastAbuseCleanup = now;
    for (const [key, entry] of abuseMap) {
      if (
        now > entry.blockedUntil &&
        now - entry.blockedUntil > ABUSE_WINDOW_MS
      ) {
        abuseMap.delete(key);
      }
    }
  }

  const entry = abuseMap.get(ip);

  // Currently blocked
  if (entry?.blockedUntil && now < entry.blockedUntil) {
    return "blocked";
  }

  // Reset if window expired
  if (!entry || (entry.blockedUntil && now >= entry.blockedUntil)) {
    abuseMap.set(ip, { count: 1, blockedUntil: 0 });
    return "allowed";
  }

  entry.count++;

  if (entry.count > ABUSE_THRESHOLD) {
    entry.blockedUntil = now + ABUSE_BLOCK_DURATION_MS;
    logger.warn("[security] IP auto-blocked for abuse", {
      ip: ip.slice(0, 8) + "***",
      requests: entry.count,
      blockMinutes: ABUSE_BLOCK_DURATION_MS / 60_000,
    });
    return "blocked";
  }

  return "allowed";
}

// ── SECURITY HEADERS ──────────────────────────────────────────────────────────
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com https://platform.linkedin.com https://badges.linkedin.com https://badges.linkedin-ei.com https://www.googletagmanager.com https://www.google-analytics.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://*.doubleclick.net https://ad.doubleclick.net https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://static.licdn.com",
  "img-src 'self' data: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co wss://*.workers.dev https://*.workers.dev https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://www.google-analytics.com https://analytics.google.com https://google.com https://*.google.com https://www.google.com https://stats.g.doubleclick.net https://www.googleadservices.com https://googleads.g.doubleclick.net https://*.doubleclick.net https://ad.doubleclick.net https://accounts.google.com https://*.googleapis.com",
  "media-src 'self' blob:",
  "frame-src 'self' https://www.linkedin.com https://platform.linkedin.com https://badges.linkedin.com https://badges.linkedin-ei.com https://accounts.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://*.supabase.co",
].join("; ");

function applySecurityHeaders(response: Response): void {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=()",
  );
  
  let csp = CSP_DIRECTIVES;
  if (import.meta.env.DEV) {
    csp = csp.replace(
      "connect-src ",
      "connect-src http://localhost:54321 http://127.0.0.1:54321 ws://localhost:54321 ws://127.0.0.1:54321 "
    );
  }
  response.headers.set("Content-Security-Policy", csp);

  if (import.meta.env.PROD) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
}

/** Role → redirect URL. Prod uses subdomains, dev uses ?portal= query param. */
function getRoleRedirect(role: string): string {
  if (import.meta.env.PROD) {
    const PROD: Record<string, string> = {
      patient: "https://paciente.autamedica.com",
      doctor: "https://doctor.autamedica.com",
      company: "https://empresa.autamedica.com",
      company_admin: "https://empresa.autamedica.com",
      organization_admin: "https://admin.autamedica.com",
      platform_admin: "https://admin.autamedica.com",
      pharmacist: "https://farmacia.autamedica.com",
      admin: "https://admin.autamedica.com",
    };
    return PROD[role] ?? "/auth/select-role";
  }
  const DEV_PORTALS: Record<string, string> = {
    patient: "patient",
    doctor: "doctor",
    company: "company",
    pharmacist: "pharmacy",
    company_admin: "company",
    admin: "admin",
    organization_admin: "admin",
    platform_admin: "admin",
  };
  const portal = DEV_PORTALS[role];
  return portal ? `/?portal=${portal}` : "/auth/select-role";
}

// Unified legacy redirects: handles both exact match (/empresa → /companies)
// and prefix+subpath (/empresa/foo → /companies/foo) in a single loop.
const LEGACY_REDIRECTS: Record<string, string> = {
  "/login": "/auth/login",
  "/signin": "/auth/login",
  "/ingresar": "/auth/login",
  "/register": "/auth/register",
  "/registro": "/auth/register",
  "/signup": "/auth/register",
  "/app": "/platform",
  "/web-app": "/platform",
  "/webapp": "/platform",
  "/company": "/companies",
  "/empresa": "/companies",
  "/empresas": "/companies",
  "/patient": "/patients",
  "/paciente": "/patients",
  "/pacientes": "/patients",
  "/doctor": "/doctors",
  "/médico": "/doctors",
  "/médicos": "/doctors",
  "/doctores": "/doctors",
  "/portal/admin": "/admin",
  "/portals/admin": "/admin",
  "/portal/patients": "/patients",
  "/portal/pacientes": "/patients",
  "/portal/doctors": "/doctors",
  "/portal/médicos": "/doctors",
  "/portal/companies": "/companies",
  "/portal/empresas": "/companies",
  "/portals/patients": "/patients",
  "/portals/pacientes": "/patients",
  "/portals/doctors": "/doctors",
  "/portals/médicos": "/doctors",
  "/portals/companies": "/companies",
  "/portals/empresas": "/companies",
};

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isProtectedPath(pathname: string): boolean {
  const normalizedPath = normalizePath(pathname);

  return PROTECTED_ROUTES.some((route) => {
    const normalizedRoute = normalizePath(route);
    return (
      normalizedPath === normalizedRoute ||
      normalizedPath.startsWith(`${normalizedRoute}/`)
    );
  });
}

/** Type-safe role extraction from user metadata */
function extractRole(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  const raw = metadata?.role;
  return typeof raw === "string" ? raw : undefined;
}

function isAdminRole(role: string | undefined): boolean {
  return role === "admin" || role === "organization_admin" || role === "platform_admin";
}

/** Resolve returnTo from query params, validating against allowed hosts. */
function resolveReturnTo(
  requestUrl: URL,
  roleRedirectBase: string,
): string | null {
  const returnTo = requestUrl.searchParams.get("returnTo");
  if (!returnTo) return null;

  // Relative path: attach to the role's redirect base
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    try {
      const base = roleRedirectBase.startsWith("http")
        ? roleRedirectBase
        : new URL(roleRedirectBase, requestUrl.origin).toString();
      return new URL(returnTo, base).toString();
    } catch {
      return null;
    }
  }

  // Absolute URL: validate against allowed hosts
  return validateRedirectUrl(returnTo) ? returnTo : null;
}

/** Detect portal from hostname (prod) or ?portal= query param (dev) */
function detectPortal(url: URL): string | null {
  // Dev override: ?portal=doctor|patient|company
  if (!import.meta.env.PROD && url.searchParams.has("portal")) {
    return url.searchParams.get("portal");
  }
  if (
    url.hostname === "doctor.autamedica.com" ||
    url.hostname === "doctors.autamedica.com"
  ) {
    return "doctor";
  }
  if (
    url.hostname === "paciente.autamedica.com" ||
    url.hostname === "patients.autamedica.com"
  ) {
    return "patient";
  }
  if (
    url.hostname === "farmacia.autamedica.com" ||
    url.hostname === "pharmacy.autamedica.com"
  ) {
    return "pharmacist";
  }
  if (
    url.hostname === "empresa.autamedica.com" ||
    url.hostname === "companies.autamedica.com"
  ) {
    return "company";
  }
  return null;
}

function getAuthCookieDebug(request: Request): {
  hasAuthCookies: boolean;
  authCookieNames: string[];
} {
  const rawCookieHeader = request.headers.get("cookie") ?? "";
  const authCookieNames = rawCookieHeader
    .split("; ")
    .map((entry) => entry.split("=")[0])
    .filter((name) => name.startsWith("sb-"));

  return {
    hasAuthCookies: authCookieNames.length > 0,
    authCookieNames,
  };
}

export const onRequest = defineMiddleware(async (context, next) => {
  primeRuntimeEnv(context.locals.runtime?.env);
  initServerSentry(context.locals.runtime?.env);

  const requestUrl = new URL(context.request.url);
  const { pathname } = requestUrl;

  // Wrap next() so every response gets security headers applied
  const secureNext = async (): Promise<Response> => {
    const response = await next();
    applySecurityHeaders(response);
    return response;
  };

  if (STATIC_BUILD_BYPASS_ROUTES.has(normalizePath(pathname))) {
    return secureNext();
  }

  // ── CLIENT IP (used by all security checks below) ──────────────────────────
  const clientIp =
    context.request.headers.get("cf-connecting-ip") ??
    context.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  // ── BOT DETECTION ──────────────────────────────────────────────────────────
  const userAgent = context.request.headers.get("user-agent");
  if (isBlockedBot(userAgent)) {
    const response = new Response("Forbidden", { status: 403 });
    applySecurityHeaders(response);
    return response;
  }

  // ── IP ABUSE AUTO-BLOCK ────────────────────────────────────────────────────
  if (checkAbuse(clientIp) === "blocked") {
    const response = new Response(
      JSON.stringify({ error: "Too many requests" }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "300" },
      },
    );
    applySecurityHeaders(response);
    return response;
  }

  // ── RATE LIMITING (tiered) ─────────────────────────────────────────────────

  // Auth endpoints: strictest (20 req/min)
  if (pathname.startsWith("/api/auth/")) {
    const rateLimitKey = `${clientIp}:auth`;
    if (
      !checkRateLimit(
        rateLimitKey,
        AUTH_RATE_LIMIT_MAX,
        AUTH_RATE_LIMIT_WINDOW_MS,
      )
    ) {
      const response = new Response(
        JSON.stringify({ error: "Too many requests" }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "60" },
        },
      );
      applySecurityHeaders(response);
      return response;
    }
  }

  // All API endpoints: medium (60 req/min)
  if (pathname.startsWith("/api/")) {
    const rateLimitKey = `${clientIp}:api`;
    if (
      !checkRateLimit(
        rateLimitKey,
        API_RATE_LIMIT_MAX,
        API_RATE_LIMIT_WINDOW_MS,
      )
    ) {
      const response = new Response(
        JSON.stringify({ error: "Too many requests" }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "60" },
        },
      );
      applySecurityHeaders(response);
      return response;
    }
  }

  // General pages: relaxed (120 req/min) — catches aggressive scrapers
  {
    const rateLimitKey = `${clientIp}:general`;
    if (
      !checkRateLimit(
        rateLimitKey,
        GENERAL_RATE_LIMIT_MAX,
        GENERAL_RATE_LIMIT_WINDOW_MS,
      )
    ) {
      const response = new Response(
        JSON.stringify({ error: "Too many requests" }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "60" },
        },
      );
      applySecurityHeaders(response);
      return response;
    }
  }

  const portal = detectPortal(requestUrl);
  const authCookieDebug = getAuthCookieDebug(context.request);
  const isDoctorHost = portal === "doctor";
  const isPatientHost = portal === "patient";
  const isPharmacyHost = portal === "pharmacist";
  const isCompanyHost = portal === "company";
  const isDoctorHostRoot = isDoctorHost && pathname === "/";
  const isPatientHostRoot = isPatientHost && pathname === "/";
  const isPharmacyHostRoot = isPharmacyHost && pathname === "/";
  const isCompanyHostRoot = isCompanyHost && pathname === "/";
  const isPortalHostRoot =
    isDoctorHostRoot ||
    isPatientHostRoot ||
    isPharmacyHostRoot ||
    isCompanyHostRoot;

  // Doctor portal: normalize dashboard paths to /
  if (
    isDoctorHost &&
    !pathname.startsWith("/_astro/") &&
    !pathname.includes(".")
  ) {
    if (
      pathname === "/dashboard" ||
      pathname === "/doctors" ||
      pathname === "/doctors/dashboard"
    ) {
      const doctorRootUrl = new URL("/", requestUrl);
      doctorRootUrl.search = requestUrl.search;
      return context.redirect(doctorRootUrl.toString(), 302);
    }
  }

  // Patient portal: normalize dashboard paths to /
  if (
    isPatientHost &&
    !pathname.startsWith("/_astro/") &&
    !pathname.includes(".")
  ) {
    if (
      pathname === "/dashboard" ||
      pathname === "/patients" ||
      pathname === "/patients/dashboard"
    ) {
      const patientRootUrl = new URL("/", requestUrl);
      patientRootUrl.search = requestUrl.search;
      return context.redirect(patientRootUrl.toString(), 302);
    }
  }

  // Pharmacy portal: normalize dashboard paths
  if (
    isPharmacyHost &&
    !pathname.startsWith("/_astro/") &&
    !pathname.includes(".")
  ) {
    if (pathname === "/dashboard" || pathname === "/pharmacy/dashboard") {
      const pharmacyRootUrl = new URL("/pharmacy/dashboard", requestUrl);
      pharmacyRootUrl.search = requestUrl.search;
      if (pathname !== "/pharmacy/dashboard") {
        return context.redirect(pharmacyRootUrl.toString(), 302);
      }
    }
  }

  // SEO canonical host enforcement: redirect legacy/bare domains to www.autamedica.com
  if (
    import.meta.env.PROD &&
    (requestUrl.hostname === "autamedica.com" ||
      requestUrl.hostname === "autamedica-web.pages.dev")
  ) {
    const canonicalUrl = new URL(requestUrl.toString());
    canonicalUrl.hostname = "www.autamedica.com";
    return context.redirect(canonicalUrl.toString(), 308);
  }

  // Direct Google Play Store download routes (instant 302 redirect directly to store with UTM attribution)
  if (pathname === "/descargar" || pathname === "/play" || pathname === "/playstore") {
    const rawRef = requestUrl.searchParams.get("ref") || "";
    const utmSource = requestUrl.searchParams.get("utm_source") || (rawRef ? `ref_${rawRef}` : "direct");
    const utmMedium = requestUrl.searchParams.get("utm_medium") || "shortlink";
    const utmCampaign = requestUrl.searchParams.get("utm_campaign") || "playstore_direct";
    const utmContent = requestUrl.searchParams.get("utm_content") || "";
    const utmTerm = requestUrl.searchParams.get("utm_term") || "";

    const referrerParts = [
      `utm_source=${encodeURIComponent(utmSource)}`,
      `utm_medium=${encodeURIComponent(utmMedium)}`,
      `utm_campaign=${encodeURIComponent(utmCampaign)}`,
    ];
    if (utmContent) referrerParts.push(`utm_content=${encodeURIComponent(utmContent)}`);
    if (utmTerm) referrerParts.push(`utm_term=${encodeURIComponent(utmTerm)}`);

    const encodedReferrer = encodeURIComponent(referrerParts.join("&"));
    const playStoreUrl = `https://play.google.com/store/apps/details?id=com.autamedica.android&referrer=${encodedReferrer}&hl=es_419`;

    return context.redirect(playStoreUrl, 302);
  }

  // Unified legacy redirect: exact match + prefix+subpath in one pass
  for (const [legacy, target] of Object.entries(LEGACY_REDIRECTS)) {
    if (pathname === legacy) {
      const redirectUrl = new URL(target, context.request.url);
      redirectUrl.search = requestUrl.search;
      return context.redirect(redirectUrl.toString(), 301);
    }
    if (pathname.startsWith(`${legacy}/`)) {
      const rest = pathname.slice(legacy.length);
      const redirected = new URL(`${target}${rest}`, context.request.url);
      redirected.search = requestUrl.search;
      return context.redirect(redirected.toString(), 301);
    }
  }

  // Intercept OAuth redirects that land outside /auth/callback
  // Captura cualquier retorno OAuth con `code` que haya aterrizado en la raíz u otra ruta
  if (
    pathname !== "/auth/callback" &&
    requestUrl.searchParams.has("code")
  ) {
    const callbackUrl = new URL("/auth/callback", context.request.url);
    callbackUrl.search = requestUrl.search;
    return context.redirect(callbackUrl.toString(), 302);
  }

  // Intercept OAuth error redirects from Supabase landing on root (SITE_URL)
  if (
    pathname === "/" &&
    (requestUrl.searchParams.has("error") ||
      requestUrl.searchParams.has("error_code") ||
      requestUrl.searchParams.has("error_description"))
  ) {
    const loginErrorUrl = new URL("/auth/login", context.request.url);
    loginErrorUrl.search = requestUrl.search;
    return context.redirect(loginErrorUrl.toString(), 302);
  }

  // Skip auth for static assets
  if (pathname.startsWith("/_astro/") || pathname.includes(".")) {
    return secureNext();
  }

  // ── LOCALE DETECTION ────────────────────────────────────────────────────────
  // Prioridad: cookie au-locale > CF-IPCountry (Cloudflare) > Accept-Language > 'es'
  {
    const rawCookies = context.request.headers.get("cookie");
    const cfIpCountry = context.request.headers.get("CF-IPCountry");
    const acceptLanguage = context.request.headers.get("Accept-Language");

    const locale = detectLocale(rawCookies, cfIpCountry, acceptLanguage);
    context.locals.locale = locale;

    // Persistir en cookie solo si no coincide (evita escribir en cada request)
    const savedLocale = rawCookies?.match(/au-locale=([^;]+)/)?.[1]?.trim();
    if (savedLocale !== locale) {
      context.cookies.set(LOCALE_COOKIE, locale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 ano
        sameSite: "lax",
        secure: import.meta.env.PROD,
        httpOnly: false, // legible por LanguageSwitcher en el cliente
      } as AstroCookieSetOptions);
    }
  }
  // ── FIN LOCALE DETECTION ────────────────────────────────────────────────────

  // Check if this is an auth route (login/register) — these need special handling
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route);

  // Public routes that are NOT auth routes — skip auth entirely
  // Si es la raíz y tiene cookies de sesión, no saltamos para poder redirigirlo.
  const isRootWithSession = pathname === "/" && authCookieDebug.hasAuthCookies;

  if (
    !isAuthRoute &&
    !isPortalHostRoot &&
    !isRootWithSession &&
    PUBLIC_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    )
  ) {
    return secureNext();
  }

  const isLocalDevAdminBypass =
    import.meta.env.DEV &&
    ["localhost", "127.0.0.1"].includes(requestUrl.hostname) &&
    (pathname.startsWith("/admin") || pathname.startsWith("/api/admin/"));

  if (isLocalDevAdminBypass) {
    logger.warn(
      "[DEV_ADMIN_BYPASS] Local-only admin bypass active",
      { pathname },
    );
    return secureNext();
  }

  // Everything below requires auth verification
  try {
    const { publicSupabaseUrl, publicSupabaseAnonKey } =
      resolvePublicSupabaseEnv(context.locals.runtime?.env);

    if (!publicSupabaseUrl || !publicSupabaseAnonKey) {
      throw new Error(
        `[middleware] Missing env: PUBLIC_SUPABASE_URL=${!!publicSupabaseUrl}, ` +
          `PUBLIC_SUPABASE_ANON_KEY=${!!publicSupabaseAnonKey}.`,
      );
    }

    const cookieMethods: CookieMethodsServer = {
      getAll() {
        const cookieHeader = context.request.headers.get("cookie") ?? "";
        if (!cookieHeader) return [];
        return cookieHeader.split("; ").map((c) => {
          const eq = c.indexOf("=");
          return {
            name: eq >= 0 ? c.slice(0, eq) : c,
            value: eq >= 0 ? c.slice(eq + 1) : "",
          };
        });
      },
      setAll(cookiesToSet) {
        const reqHostname = requestUrl.hostname;
        const useDomainOverride = isProduction() && (reqHostname === 'autamedica.com' || reqHostname.endsWith('.autamedica.com'));
        const domainOverride = useDomainOverride ? ".autamedica.com" : undefined;
        for (const { name, value, options } of cookiesToSet) {
          context.cookies.set(name, value, {
            ...options,
            domain: domainOverride,
            path: "/",
          } as AstroCookieSetOptions);
        }
      },
    };

    const supabase = createSupabaseCookieClient(
      publicSupabaseUrl,
      publicSupabaseAnonKey,
      cookieMethods,
    );

    // Server-side verification: getUser() validates JWT against Supabase server
    // (unlike getSession() which only reads local cookie data without verification)
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      // Rate-limit or transient server errors: do NOT clear cookies — the session
      // may still be valid. Only clear on definitive auth failures (invalid JWT, etc.).
      const isTransient =
        /rate.limit|too.many|429|5\d\d|timeout|econnrefused|enotfound|fetch.failed|network/i.test(
          error.message ?? "",
        );
      if (isTransient) {
        logger.warn(
          "Middleware auth: transient error, preserving session cookies",
          {
            msg: error.message,
            pathname,
            portal,
            ...authCookieDebug,
          },
        );
      } else {
        logger.error("Middleware auth error, clearing session:", {
          pathname,
          portal,
          ...authCookieDebug,
          error,
        });
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    // Get session for locals (only trust it if getUser succeeded)
    const {
      data: { session },
    } = await supabase.auth.getSession();
    context.locals.session = user ? session : null;
    context.locals.supabase = supabase;

    const isAuthenticated = !!user;

    // Redirigir a usuarios logueados que acceden a la landing raíz "/"
    // Pero solo si están en el dominio principal (no en los subdominios de portal como doctor.autamedica.com)
    if (pathname === "/" && isAuthenticated && !portal) {
      const userRole =
        extractRole(user.app_metadata as Record<string, unknown>) ??
        (await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle()).data?.role ??
        undefined;
      if (userRole) {
        const roleRedirect = getRoleRedirect(userRole);
        return context.redirect(roleRedirect);
      }
    }

    // Auth routes: redirect authenticated users to their dashboard
    if (isAuthRoute) {
      if (isAuthenticated) {
        const userRole =
          extractRole(user.app_metadata as Record<string, unknown>) ??
          (await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle()).data?.role ??
          undefined;
        if (!userRole) {
          return context.redirect("/auth/select-role");
        }
        const roleRedirect = getRoleRedirect(userRole);
        if (isAdminRole(userRole)) {
          return context.redirect(roleRedirect);
        }
        const returnToUrl = resolveReturnTo(requestUrl, roleRedirect);
        return context.redirect(returnToUrl ?? roleRedirect);
      }
      // Not authenticated — show login/register form
      return secureNext();
    }

    // Protected routes: redirect unauthenticated users to login
    const isProtectedRoute = isProtectedPath(pathname) || isPortalHostRoot;

    if (!isAuthenticated && isProtectedRoute) {
      if (import.meta.env.DEV && import.meta.env.AUTH_BYPASS === "true") {
        logger.warn(
          "[AUTH_BYPASS] Development-only bypass active — NEVER enable in production",
          {
            pathname,
            portal,
            ...authCookieDebug,
          },
        );
        return secureNext();
      }

      logger.info(
        "Middleware auth: redirecting unauthenticated request to login",
        {
          pathname,
          portal,
          ...authCookieDebug,
        },
      );

      let loginPortal = "patients";
      if (isDoctorHostRoot || pathname.startsWith("/doctors"))
        loginPortal = "doctors";
      else if (isPharmacyHost || pathname.startsWith("/pharmacy"))
        loginPortal = "pharmacy";
      else if (isCompanyHost || pathname.startsWith("/companies"))
        loginPortal = "companies";
      else if (pathname.startsWith("/admin")) loginPortal = "admin";

      const loginUrl = new URL("/auth/login", context.request.url);
      loginUrl.searchParams.set(
        "returnTo",
        isPortalHostRoot ? requestUrl.origin + "/" : pathname + requestUrl.search,
      );
      loginUrl.searchParams.set("portal", loginPortal);

      return context.redirect(loginUrl.toString());
    }

    // Role-based access control for protected routes
    if (isAuthenticated && isProtectedRoute) {
      const userRole =
        extractRole(user.app_metadata as Record<string, unknown>) ??
        (await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle()).data?.role ??
        undefined;

      if (!userRole) {
        return context.redirect("/auth/select-role");
      }

      if (
        pathname.startsWith("/admin") &&
        !["organization_admin", "platform_admin", "admin"].includes(userRole)
      ) {
        return context.redirect(getRoleRedirect(userRole));
      }

      if (
        (isDoctorHostRoot || pathname.startsWith("/doctors")) &&
        !["doctor", "organization_admin", "platform_admin", "admin"].includes(
          userRole,
        )
      ) {
        return context.redirect(getRoleRedirect(userRole));
      }

      if (
        (isPatientHostRoot || pathname.startsWith("/patients")) &&
        !["patient", "organization_admin", "platform_admin", "admin"].includes(
          userRole,
        )
      ) {
        return context.redirect(getRoleRedirect(userRole));
      }

      if (
        pathname.startsWith("/pharmacy") &&
        !["pharmacist", "platform_admin", "admin"].includes(userRole)
      ) {
        return context.redirect(getRoleRedirect(userRole));
      }

      if (
        (isCompanyHostRoot || pathname.startsWith("/companies")) &&
        ![
          "company",
          "company_admin",
          "organization_admin",
          "platform_admin",
          "admin",
        ].includes(userRole)
      ) {
        return context.redirect(getRoleRedirect(userRole));
      }
    }

    return secureNext();
  } catch (err) {
    logger.error("Middleware error:", err);

    if (isProtectedPath(pathname) || isPortalHostRoot) {
      let loginPortal = "patients";
      if (isDoctorHostRoot || pathname.startsWith("/doctors"))
        loginPortal = "doctors";
      else if (isPharmacyHost || pathname.startsWith("/pharmacy"))
        loginPortal = "pharmacy";
      else if (isCompanyHost || pathname.startsWith("/companies"))
        loginPortal = "companies";
      else if (pathname.startsWith("/admin")) loginPortal = "admin";

      const loginUrl = new URL("/auth/login", context.request.url);
      loginUrl.searchParams.set(
        "returnTo",
        isPortalHostRoot ? requestUrl.origin + "/" : pathname + requestUrl.search,
      );
      loginUrl.searchParams.set("portal", loginPortal);
      return context.redirect(loginUrl.toString());
    }

    return secureNext();
  }
});
