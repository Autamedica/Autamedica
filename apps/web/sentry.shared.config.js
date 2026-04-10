const BLOCKED_FIELD_NAMES = new Set([
  'authorization',
  'set-cookie',
  'cookie',
  'cookies',
  'body',
  'payload',
  'headers',
  'state',
  'clinical_data',
  'message',
  'notes',
  'details',
  'metadata',
  'description',
  'anamnesis',
  'chat',
  'patient_name',
  'first_name',
  'last_name',
  'full_name',
  'email',
  'phone',
  'document',
  'dni',
  'address',
  'birth_date',
  'date_of_birth',
  'pdf',
  'qr',
  'signed_pdf_url',
  'file_url',
]);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(value, max = 240) {
  return value.length > max ? `${value.slice(0, max)}...[truncated]` : value;
}

function sanitizeValue(value, depth = 0) {
  if (depth > 3) {
    return '[TruncatedDepth]';
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message),
      stack: value.stack ? truncate(value.stack, 1000) : undefined,
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
    return truncate(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeValue(item, depth + 1));
  }

  if (!isPlainObject(value)) {
    return String(value);
  }

  const sanitized = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    sanitized[key] = BLOCKED_FIELD_NAMES.has(normalizedKey)
      ? '[Redacted]'
      : sanitizeValue(nestedValue, depth + 1);
  }

  return sanitized;
}

export function sanitizeSentryEvent(event) {
  if (event.request) {
    delete event.request.data;

    if (isPlainObject(event.request.headers)) {
      delete event.request.headers.Authorization;
      delete event.request.headers.authorization;
      delete event.request.headers.Cookie;
      delete event.request.headers.cookie;
      delete event.request.headers['Set-Cookie'];
      delete event.request.headers['set-cookie'];
    }
  }

  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }

  if (event.extra) {
    event.extra = sanitizeValue(event.extra);
  }

  if (event.contexts) {
    event.contexts = sanitizeValue(event.contexts);
  }

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => sanitizeValue(breadcrumb));
  }

  return event;
}

export function getBaseSentryConfig(runtime) {
  const nodeEnv = process.env.NODE_ENV || 'development';

  return {
    dsn: process.env.PUBLIC_SENTRY_DSN,
    environment: `${runtime}-${nodeEnv}`,
    sendDefaultPii: false,
    enableLogs: true,
    tracesSampleRate: nodeEnv === 'development' ? 1.0 : 0.1,
    beforeSend(event) {
      return sanitizeSentryEvent(event);
    },
  };
}
