import * as Sentry from '@sentry/deno';

type Primitive = string | number | boolean | null | undefined;

interface EdgeCaptureMeta {
  layer?: string;
  surface: string;
  owner?: string;
  tags?: Record<string, Primitive>;
  context?: Record<string, unknown>;
}

type EdgeHandler = (request: Request) => Response | Promise<Response>;

const DEFAULT_SENTRY_DSN =
  'https://485f1dbb686db51681cf8159012dcdf1@o4511195725168640.ingest.us.sentry.io/4511195726741504';

const BLOCKED_FIELD_NAMES = new Set([
  'authorization', 'cookie', 'cookies', 'setcookie', 'proxyauthorization',
  'body', 'payload', 'headers', 'state', 'clinicaldata', 'notes', 'details',
  'metadata', 'anamnesis', 'chat', 'patientname', 'firstname', 'lastname',
  'fullname', 'email', 'phone', 'document', 'dni', 'cpf', 'cuil', 'address',
  'birthdate', 'dateofbirth', 'datanascimento', 'pdf', 'qr', 'signedpdfurl',
  'fileurl', 'patientid', 'doctorid', 'userid', 'prescriptionid', 'dispatchid',
  'orderid', 'accesstoken', 'refreshtoken', 'idtoken', 'tokenhash',
  'recoverytoken', 'otp', 'otphash', 'password', 'apikey', 'secretkey', 'secret',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBlockedFieldName(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_.-]/g, '');
  return BLOCKED_FIELD_NAMES.has(normalized) ||
    /^(?:patient|doctor|user|prescription|dispatch|order)id$/.test(normalized);
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/https?:\/\/(?:[a-z0-9-]+\.)*memed\.com\.br[^\s"'<>]*/gi, '[Memed URL redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[Redacted]')
    .replace(/((?:api[-_]?key|secret[-_]?key|access_token|refresh_token|id_token|token_hash|recovery_token|otp_hash|otp|token|password)=)[^&#\s"'<>]+/gi, '$1[Redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[Email redacted]')
    .replace(/(?<!\d)(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{7,15})(?!\d)/g, '[Identifier redacted]');
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TruncatedDepth]';

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveText(value.message).slice(0, 240),
      stack: value.stack ? redactSensitiveText(value.stack).slice(0, 1600) : undefined,
    };
  }

  if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'undefined') {
    return value;
  }

  if (typeof value === 'string') return redactSensitiveText(value).slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  if (!isPlainObject(value)) return String(value);

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    sanitized[key] = isBlockedFieldName(key) ? '[Redacted]' : sanitizeValue(nestedValue, depth + 1);
  }
  return sanitized;
}

function sanitizeHeaders(headers: unknown): unknown {
  if (!isPlainObject(headers)) return headers;
  for (const key of Object.keys(headers)) {
    const normalized = key.toLowerCase().replace(/[_-]/g, '');
    if ([
      'authorization', 'cookie', 'cookies', 'setcookie', 'proxyauthorization',
      'apikey', 'xapikey', 'xauthtoken',
    ].includes(normalized)) {
      delete headers[key];
    }
  }
  return headers;
}

function sanitizeEvent(event: Record<string, unknown>): Record<string, unknown> {
  const request = event.request;
  if (isPlainObject(request)) {
    if (typeof request.url === 'string') request.url = redactSensitiveText(request.url);
    if (typeof request.query_string === 'string') request.query_string = redactSensitiveText(request.query_string);
    delete request.data;
    delete request.cookies;
    request.headers = sanitizeHeaders(request.headers);
  }

  delete event.user;

  if (typeof event.message === 'string') event.message = redactSensitiveText(event.message);
  if (typeof event.transaction === 'string') event.transaction = redactSensitiveText(event.transaction);
  if (event.exception) event.exception = sanitizeValue(event.exception);
  if (event.extra) event.extra = sanitizeValue(event.extra);
  if (event.contexts) event.contexts = sanitizeValue(event.contexts);
  if (event.tags) event.tags = sanitizeValue(event.tags);
  if (event.logentry) event.logentry = sanitizeValue(event.logentry);
  if (Array.isArray(event.breadcrumbs)) event.breadcrumbs = event.breadcrumbs.map((item) => sanitizeValue(item));
  if (Array.isArray(event.spans)) event.spans = event.spans.map((item) => sanitizeValue(item));

  return event;
}

function getDsn(): string {
  return Deno.env.get('SENTRY_DSN') ||
    Deno.env.get('PUBLIC_SENTRY_DSN') ||
    DEFAULT_SENTRY_DSN;
}

function getEnvironment(): string {
  return Deno.env.get('SUPABASE_ENV') || Deno.env.get('DENO_ENV') || 'production';
}

async function flushSentry(): Promise<void> {
  try {
    await Sentry.flush(2000);
  } catch {
    // A telemetry transport failure must not fail the business request.
  }
}

function ensureSafeError(error: unknown, fallbackMessage: string): Error {
  const source = error instanceof Error
    ? error
    : isPlainObject(error) && typeof error.message === 'string'
    ? new Error(error.message)
    : typeof error === 'string'
    ? new Error(error)
    : new Error(fallbackMessage);

  const normalized = new Error(redactSensitiveText(source.message || fallbackMessage).slice(0, 240));
  normalized.name = source.name || 'Error';
  if (source.stack) normalized.stack = redactSensitiveText(source.stack).slice(0, 1600);
  return normalized;
}

export function initEdgeSentry(functionName: string): void {
  const registry = globalThis as Record<string, unknown>;
  if (registry.__AUTAMEDICA_EDGE_SENTRY_INIT__) return;

  try {
    Sentry.init({
      dsn: getDsn(),
      defaultIntegrations: false,
      environment: 'supabase-' + getEnvironment(),
      sendDefaultPii: false,
      tracesSampleRate: getEnvironment() === 'development' ? 1 : 0.1,
      beforeSend(event) {
        sanitizeEvent(event as unknown as Record<string, unknown>);
        return event;
      },
      initialScope: {
        tags: {
          runtime: 'supabase-edge',
          edge_function: redactSensitiveText(functionName),
        },
      },
    });
    registry.__AUTAMEDICA_EDGE_SENTRY_INIT__ = true;
  } catch {
    // Telemetry initialization must never interrupt an Edge Function.
  }
}

export async function captureEdgeException(error: unknown, meta: EdgeCaptureMeta): Promise<string | undefined> {
  try {
    initEdgeSentry(meta.surface);
    const eventId = Sentry.withScope((scope) => {
      scope.setTag('surface', redactSensitiveText(meta.surface).slice(0, 120));
      scope.setTag('runtime', 'supabase-edge');

      if (meta.layer) scope.setTag('layer', redactSensitiveText(meta.layer).slice(0, 80));
      if (meta.owner) scope.setTag('owner', redactSensitiveText(meta.owner).slice(0, 80));

      if (meta.tags) {
        for (const [key, value] of Object.entries(meta.tags)) {
          if (value === null || typeof value === 'undefined' || isBlockedFieldName(key)) continue;
          scope.setTag(key, redactSensitiveText(String(value)).slice(0, 120));
        }
      }

      if (meta.context) {
        scope.setContext('autamedica', sanitizeValue(meta.context) as Record<string, unknown>);
      }

      return Sentry.captureException(ensureSafeError(error, meta.surface));
    });
    await flushSentry();
    return eventId;
  } catch {
    // Reporting failures are deliberately isolated from payments and clinical flows.
    return undefined;
  }
}

/**
 * Wraps an existing request handler without changing its response contract.
 * It reports returned 5xx responses and rethrows uncaught errors so the Edge
 * Runtime keeps its existing error handling and status behavior.
 */
export function withEdgeSentry(functionName: string, handler: EdgeHandler): EdgeHandler {
  initEdgeSentry(functionName);

  return async (request: Request): Promise<Response> => {
    let response: Response;
    try {
      response = await handler(request);
    } catch (error) {
      await captureEdgeException(error, {
        layer: 'edge-runtime',
        surface: functionName + ':unhandled',
        owner: 'Supabase Edge Runtime',
      });
      throw error;
    }

    if (response.status >= 500) {
      await captureEdgeException(new Error('HTTP ' + response.status + ' response'), {
        layer: 'edge-runtime',
        surface: functionName + ':http-' + response.status,
        owner: 'Supabase Edge Runtime',
        tags: { http_status: response.status },
      });
    }

    return response;
  };
}
