import { logger } from './services/logger.service';

/**
 * Reference to process object (undefined in browser)
 */
const processRef = typeof process !== 'undefined' ? process : null;

/**
 * Resolve a client env var by name.
 * All client vars use the PUBLIC_* prefix (Astro convention).
 */
function resolveClientEnv(name: string): string | undefined {
  return processRef?.env?.[name] ?? undefined;
}

/**
 * Check if the current environment is production
 * @returns true if NODE_ENV is 'production'
 */
export function isProduction(): boolean {
  const env = processRef?.env?.NODE_ENV;
  if (env) {
    return env === 'production';
  }

  // Browser fallback: any non-localhost host is treated as production.
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    return host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local');
  }

  // Server fallback when NODE_ENV is unavailable.
  return true;
}

/**
 * Check if the current environment is development
 * @returns true if NODE_ENV is 'development' or browser host is localhost
 */
export function isDevelopment(): boolean {
  const env = processRef?.env?.NODE_ENV;
  if (env) {
    return env === 'development';
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  }

  return false;
}

// Tipos de configuración de entorno
export interface EnvironmentConfig {
  // Variables públicas (cliente)
  client: {
    apiUrl: string;
    appUrl: string;
    siteUrl: string;
    supabase: {
      url: string;
      anonKey: string;
    };
    recaptcha?: {
      siteKey: string;
    };
    analytics?: {
      sentryDsn?: string;
      gaTrackingId?: string;
    };
  };

  // Variables privadas (servidor)
  server: {
    supabase: {
      url: string;
      serviceRoleKey: string;
    };
    jwt: {
      secret: string;
      refreshSecret: string;
    };
    urls: {
      api: string;
      webApp: string;
    };
    security: {
      phiEncryptionKey: string;
      adminSecret: string;
    };
    external?: {
      openaiApiKey?: string;
      sendgridApiKey?: string;
    };
  };
}

// Lista de variables client-side permitidas (PUBLIC_* prefix — Astro convention)
const ALLOWED_CLIENT_VARS = new Set([
  // URLs y configuración pública
  "PUBLIC_API_URL",
  "PUBLIC_APP_URL",
  "PUBLIC_AUTH_HUB_URL",
  "PUBLIC_AUTH_HUB_DEV_URL",
  "PUBLIC_SITE_URL",
  "PUBLIC_DOCTORS_URL",
  "PUBLIC_DOCTORS_DEV_URL",
  "PUBLIC_PATIENTS_URL",
  "PUBLIC_PATIENTS_DEV_URL",
  "PUBLIC_COMPANIES_URL",
  "PUBLIC_SIGNALING_URL",
  "PUBLIC_AUTH_DEV_BYPASS",

  // Supabase (cliente)
  "PUBLIC_SUPABASE_URL",
  "PUBLIC_SUPABASE_ANON_KEY",

  // Auth callback
  "PUBLIC_AUTH_CALLBACK_URL",

  // Monitoring (cliente)
  "PUBLIC_SENTRY_DSN",

  // reCAPTCHA (cliente)
  "PUBLIC_RECAPTCHA_SITE_KEY",
  "PUBLIC_RECAPTCHA_SITE_KEY_WEB",
  "PUBLIC_RECAPTCHA_SITE_KEY_IOS",
  "PUBLIC_RECAPTCHA_SITE_KEY_ANDROID",

  // Maps y geolocalización (cliente)
  "PUBLIC_GOOGLE_MAPS_API_KEY",
  "PUBLIC_MAPBOX_ACCESS_TOKEN",

  // WebRTC y telemedicina (cliente)
  "PUBLIC_ICE_SERVERS",
  "PUBLIC_STUN_SERVER",
  "PUBLIC_WEBRTC_SIGNALING_URL",
  "PUBLIC_MEDIASOUP_URL",

  // IA (cliente)
  // OpenAI credentials are server-only. Never add a PUBLIC_OPENAI_API_KEY.

  // ONNX (cliente)
  "PUBLIC_AUTA_ONNX",
  "PUBLIC_AUTA_ONNX_MODEL",

  // Feature flags (cliente)
  "PUBLIC_AI_PREDICTOR_ENABLED",
  "PUBLIC_PATIENT_CRYSTAL_BALL_ENABLED",
  "PUBLIC_DIGITAL_PRESCRIPTION_ENABLED",
  "PUBLIC_AI_ASSISTANT_ENABLED",
  "PUBLIC_MARKETPLACE_ENABLED",
  "PUBLIC_HOSPITAL_REDISTRIBUTION_ENABLED",
  "PUBLIC_WHATSAPP_BUSINESS_ENABLED",
  "PUBLIC_IOT_SENSORS_ENABLED",
  "PUBLIC_HOSPITAL_API_ENABLED",
  "PUBLIC_ADMIN_PANEL_ENABLED",
  "PUBLIC_PROMETHEUS_ENABLED",
  "PUBLIC_HIPAA_AUDIT_ENABLED",
  "PUBLIC_REQUIRE_AUTH",
  "PUBLIC_DATABASE_ADMIN_ENABLED",
  "PUBLIC_AUDIT_LOGS_ENABLED",
]);

// Lista de variables server-only prohibidas en cliente (variables que NO deben ser expuestas como PUBLIC_)
const SERVER_ONLY_VARS = new Set([
  // Secrets críticos de seguridad
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "ENCRYPTION_KEY",
  "SESSION_SECRET",
  "NEXTAUTH_SECRET",

  // Base de datos y cache
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "REDIS_URL",
  "UPSTASH_REDIS_REST_TOKEN",

  // IA y servicios externos
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",

  // Pagos MercadoPago
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_WEBHOOK_SECRET",
  "MERCADOPAGO_TEST_ACCESS_TOKEN",

  // WebRTC sensibles
  "TURN_PASSWORD",
  "TURN_SECRET",

  // Email y comunicaciones
  "SMTP_PASS",
  "WHATSAPP_BUSINESS_TOKEN",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",

  // reCAPTCHA secret
  "RECAPTCHA_SECRET_KEY",

  // Sentry auth
  "SENTRY_AUTH_TOKEN",
]);

// Utilidad genérica para variables de entorno obligatorias (compatibilidad hacia atrás)
export function ensureEnv(name: string): string {
  if (typeof name !== 'string' || name.length === 0) {
    const err = new Error(
      `[env] ensureEnv called with invalid name (${String(name)}). ` +
        `The caller must pass a string literal, e.g. ensureEnv('MY_VAR').`,
    );
    // Preserve the caller frame so Sentry can attribute the bug to the real offender.
    Error.captureStackTrace?.(err, ensureEnv);
    throw err;
  }
  const value = processRef?.env?.[name];
  if (!value) {
    const err = new Error(`Missing required environment variable: ${name}`);
    Error.captureStackTrace?.(err, ensureEnv);
    throw err;
  }
  return value;
}

function assertClientEnvAllowed(name: string) {
  if (!ALLOWED_CLIENT_VARS.has(name)) {
    throw new Error(
      `Invalid client environment variable: ${name}. Only approved PUBLIC_* variables are allowed on client side.`,
    );
  }

  const bareName = name.replace("PUBLIC_", "");
  if (SERVER_ONLY_VARS.has(bareName)) {
    throw new Error(
      `Security violation: ${name} appears to be a server-only variable exposed to client`,
    );
  }
}

// Mapa de variables de entorno del cliente para acceso estático.
const CLIENT_ENV_MAP: Record<string, string | undefined> = Array.from(ALLOWED_CLIENT_VARS).reduce(
  (acc, key) => {
    acc[key] = resolveClientEnv(key);
    return acc;
  },
  {} as Record<string, string | undefined>
);

// window.__ENV is injected at runtime by Astro layouts (Layout.astro, AuthLayout.astro).
// It carries PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY for browser environments
// where process.env is unavailable (Cloudflare Workers, Astro islands).
const windowEnv: Record<string, string> | undefined =
  typeof window !== 'undefined'
    ? (window as unknown as { __ENV?: Record<string, string> }).__ENV
    : undefined;

// Safe accessor: process.env is unavailable in browser/Cloudflare Workers.
// Using typeof guard avoids ReferenceError when process is not defined at all.
const processEnv: Record<string, string | undefined> | undefined =
  typeof process !== 'undefined' ? process.env as Record<string, string | undefined> : undefined;

// Helper to read known client env keys via direct property access (Vite/Astro inlining).
function readKnownClientEnv(name: string): string | undefined {
  switch (name) {
    case 'PUBLIC_SUPABASE_URL':
      return processEnv?.PUBLIC_SUPABASE_URL ?? windowEnv?.['PUBLIC_SUPABASE_URL'];
    case 'PUBLIC_SUPABASE_ANON_KEY':
      return processEnv?.PUBLIC_SUPABASE_ANON_KEY ?? windowEnv?.['PUBLIC_SUPABASE_ANON_KEY'];
    case 'PUBLIC_AUTH_HUB_URL':
      return processEnv?.PUBLIC_AUTH_HUB_URL;
    case 'PUBLIC_AUTH_HUB_DEV_URL':
      return processEnv?.PUBLIC_AUTH_HUB_DEV_URL;
    case 'PUBLIC_PATIENTS_DEV_URL':
      return processEnv?.PUBLIC_PATIENTS_DEV_URL;
    case 'PUBLIC_PATIENTS_URL':
      return processEnv?.PUBLIC_PATIENTS_URL;
    case 'PUBLIC_DOCTORS_DEV_URL':
      return processEnv?.PUBLIC_DOCTORS_DEV_URL;
    case 'PUBLIC_DOCTORS_URL':
      return processEnv?.PUBLIC_DOCTORS_URL;
    case 'PUBLIC_SIGNALING_URL':
      return processEnv?.PUBLIC_SIGNALING_URL;
    case 'PUBLIC_APP_URL':
      return processEnv?.PUBLIC_APP_URL;
    case 'PUBLIC_SITE_URL':
      return processEnv?.PUBLIC_SITE_URL;
    case 'PUBLIC_API_URL':
      return processEnv?.PUBLIC_API_URL;
    case 'PUBLIC_AUTA_ONNX':
      return processEnv?.PUBLIC_AUTA_ONNX;
    case 'PUBLIC_AUTA_ONNX_MODEL':
      return processEnv?.PUBLIC_AUTA_ONNX_MODEL;
    default:
      return undefined;
  }
}

export function ensureClientEnv(name: string): string {
  assertClientEnvAllowed(name);

  // Try static map first (server-side and build-time)
  let value = CLIENT_ENV_MAP[name];
  // Fallback for client-side: use direct property access to allow Vite inlining
  if (!value) {
    value = readKnownClientEnv(name);
  }
  if (!value) {
    value = resolveClientEnv(name);
  }
  if (!value) {
    throw new Error(`Missing required client environment variable: ${name}`);
  }
  return value;
}

export function getClientEnvOrDefault(name: string, defaultValue: string): string {
  assertClientEnvAllowed(name);
  return (
    CLIENT_ENV_MAP[name] ??
    readKnownClientEnv(name) ??
    resolveClientEnv(name) ??
    defaultValue
  );
}

export function getOptionalClientEnv(name: string): string | undefined {
  assertClientEnvAllowed(name);
  return CLIENT_ENV_MAP[name] ?? resolveClientEnv(name) ?? undefined;
}

// Utilidad específica para variables de entorno del servidor (sin PUBLIC_)
export function ensureServerEnv(name: string): string {
  if (name.startsWith("PUBLIC_")) {
    throw new Error(
      `Invalid server environment variable: ${name}. Server-side code should not use PUBLIC_ variables directly.`,
    );
  }

  const value = processRef?.env?.[name];
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

export function getServerEnvOrDefault(name: string, defaultValue?: string): string | undefined {
  if (name.startsWith("PUBLIC_")) {
    throw new Error(
      `Invalid server environment variable: ${name}. Server-side code should not use PUBLIC_ variables directly.`,
    );
  }

  const value = processRef?.env?.[name];
  return value ?? defaultValue;
}

// Validación completa de variables de entorno críticas para producción
export function validateEnvironment(): EnvironmentConfig {
  // Validar variables obligatorias del cliente
  const client = {
    apiUrl: ensureClientEnv("PUBLIC_API_URL"),
    appUrl: ensureClientEnv("PUBLIC_APP_URL"),
    siteUrl: ensureClientEnv("PUBLIC_SITE_URL"),
    supabase: {
      url: ensureClientEnv("PUBLIC_SUPABASE_URL"),
      anonKey: ensureClientEnv("PUBLIC_SUPABASE_ANON_KEY"),
    },
    recaptcha: resolveClientEnv('PUBLIC_RECAPTCHA_SITE_KEY')
      ? { siteKey: resolveClientEnv('PUBLIC_RECAPTCHA_SITE_KEY') ?? '' }
      : undefined,
    analytics: {
      sentryDsn: resolveClientEnv('PUBLIC_SENTRY_DSN'),
      gaTrackingId: undefined,
    },
  };

  // Validar variables críticas del servidor
  const server = {
    supabase: {
      url: resolveClientEnv('PUBLIC_SUPABASE_URL') ?? "",
      serviceRoleKey: ensureServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    },
    jwt: {
      secret: ensureServerEnv("JWT_SECRET"),
      refreshSecret: ensureServerEnv("JWT_REFRESH_SECRET"),
    },
    urls: {
      api: ensureClientEnv("PUBLIC_API_URL"),
      webApp: ensureClientEnv("PUBLIC_APP_URL"),
    },
    security: {
      phiEncryptionKey: ensureServerEnv("ENCRYPTION_KEY"),
      adminSecret: ensureServerEnv("SESSION_SECRET"),
    },
    external: {
      openaiApiKey: process.env.OPENAI_API_KEY,
      sendgridApiKey: undefined, // No usando SendGrid, usando SMTP
    },
  };

  return { client, server };
}

// Validación específica para variables críticas de producción
export function validateProductionEnvironment(): EnvironmentValidation {
  const issues: string[] = [];

  // Verificar seguridad crítica
  const securityVars = [
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "ENCRYPTION_KEY",
    "SESSION_SECRET",
    "NEXTAUTH_SECRET",
  ];

  const security = securityVars.every((varName) => {
    const value = process.env[varName];
    if (!value) {
      issues.push(`Missing critical security variable: ${varName}`);
      return false;
    }
    if (value.length < 32) {
      issues.push(
        `Security variable ${varName} is too short (minimum 32 characters)`,
      );
      return false;
    }
    return true;
  });

  // Verificar base de datos
  const databaseVars = ["SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"];
  const database = databaseVars.every((varName) => {
    const value = process.env[varName];
    if (!value) {
      issues.push(`Missing database variable: ${varName}`);
      return false;
    }
    return true;
  });

  // Verificar pagos (opcional pero recomendado)
  const paymentVars = ["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_WEBHOOK_SECRET"];
  const payments = paymentVars.every((varName) => {
    const value = process.env[varName];
    if (!value) {
      issues.push(
        `Missing payment variable: ${varName} (required for production)`,
      );
      return false;
    }
    return true;
  });

  // Verificar monitoring
  const monitoringVars = ["PUBLIC_SENTRY_DSN"];
  const monitoring = monitoringVars.every((varName) => {
    const value = resolveClientEnv(varName);
    if (!value) {
      issues.push(`Missing monitoring variable: ${varName}`);
      return false;
    }
    return true;
  });

  // Verificar compliance (flags críticos)
  const complianceVars = [
    "HIPAA_ENCRYPTION_ENABLED",
    "AUDIT_LOGGING_ENABLED",
    "PHI_ENCRYPTION_ENABLED",
  ];

  const compliance = complianceVars.every((varName) => {
    const value = process.env[varName];
    if (!value || value !== "true") {
      issues.push(`Compliance variable ${varName} must be set to 'true'`);
      return false;
    }
    return true;
  });

  return {
    environment: "production",
    security,
    database,
    payments,
    monitoring,
    compliance,
    issues,
  };
}

// Utilidad para verificar que no haya variables mal configuradas
export function validateEnvironmentSecurity(): void {
  // Verificar que no hay variables server-only expuestas como PUBLIC_
  for (const serverVar of Array.from(SERVER_ONLY_VARS)) {
    const exposedVar = `PUBLIC_${serverVar}`;
    if (process.env[exposedVar]) {
      throw new Error(
        `Security violation: Server-only variable ${serverVar} is exposed as ${exposedVar}`,
      );
    }
  }

  // OpenAI API keys must never be exposed to browser bundles.
  if (resolveClientEnv('PUBLIC_OPENAI_API_KEY') || resolveClientEnv('NEXT_PUBLIC_OPENAI_API_KEY')) {
    throw new Error('Security violation: OpenAI API keys must remain server-side. Use OPENAI_API_KEY.');
  }

  // Verificar que no hay variables duplicadas con diferentes prefijos (solo para SUPABASE_URL que puede tener ambas formas)
  const duplicateChecks: [string, string][] = [
    ["SUPABASE_URL", "PUBLIC_SUPABASE_URL"],
  ];

  for (const [serverVar, clientVar] of duplicateChecks) {
    const serverVal = process.env[serverVar];
    const clientVal = process.env[clientVar];

    if (serverVal && clientVal && serverVal !== clientVal) {
      logger.warn(
        `Warning: ${serverVar} and ${clientVar} have different values. This may cause confusion.`,
      );
    }
  }
}

// Environment-specific validation
export interface EnvironmentValidation {
  environment: "development" | "staging" | "production";
  security: boolean;
  database: boolean;
  monitoring: boolean;
  compliance: boolean;
  payments: boolean;
  issues: string[];
}

export function validateStagingEnvironment(): EnvironmentValidation {
  const issues: string[] = [];

  // Check staging-specific requirements
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== "staging" && nodeEnv !== "development") {
    issues.push('NODE_ENV should be "staging" for staging environment');
  }

  // Staging should use test reCAPTCHA keys
  const recaptchaKey = resolveClientEnv('PUBLIC_RECAPTCHA_SITE_KEY');
  if (
    recaptchaKey &&
    !recaptchaKey.includes("6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI")
  ) {
    issues.push("Staging should use test reCAPTCHA keys for development");
  }

  // Staging should use test MercadoPago
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (mpToken && !mpToken.startsWith("TEST-")) {
    issues.push("Staging should use TEST MercadoPago credentials");
  }

  // Check staging domain structure
  const appUrl = resolveClientEnv('PUBLIC_APP_URL');
  if (appUrl && !appUrl.includes("staging")) {
    issues.push("Staging should use staging subdomain structure");
  }

  // Basic validations from production
  const prodValidation = validateProductionEnvironment();

  return {
    environment: "staging",
    security: prodValidation.security,
    database: prodValidation.database,
    monitoring: prodValidation.monitoring,
    compliance: true, // Less strict for staging
    payments: mpToken?.startsWith("TEST-") ?? false,
    issues: [
      ...issues,
      ...prodValidation.issues.filter(
        (issue) => !issue.includes("MercadoPago"), // Filter out production payment issues
      ),
    ],
  };
}

export function validateEnvironmentByType(
  envType?: string,
): EnvironmentValidation {
  const environment = envType ?? process.env.NODE_ENV ?? "development";

  switch (environment) {
    case "production":
      return validateProductionEnvironment();
    case "staging":
      return validateStagingEnvironment();
    case "development":
      // Development is more permissive
      return {
        environment: "development",
        security: true,
        database: !!resolveClientEnv('PUBLIC_SUPABASE_URL'),
        monitoring: true,
        compliance: true,
        payments: true, // Not required for development
        issues: [],
      };
    default:
      throw new Error(`Unknown environment type: ${environment}`);
  }
}
