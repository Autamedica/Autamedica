const DIRECTORY_URL = 'https://www.argentina.gob.ar/salud/buscador-nacional-de-profesionales-de-la-salud';
const MAX_HTML_LENGTH = 1_000_000;

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function refepsLicenseKey(value: string, type: 'MN' | 'MP'): string | undefined {
  const prefix = type === 'MN' ? /^M[.\s]*N[.\s:#-]*(?=\d)/i : /^M[.\s]*P[.\s:#-]*(?=\d)/i;
  const license = value.trim().replace(prefix, '').replace(/[.\s]/g, '').toUpperCase();
  const valid = type === 'MN' ? /^\d{1,20}$/.test(license)
    : license.length <= 32 && /^[A-Z0-9]+(?:[/-][A-Z0-9]+)*$/.test(license);
  return valid ? license : undefined;
}

export function normalizeRefepsLicense(value: string, type: 'MN' | 'MP'): string {
  const license = refepsLicenseKey(value, type);
  if (!license) fail('REFEPS_LICENSE_FORMAT');
  return license;
}

function nameKey(value: string): string {
  return normalized(value).replace(/^(?:dr|dra|doctor|doctora)\.?\s+/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
}

function jurisdictionKey(value: string): string {
  const key = normalized(value);
  return ['caba', 'capital federal', 'ciudad autonoma de buenos aires'].includes(key) ? 'caba' : key;
}

function formFields(html: string): URLSearchParams {
  const form = html.match(/<form\b[^>]*\bid=["']consulta-profesionales-form["'][^>]*>[\s\S]*?<\/form>/i)?.[0];
  if (!form) fail('REFEPS_DISCOVERY_INVALID_RESPONSE');
  const fields = new URLSearchParams();
  for (const input of form.matchAll(/<input\b[^>]*>/gi)) {
    const name = input[0].match(/\bname=["']([^"']+)["']/i)?.[1];
    const value = input[0].match(/\bvalue=["']([^"']*)["']/i)?.[1];
    if (name && value && ['form_build_id', 'form_id'].includes(name)) fields.set(name, value);
  }
  if (fields.get('form_id') !== 'argobar_consulta_refeps_profesionales'
    || !/^form-[A-Za-z0-9_-]{10,200}$/.test(fields.get('form_build_id') ?? '')) fail('REFEPS_DISCOVERY_INVALID_RESPONSE');
  return fields;
}

function directoryItems(html: string): unknown[] {
  const marker = /Drupal\.settings\.refepsProfesionales\.allItems\s*=\s*/g;
  const match = marker.exec(html);
  if (!match || html[marker.lastIndex] !== '[') fail('REFEPS_DISCOVERY_INVALID_RESPONSE');
  const start = marker.lastIndex;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index++) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '[' || char === '{') depth++;
    else if (char === ']' || char === '}') {
      depth--;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(html.slice(start, index + 1));
          if (!Array.isArray(parsed) || parsed.length > 200) fail('REFEPS_DISCOVERY_INVALID_RESPONSE');
          return parsed;
        } catch { fail('REFEPS_DISCOVERY_INVALID_RESPONSE'); }
      }
    }
  }
  fail('REFEPS_DISCOVERY_INVALID_RESPONSE');
}

type DirectoryItem = {
  codigo: string; nombre: string; apellido: string;
  profesiones: Array<{ profesionReferencia: string; matriculas: Array<{ matricula: string; provinciaMatricula: string }> }>;
};

function isDirectoryItem(value: unknown): value is DirectoryItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<DirectoryItem>;
  return typeof item.codigo === 'string' && /^\d{12}$/.test(item.codigo)
    && typeof item.nombre === 'string' && !!item.nombre.trim()
    && typeof item.apellido === 'string' && !!item.apellido.trim()
    && Array.isArray(item.profesiones) && item.profesiones.every((profession) => profession
      && typeof profession.profesionReferencia === 'string' && Array.isArray(profession.matriculas)
      && profession.matriculas.every((registration) => registration && typeof registration.matricula === 'string'
        && typeof registration.provinciaMatricula === 'string'));
}

// Discover identity only. Habilitation is still checked against the authenticated FHIR response.
export async function discoverRefepsId(license: string, type: 'MN' | 'MP', province?: string, expectedName?: string): Promise<string> {
  const matricula = normalizeRefepsLicense(license, type);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const request = async (init?: RequestInit): Promise<string> => {
    const response = await fetch(DIRECTORY_URL, {
      // Workers rejects redirect:'error' before sending the request. Manual mode
      // is supported on both runtimes; response.ok below rejects every redirect.
      ...init, redirect: 'manual', signal: controller.signal,
      headers: { Accept: 'text/html', 'User-Agent': 'AutaMedica-REFEPS-Lookup/1.0', ...init?.headers },
    });
    if (!response.ok) fail('REFEPS_DISCOVERY_UNAVAILABLE');
    const html = await response.text();
    if (html.length > MAX_HTML_LENGTH) fail('REFEPS_DISCOVERY_INVALID_RESPONSE');
    return html;
  };
  try {
    const fields = formFields(await request());
    fields.set('searchBy', 'matricula'); fields.set('matricula', matricula);
    fields.set('dni', ''); fields.set('apellidonombre', ''); fields.set('tarro_de_miel', ''); fields.set('op', 'Consultar');
    const items = directoryItems(await request({ method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: fields.toString() }));
    if (!items.every(isDirectoryItem)) fail('REFEPS_DISCOVERY_INVALID_RESPONSE');
    const matches = items.filter((item) => item.profesiones.some((profession) => normalized(profession.profesionReferencia) === 'medico'
      && profession.matriculas.some((registration) => refepsLicenseKey(registration.matricula, type) === matricula
        && (!province || jurisdictionKey(registration.provinciaMatricula) === jurisdictionKey(province)))));
    if (!matches.length) fail('REFEPS_DISCOVERY_NOT_FOUND');
    const namedMatches = expectedName ? matches.filter((item) => nameKey(`${item.nombre} ${item.apellido}`) === nameKey(expectedName)) : matches;
    if (!namedMatches.length) fail('REFEPS_DISCOVERY_IDENTITY_MISMATCH');
    const ids = [...new Set(namedMatches.map((item) => item.codigo))];
    if (ids.length !== 1 || !ids[0]) fail('REFEPS_DISCOVERY_AMBIGUOUS');
    return ids[0];
  } catch (error) {
    if (error instanceof Error && 'code' in error && typeof error.code === 'string' && error.code.startsWith('REFEPS_')) throw error;
    fail(controller.signal.aborted ? 'REFEPS_TIMEOUT' : 'REFEPS_DISCOVERY_UNAVAILABLE');
  } finally { clearTimeout(timeout); }
}
