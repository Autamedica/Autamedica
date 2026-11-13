import * as Sentry from '@sentry/deno';

type Primitive = string | number | boolean | null | undefined;

interface EdgeCaptureMeta {
  layer?: string;
  surface: string;
  owner?: string;
  tags?: Record<string, Primitive>;
  context?: Record<string, unknown>;
}

const BLOCKED_FIELD_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'body',
  'payload',
  'headers',
  'state',
  'clinical_data',
  'notes',
  'details',
  'message',
  'metadata',
  'email',
  'phone',
  'document',
  'dni',
  'address',
  'patient_name',
  'first_name',
  'last_name',
  'file_url',
  'signed_pdf_url',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return '[TruncatedDepth]';
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'undefined'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > 240 ? `${value.slice(0, 240)}...[truncated]` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeValue(item, depth + 1));
  }

  if (!isPlainObject(value)) {
    return String(value);
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    sanitized[key] = BLOCKED_FIELD_NAMES.has(normalizedKey)
      ? '[Redacted]'
      : sanitizeValue(nestedValue, depth + 1);
  }

  return sanitized;
}

function sanitizeEvent(event: Record<string, unknown>): Record<string, unknown> {
  const request = event.request;
  if (isPlainObject(request)) {
    delete request.data;

    if (isPlainObject(request.headers)) {
      const headers = request.headers;
      delete headers.authorization;
      delete headers.Authorization;
      delete headers.cookie;
      delete headers.Cookie;
      delete headers['set-cookie'];
      delete headers['Set-Cookie'];
    }
  }

  const user = event.user;
  if (isPlainObject(user)) {
    delete user.email;
    delete user.username;
    delete user.ip_address;
  }

  if (event.extra) {
    event.extra = sanitizeValue(event.extra);
  }

  if (event.contexts) {
    event.contexts = sanitizeValue(event.contexts);
  }

  return event;
}

function getDsn(): string | undefined {
  return Deno.env.get('SENTRY_DSN') || Deno.env.get('PUBLIC_SENTRY_DSN') || undefined;
}

function getEnvironment(): string {
  return Deno.env.get('SUPABASE_ENV') || Deno.env.get('DENO_ENV') || 'production';
}

function ensureError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }

  if (isPlainObject(error) && typeof error.message === 'string') {
    const normalized = new Error(error.message);
    if (typeof error.stack === 'string') {
      normalized.stack = error.stack;
    }
    return normalized;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  return new Error(fallbackMessage);
}

export function initEdgeSentry(functionName: string): void {
  const registry = globalThis as Record<string, unknown>;
  if (registry.__AUTAMEDICA_EDGE_SENTRY_INIT__) {
    return;
  }

  const dsn = getDsn();
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: `supabase-${getEnvironment()}`,
    sendDefaultPii: false,
    tracesSampleRate: getEnvironment() === 'development' ? 1 : 0.1,
    beforeSend(event) {
      sanitizeEvent(event as unknown as Record<string, unknown>);
      return event;
    },
    initialScope: {
      tags: {
        runtime: 'supabase-edge',
        edge_function: functionName,
      },
    },
  });

  registry.__AUTAMEDICA_EDGE_SENTRY_INIT__ = true;
}

export function captureEdgeException(error: unknown, meta: EdgeCaptureMeta): string | undefined {
  initEdgeSentry(meta.surface);

  if (!getDsn()) {
    return undefined;
  }

  return Sentry.withScope((scope) => {
    scope.setTag('surface', meta.surface);
    scope.setTag('runtime', 'supabase-edge');

    if (meta.layer) {
      scope.setTag('layer', meta.layer);
    }

    if (meta.owner) {
      scope.setTag('owner', meta.owner);
    }

    if (meta.tags) {
      for (const [key, value] of Object.entries(meta.tags)) {
        if (value !== null && typeof value !== 'undefined') {
          scope.setTag(key, String(value));
        }
      }
    }

    if (meta.context) {
      scope.setContext('autamedica', sanitizeValue(meta.context) as Record<string, unknown>);
    }

    return Sentry.captureException(ensureError(error, meta.surface));
  });
}
