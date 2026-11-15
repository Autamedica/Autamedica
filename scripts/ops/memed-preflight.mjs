const apiKey = process.env.MEMED_API_KEY ?? '';
const secretKey = process.env.MEMED_SECRET_KEY ?? '';
const apiUrl = process.env.MEMED_API_URL ?? 'https://api.memed.com.br/v1';

if (!apiKey || !secretKey) {
  console.log('MEMED_PREFLIGHT_SKIPPED=credentials_not_available_to_github_runner');
  process.exit(0);
}
if (apiUrl !== 'https://api.memed.com.br/v1') {
  console.error('MEMED_PREFLIGHT_CONFIGURATION_INVALID');
  process.exit(1);
}

const url = new URL('/sinapse-prescricao/check-key', apiUrl);
url.searchParams.set('api-key', apiKey);
url.searchParams.set('secret-key', secretKey);

try {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/vnd.api+json', 'Cache-Control': 'no-cache' },
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* status remains useful */ }
  const accepted = response.ok && Array.isArray(payload?.success)
    && payload.success.some((entry) => entry?.code === 'chave-valida');
  console.log(`MEMED_PREFLIGHT_HTTP_STATUS=${response.status}`);
  console.log(`MEMED_PREFLIGHT_CREDENTIALS_ACCEPTED=${accepted}`);
  if (!accepted) process.exitCode = 1;
} catch {
  console.error('MEMED_PREFLIGHT_TRANSPORT_FAILED');
  process.exitCode = 1;
}
