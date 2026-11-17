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

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBlockedFieldName(key) {
  const normalized = key.toLowerCase().replace(/[_.-]/g, '');
  return BLOCKED_FIELD_NAMES.has(normalized) ||
    /^(?:patient|doctor|user|prescription|dispatch|order)id$/.test(normalized);
}

function redactSensitiveText(value) {
  return value
    .replace(/https?:\/\/(?:[a-z0-9-]+\.)*memed\.com\.br[^\s"'<>]*/gi, '[Memed URL redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[Redacted]')
    .replace(/((?:api[-_]?key|secret[-_]?key|access_token|refresh_token|id_token|token_hash|recovery_token|otp_hash|otp|token|password)=)[^&#\s"'<>]+/gi, '$1[Redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[Email redacted]')
    .replace(/(?<!\d)(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{7,15})(?!\d)/g, '[Identifier redacted]');
}

function truncate(value, max = 240) {
  return value.length > max ? value.slice(0, max) + '...[truncated]' : value;
}

function sanitizeValue(value, depth = 0) {
  if (depth > 8) return '[TruncatedDepth]';

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(redactSensitiveText(value.message)),
      stack: value.stack ? truncate(redactSensitiveText(value.stack), 1000) : undefined,
    };
  }

  if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'undefined') {
    return value;
  }

  if (typeof value === 'string') return truncate(redactSensitiveText(value));
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  if (!isPlainObject(value)) return String(value);

  const sanitized = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    sanitized[key] = isBlockedFieldName(key) ? '[Redacted]' : sanitizeValue(nestedValue, depth + 1);
  }
  return sanitized;
}

function sanitizeHeaders(headers) {
  if (!isPlainObject(headers)) return headers;
  for (const key of Object.keys(headers)) {
    const normalized = key.toLowerCase().replace(/[_-]/g, '');
    if (['authorization', 'cookie', 'cookies', 'setcookie', 'proxyauthorization', 'apikey', 'xapikey', 'xauthtoken'].includes(normalized)) {
      delete headers[key];
    }
  }
  return headers;
}

export function sanitizeSentryEvent(event) {
  if (!event || typeof event !== 'object') return event;

  if (typeof event.message === 'string') event.message = redactSensitiveText(event.message);
  if (typeof event.transaction === 'string') event.transaction = redactSensitiveText(event.transaction);

  if (event.request) {
    if (typeof event.request.url === 'string') event.request.url = redactSensitiveText(event.request.url);
    if (typeof event.request.query_string === 'string') event.request.query_string = redactSensitiveText(event.request.query_string);
    delete event.request.data;
    delete event.request.cookies;
    event.request.headers = sanitizeHeaders(event.request.headers);
  }

  delete event.user;

  if (event.exception) event.exception = sanitizeValue(event.exception);
  if (event.extra) event.extra = sanitizeValue(event.extra);
  if (event.contexts) event.contexts = sanitizeValue(event.contexts);
  if (event.tags) event.tags = sanitizeValue(event.tags);
  if (event.logentry) event.logentry = sanitizeValue(event.logentry);
  if (Array.isArray(event.spans)) event.spans = event.spans.map((span) => sanitizeValue(span));
  if (Array.isArray(event.breadcrumbs)) event.breadcrumbs = event.breadcrumbs.map((item) => sanitizeValue(item));

  return event;
}

export function getBaseSentryConfig(runtime) {
  const isServer = typeof process !== 'undefined';
  const nodeEnv = (isServer ? process.env.NODE_ENV : null) || 'development';
  const sentryDsn = (isServer ? process.env.PUBLIC_SENTRY_DSN : null) ||
    'https://485f1dbb686db51681cf8159012dcdf1@o4511195725168640.ingest.us.sentry.io/4511195726741504';

  return {
    dsn: sentryDsn,
    environment: runtime + '-' + nodeEnv,
    sendDefaultPii: false,
    enableLogs: true,
    tracesSampleRate: nodeEnv === 'development' ? 1.0 : 0.1,
    beforeBreadcrumb(breadcrumb) { return sanitizeValue(breadcrumb); },
    beforeSendSpan(span) { return sanitizeValue(span); },
    beforeSendTransaction(event) { return sanitizeSentryEvent(event); },
    beforeSendLog(log) { return sanitizeValue(log); },
    beforeSend(event) { return sanitizeSentryEvent(event); },
  };
}
