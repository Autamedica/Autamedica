const apiKey = process.env.MEMED_API_KEY ?? '';
const secretKey = process.env.MEMED_SECRET_KEY ?? '';
const apiUrl = process.env.MEMED_API_URL ?? 'https://api.memed.com.br/v1';
const externalId = process.env.MEMED_PREFLIGHT_DOCTOR_EXTERNAL_ID ?? '';

if (!apiKey || !secretKey) {
  console.log('MEMED_PREFLIGHT_SKIPPED=credentials_not_available_to_github_runner');
  process.exit(0);
}
if (!externalId || !/^[a-zA-Z0-9-]{1,255}$/.test(externalId)) {
  console.error('MEMED_PREFLIGHT_CONFIGURATION_INVALID=doctor_external_id');
  process.exit(1);
}
const base = new URL(apiUrl);
if (base.origin !== 'https://api.memed.com.br' || (base.pathname.endsWith('/') ? base.pathname.slice(0, -1) : base.pathname) !== '/v1') {
  console.error('MEMED_PREFLIGHT_CONFIGURATION_INVALID=production_api_url');
  process.exit(1);
}

const url = new URL(`/v1/sinapse-prescricao/usuarios/${encodeURIComponent(externalId)}`, base.origin);
url.searchParams.set('api-key', apiKey);
url.searchParams.set('secret-key', secretKey);

const safeHeaders = (headers) => {
  const names = ['content-type', 'server', 'date', 'x-amzn-errortype', 'x-amz-apigw-id', 'x-amzn-requestid', 'via'];
  return Object.fromEntries(names.map((name) => [name, headers.get(name)]).filter(([, value]) => value));
};
const safeBody = (payload, raw) => {
  if (payload && typeof payload === 'object') {
    const errors = Array.isArray(payload.errors) ? payload.errors.slice(0, 5).map((entry) => ({
      code: typeof entry?.code === 'string' ? entry.code.slice(0, 80) : undefined,
      title: typeof entry?.title === 'string' ? entry.title.slice(0, 120) : undefined,
      detail: typeof entry?.detail === 'string'
        ? entry.detail.replaceAll(externalId, '[EXTERNAL_ID]').replace(/[0-9]{11}/g, '[CPF]').slice(0, 240)
        : undefined,
    })) : [];
    return JSON.stringify({
      rootKeys: Object.keys(payload).slice(0, 20),
      dataType: payload?.data?.type ?? null,
      attributeKeys: payload?.data?.attributes && typeof payload.data.attributes === 'object'
        ? Object.keys(payload.data.attributes).slice(0, 30) : [],
      tokenPresent: typeof payload?.data?.attributes?.token === 'string',
      errors,
      message: typeof payload.message === 'string'
        ? payload.message.replaceAll(externalId, '[EXTERNAL_ID]').slice(0, 240) : undefined,
    });
  }
  return raw.replaceAll(apiKey, '[API_KEY]').replaceAll(secretKey, '[SECRET_KEY]')
    .replaceAll(externalId, '[EXTERNAL_ID]').slice(0, 400);
};

try {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'User-Agent': 'Autamedica-Memed-Provider-Preflight/1.0',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  const raw = await response.text();
  let payload = null;
  try { payload = JSON.parse(raw); } catch { /* preserve sanitized response metadata */ }
  const attributes = payload?.data?.attributes;
  const doctorFound = response.status === 200
    && payload?.data?.type === 'usuarios'
    && attributes && typeof attributes === 'object';
  const doctorNotRegistered = response.status === 404
    && Array.isArray(payload?.errors)
    && payload.errors.some((entry) => /nenhum usuário encontrado/i.test(String(entry?.detail ?? '')));
  const accepted = Boolean(doctorFound || doctorNotRegistered);

  console.log('MEMED_PREFLIGHT_REQUEST_METHOD=GET');
  console.log('MEMED_PREFLIGHT_REQUEST_PATH=/v1/sinapse-prescricao/usuarios/[EXTERNAL_ID]');
  console.log('MEMED_PREFLIGHT_REQUEST_HEADERS=Accept, Content-Type, Cache-Control, User-Agent');
  console.log(`MEMED_PREFLIGHT_HTTP_STATUS=${response.status}`);
  console.log(`MEMED_PREFLIGHT_RESPONSE_HEADERS=${JSON.stringify(safeHeaders(response.headers))}`);
  console.log(`MEMED_PREFLIGHT_RESPONSE_BODY=${safeBody(payload, raw)}`);
  console.log(`MEMED_PREFLIGHT_DOCTOR_FOUND=${Boolean(doctorFound)}`);
  console.log(`MEMED_PREFLIGHT_CREDENTIALS_ACCEPTED=${accepted}`);
  if (!accepted) process.exitCode = 1;
} catch {
  console.error('MEMED_PREFLIGHT_TRANSPORT_FAILED');
  process.exitCode = 1;
}
