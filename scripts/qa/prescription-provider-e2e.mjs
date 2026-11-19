#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const validCases = new Set(['ar-web', 'ar-android', 'br-web', 'br-android']);
const caseIndex = process.argv.indexOf('--case');
const selectedCase = process.env.E2E_CASE ?? (caseIndex >= 0 ? process.argv[caseIndex + 1] : undefined);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function queryRows(table, filters, select) {
  const url = new URL(`${required('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/${table}`);
  url.searchParams.set('select', select);
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);

  const key = required('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  assert(response.ok, `database_read_failed:${table}:${response.status}`);
  return response.json();
}

async function oneRow(table, filters, select) {
  const rows = await queryRows(table, filters, select);
  assert(Array.isArray(rows) && rows.length === 1, `database_record_missing_or_ambiguous:${table}`);
  return rows[0];
}

async function authenticatedPdfRequest(url, token) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
}

async function runCase(name) {
  const provider = name.startsWith('ar-') ? 'AR' : 'BR';
  const platform = name.endsWith('-web') ? 'web' : 'android';
  const prefix = `E2E_${provider}_`;
  const doctorId = required(`${prefix}DOCTOR_ID`);
  const patientId = required(`${prefix}PATIENT_ID`);
  const externalId = required(`${prefix}EXTERNAL_ID`);
  const patientToken = required(`${prefix}PATIENT_TOKEN`);
  const baseUrl = required('AUTAMEDICA_WEB_API_URL').replace(/\/$/, '');

  const [doctor, patient] = await Promise.all([
    oneRow('doctors', { id: `eq.${doctorId}` }, 'id,care_country,active'),
    oneRow('patients', { id: `eq.${patientId}` }, 'id,care_country,active,lgpd_consent,lgpd_consent_date'),
  ]);
  assert(doctor.active === true && patient.active === true, 'inactive_clinical_party');
  assert(doctor.care_country === provider && patient.care_country === provider, 'care_country_mismatch');

  let record;
  let rowId;
  let expectedHash;
  let byteLength;
  let recordStatus;
  let signatureVerified;
  let deliveryConfirmed = null;
  let persistedExternalId;
  let apiPath;

  if (provider === 'AR') {
    rowId = required('E2E_AR_PRESCRIPTION_ID');
    record = await oneRow('prescriptions', { id: `eq.${rowId}` },
      'id,doctor_id,patient_id,country_code,vendor_name,vendor_id,status,signature_method,pdf_sha256,pdf_byte_length');
    assert(record.doctor_id === doctorId && record.patient_id === patientId, 'prescription_party_mismatch');
    assert(record.country_code === 'AR' && record.vendor_name?.toLowerCase() === 'farmalink', 'farmalink_provider_mismatch');
    assert(record.signature_method === 'ac_external', 'pades_signature_method_missing');
    assert(/^(active|signed|sent)$/i.test(record.status), 'farmalink_prescription_not_issued');
    assert(typeof record.pdf_sha256 === 'string' && /^[0-9a-f]{64}$/.test(record.pdf_sha256), 'persisted_pdf_sha256_missing');
    assert(Number(record.pdf_byte_length) > 0, 'persisted_pdf_byte_length_missing');

    const audits = await queryRows('prescription_audit_events',
      { prescription_id: `eq.${rowId}` }, 'event_type,signature_hash,metadata');
    const signedEvent = audits.find((event) => event.event_type === 'ACT_DIGITAL_SIGNATURE');
    const issuedEvent = audits.find((event) => event.event_type === 'issued');
    assert(signedEvent && issuedEvent, 'pades_audit_events_missing');
    assert(signedEvent.signature_hash === record.pdf_sha256 &&
      signedEvent.metadata?.document_hash === record.pdf_sha256 &&
      issuedEvent.metadata?.signature_hash === record.pdf_sha256, 'pades_audit_hash_mismatch');

    persistedExternalId = record.vendor_id;
    expectedHash = record.pdf_sha256;
    byteLength = Number(record.pdf_byte_length);
    recordStatus = record.status;
    signatureVerified = true;
    apiPath = `/api/doctors/prescriptions/${encodeURIComponent(rowId)}/pdf`;
  } else {
    rowId = required('E2E_BR_MEMED_ROW_ID');
    record = await oneRow('memed_prescriptions', { id: `eq.${rowId}` },
      'id,doctor_id,patient_id,memed_id,status,pdf_signature_verified,patient_delivery_confirmed,pdf_sha256,pdf_byte_length');
    assert(record.doctor_id === doctorId && record.patient_id === patientId, 'memed_record_party_mismatch');
    assert(record.status !== 'deleted', 'memed_record_deleted');
    assert(record.pdf_signature_verified === true, 'memed_provider_signature_not_verified');
    assert(patient.lgpd_consent === true && Boolean(patient.lgpd_consent_date), 'patient_lgpd_consent_missing');

    persistedExternalId = record.memed_id;
    expectedHash = record.pdf_sha256;
    byteLength = record.pdf_byte_length === null ? null : Number(record.pdf_byte_length);
    recordStatus = record.status;
    signatureVerified = record.pdf_signature_verified;
    deliveryConfirmed = record.patient_delivery_confirmed === true;
    apiPath = `/api/patients/prescriptions/${encodeURIComponent(`memed-${rowId}`)}/pdf`;
  }

  assert(persistedExternalId === externalId, 'provider_external_id_mismatch');
  const pdfUrl = `${baseUrl}${apiPath}`;

  const crossUserResponse = await authenticatedPdfRequest(pdfUrl, required('E2E_CROSS_USER_TOKEN'));
  const crossUserStatus = crossUserResponse.status;
  if (crossUserStatus !== 401 && crossUserStatus !== 403) {
    await crossUserResponse.body?.cancel();
    throw new Error(`cross_user_access_not_denied:${crossUserStatus}`);
  }
  await crossUserResponse.body?.cancel();

  let actualBytes;
  let patientAccessStatus;
  let responseHash = null;
  if (platform === 'web') {
    const response = await authenticatedPdfRequest(pdfUrl, patientToken);
    patientAccessStatus = response.status;
    assert(response.status === 200, `patient_download_failed:${response.status}`);
    assert(response.headers.get('content-type')?.toLowerCase().includes('application/pdf'), 'patient_response_not_pdf');
    responseHash = response.headers.get('x-content-sha256');
    assert(typeof responseHash === 'string' && /^[0-9a-f]{64}$/.test(responseHash), 'response_hash_header_missing');
    actualBytes = new Uint8Array(await response.arrayBuffer());
  } else {
    actualBytes = await readFile(required(`${prefix}ANDROID_PDF_PATH`));
    patientAccessStatus = 'app_download_verified';
  }

  assert(actualBytes.byteLength > 5 &&
    new TextDecoder().decode(actualBytes.subarray(0, 5)) === '%PDF-', 'downloaded_file_not_pdf');
  const actualHash = sha256(actualBytes);

  if (provider === 'BR') {
    const persisted = await oneRow('memed_prescriptions', { id: `eq.${rowId}` },
      'pdf_sha256,pdf_byte_length,pdf_signature_verified');
    expectedHash = persisted.pdf_sha256;
    byteLength = persisted.pdf_byte_length === null ? null : Number(persisted.pdf_byte_length);
    assert(persisted.pdf_signature_verified === true, 'memed_signature_verification_missing');
    assert(typeof expectedHash === 'string' && /^[0-9a-f]{64}$/.test(expectedHash), 'persisted_pdf_sha256_missing_after_download');
    assert(byteLength > 0, 'persisted_pdf_byte_length_missing_after_download');
  }

  if (responseHash !== null) assert(responseHash === expectedHash, 'response_hash_header_mismatch');
  assert(actualHash === expectedHash, 'downloaded_pdf_sha256_mismatch');
  assert(byteLength === actualBytes.byteLength, 'downloaded_pdf_byte_length_mismatch');

  return {
    case: name,
    doctor_id: doctorId,
    patient_id: patientId,
    care_country: provider,
    external_id: persistedExternalId,
    provider_status: recordStatus,
    signature_verified: signatureVerified,
    patient_delivery_confirmed: deliveryConfirmed,
    database_persistence: 'verified',
    patient_access_status: patientAccessStatus,
    cross_user_http_status: crossUserStatus,
    sha256: actualHash,
    byte_length: actualBytes.byteLength,
    result: 'PASS',
  };
}

if (!selectedCase || !validCases.has(selectedCase)) {
  process.stderr.write('Usage: node scripts/qa/prescription-provider-e2e.mjs --case ar-web|ar-android|br-web|br-android\n');
  process.exitCode = 2;
} else {
  try {
    process.stdout.write(`${JSON.stringify(await runCase(selectedCase), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${selectedCase}: ${error instanceof Error ? error.message : 'unknown_error'}\n`);
    process.exitCode = 1;
  }
}
