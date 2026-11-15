const doctorId = process.env.MEMED_PILOT_DOCTOR_ID ?? '';
const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const apiKey = process.env.MEMED_API_KEY ?? '';
const secretKey = process.env.MEMED_SECRET_KEY ?? '';
const apiUrl = process.env.MEMED_API_URL ?? 'https://api.memed.com.br/v1';

const required = [doctorId, supabaseUrl, serviceRoleKey, apiKey, secretKey];
if (required.some((value) => !value)) {
  console.error('MEMED_PILOT_REGISTRATION_SKIPPED=required_credentials_missing');
  process.exit(2);
}
if (!/^[0-9a-f-]{36}$/i.test(doctorId) || apiUrl !== 'https://api.memed.com.br/v1') {
  console.error('MEMED_PILOT_REGISTRATION_FAILED=invalid_configuration');
  process.exit(1);
}

const safeFetch = async (url, options = {}) => {
  try {
    return await fetch(url, {
      ...options,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('network_request_failed');
  }
};

const supabaseRows = async (table, params) => {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await safeFetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`supabase_lookup_failed:${table}:${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error(`supabase_response_invalid:${table}`);
  return rows;
};

const cpfDigits = (value) => String(value ?? '').replace(/\D/g, '');
const validCpf = (value) => {
  const cpf = cpfDigits(value);
  if (!/^\d{11}$/.test(cpf) || /^([0-9])\1{10}$/.test(cpf)) return false;
  const digit = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
};
const digits = (value) => String(value ?? '').replace(/\D/g, '');
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : null;

const doctorRows = await supabaseRows('doctors', {
  id: `eq.${doctorId}`,
  select: 'id,user_id,active,license_type,license_number,uf_brazil,care_country,cpf,memed_birth_date',
});
const doctor = doctorRows[0];
if (!doctor || doctor.id !== doctorId || doctor.active !== true
    || doctor.license_type !== 'CRM' || doctor.care_country !== 'BR') {
  throw new Error('pilot_doctor_record_not_eligible');
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(doctor.memed_birth_date ?? ''))) {
  throw new Error('pilot_doctor_birth_date_missing');
}
const birthDate = new Date(`${doctor.memed_birth_date}T00:00:00.000Z`);
if (Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== doctor.memed_birth_date
    || birthDate.getTime() >= Date.now()) {
  throw new Error('pilot_doctor_birth_date_invalid');
}
const crm = digits(doctor.license_number);
const uf = String(doctor.uf_brazil ?? '').toUpperCase();
if (!crm || !/^[A-Z]{2}$/.test(uf)) throw new Error('pilot_doctor_crm_incomplete');

const profileRows = await supabaseRows('profiles', {
  user_id: `eq.${doctor.user_id}`,
  select: 'first_name,last_name,email,phone,cpf',
});
const profile = profileRows[0];
const privateIdentityRows = await supabaseRows('memed_doctor_identities', {
  doctor_id: `eq.${doctorId}`,
  select: 'cpf',
});
const cpf = [privateIdentityRows[0]?.cpf, doctor.cpf, profile?.cpf]
  .map(cpfDigits).find(validCpf);
if (!cpf) throw new Error('pilot_doctor_verified_cpf_missing');

const licenses = await supabaseRows('doctor_licenses', {
  doctor_id: `eq.${doctorId}`,
  license_type: 'eq.CRM',
  status: 'eq.active',
  cfm_validation_status: 'eq.valid',
  select: 'license_number,uf_brazil,cfm_evidence_path,cfm_review_notes,cfm_reviewed_by,cfm_reviewed_at,cfm_last_checked_at',
});
const verifiedLicense = licenses.some((row) =>
  digits(row.license_number) === crm
  && String(row.uf_brazil ?? '').toUpperCase() === uf
  && Boolean(String(row.cfm_evidence_path ?? '').trim())
  && String(row.cfm_review_notes ?? '').trim().length >= 10
  && Boolean(row.cfm_reviewed_by && row.cfm_reviewed_at && row.cfm_last_checked_at));
if (!verifiedLicense) throw new Error('pilot_doctor_cfm_license_not_verified');

const firstName = String(profile?.first_name ?? '').trim();
const lastName = String(profile?.last_name ?? '').trim();
if (!firstName || !lastName) throw new Error('pilot_doctor_name_missing');

const providerUrl = (path, identifier) => {
  const url = new URL(`${apiUrl}${path}${identifier ? `/${encodeURIComponent(identifier)}` : ''}`);
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('secret-key', secretKey);
  return url;
};
const headers = {
  Accept: 'application/vnd.api+json',
  'Content-Type': 'application/json',
};
const parseProvider = async (response) => {
  let payload;
  try { payload = await response.json(); } catch { throw new Error('memed_response_invalid'); }
  return object(payload);
};
const assertIdentity = (attributes) => {
  const attrs = object(attributes);
  if (!attrs || cpfDigits(attrs.cpf) !== cpf) throw new Error('memed_provider_cpf_mismatch');
  if (attrs.external_id !== undefined && attrs.external_id !== doctorId) {
    throw new Error('memed_provider_external_id_mismatch');
  }
  const board = object(attrs.board);
  const crmValues = [attrs.crm, board?.board_number].filter((value) =>
    value !== undefined && value !== null && String(value).trim() !== '');
  const ufValues = [attrs.uf, board?.board_state].filter((value) =>
    value !== undefined && value !== null && String(value).trim() !== '');
  if (!crmValues.length || !crmValues.every((value) => digits(value) === crm)
      || !ufValues.length || !ufValues.every((value) => String(value).trim().toUpperCase() === uf)
      || (board?.board_code && String(board.board_code).toUpperCase() !== 'CRM')) {
    throw new Error('memed_provider_crm_uf_mismatch');
  }
  if (typeof attrs.token !== 'string' || !attrs.token.trim()) {
    throw new Error('memed_provider_token_missing');
  }
  return attrs;
};

let registration = 'already_registered';
const lookupResponse = await safeFetch(providerUrl('/sinapse-prescricao/usuarios', cpf), { headers });
if (lookupResponse.status === 200) {
  const payload = await parseProvider(lookupResponse);
  assertIdentity(payload?.data?.attributes);
} else if (lookupResponse.status === 404) {
  const payload = {
    data: {
      type: 'usuarios',
      attributes: {
        external_id: doctorId,
        nome: firstName,
        sobrenome: lastName,
        cpf,
        board: {
          board_code: 'CRM',
          board_number: crm,
          board_state: uf,
        },
        email: profile?.email || undefined,
        telefone: profile?.phone ? digits(profile.phone) : undefined,
        data_nascimento: doctor.memed_birth_date.split('-').reverse().join('/'),
      },
    },
  };
  const createResponse = await safeFetch(providerUrl('/sinapse-prescricao/usuarios'), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!createResponse.ok) throw new Error(`memed_registration_failed:${createResponse.status}`);
  const created = await parseProvider(createResponse);
  assertIdentity(created?.data?.attributes);
  registration = 'created';
} else {
  throw new Error(`memed_lookup_failed:${lookupResponse.status}`);
}

const persistUrl = new URL('/rest/v1/memed_doctor_identities', supabaseUrl);
persistUrl.searchParams.set('on_conflict', 'doctor_id');
const persistResponse = await safeFetch(persistUrl, {
  method: 'POST',
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify({ doctor_id: doctorId, cpf }),
});
if (!persistResponse.ok) throw new Error(`memed_private_identity_persist_failed:${persistResponse.status}`);

console.log(`MEMED_PILOT_REGISTRATION=${registration}`);
console.log('MEMED_PILOT_DOCTOR_FOUND=true');
console.log('MEMED_PILOT_IDENTITY_VERIFIED=true');
console.log('MEMED_PILOT_PRIVATE_IDENTITY_STORED=true');
