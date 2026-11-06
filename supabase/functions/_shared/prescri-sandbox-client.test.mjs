/**
 * Run: node --experimental-strip-types --test supabase/functions/_shared/prescri-sandbox-client.test.mjs
 * No network or provider credentials required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTestCredentials, createPrescriDemo, getPrescriDemo,
  downloadPrescriDemoPdf, demoDocumentPayload, PRESCRI_DEMO_EXTERNAL_ID,
} from './prescri-sandbox-client.ts';

const credentials = { key: 'pk_test_fake_in_memory', secret: 'sk_test_fake_in_memory' };
const identifier = 'test_sig_Autamedica001';
const sandboxSignature = {
  signature_id: identifier,
  status: 'signed',
  external_id: PRESCRI_DEMO_EXTERNAL_ID,
  sandbox: true,
  cryptographically_signed: false,
};

test('rejects production keys unconditionally', () => {
  assert.throws(() => assertTestCredentials({ key: 'pk_live_real', secret: 'sk_live_real' }));
  assert.throws(() => assertTestCredentials({ key: '', secret: '' }));
});

test('fixture is synthetic, stable, does not deliver or reserve controlled prescriptions', () => {
  const p = demoDocumentPayload();
  assert.equal(p.doctor_cpf, '00000000000');
  assert.equal(p.patient.cpf, '00000000000');
  assert.equal(p.external_id, PRESCRI_DEMO_EXTERNAL_ID);
  assert.equal(p.idempotency_by_external_id, true);
  assert.equal(p.idempotency_key, PRESCRI_DEMO_EXTERNAL_ID);
  assert.deepEqual(p.delivery, { whatsapp: false, email: false });
  assert.equal('sncr_reservation_token' in p, false);
  assert.match(p.document.title, /SEM VALIDADE/);
});

test('create sends idempotency key and only the synthetic fixture', async () => {
  let invoked = 0;
  const fetcher = async (url, options) => {
    invoked++;
    assert.equal(url.hostname, 'suykokupoevtdfalrzue.supabase.co');
    assert.equal(url.pathname, '/functions/v1/api-signatures-create');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.get('X-API-Key'), credentials.key);
    assert.equal(options.headers.get('Idempotency-Key'), PRESCRI_DEMO_EXTERNAL_ID);
    const data = JSON.parse(options.body);
    assert.deepEqual(data, demoDocumentPayload());
    return Response.json(sandboxSignature, { status: 201 });
  };
  const result = await createPrescriDemo(credentials, fetcher);
  assert.equal(invoked, 1);
  assert.equal(result.signature_id, identifier);
  assert.equal(result.cryptographically_signed, false);
});

test('does not accept a provider response lacking sandbox attestation', async () => {
  await assert.rejects(
    createPrescriDemo(credentials, async () => Response.json({
      ...sandboxSignature, sandbox: false,
    })),
    /prescri_sandbox_attestation_missing/,
  );
});

test('status only accepts the exact immutable demo external_id', async () => {
  await assert.rejects(
    getPrescriDemo(credentials, undefined, async () => Response.json({
      ...sandboxSignature, external_id: 'unrelated-patient',
    })),
    /prescri_sandbox_external_id_mismatch/,
  );
});

test('PDF fetch validates provider provenance and PDF structure', async () => {
  const pdf = new TextEncoder().encode(
    '%PDF-1.4\n' + 'X'.repeat(130) + '\n%%EOF\n',
  );
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(url.pathname);
    if (url.pathname.endsWith('/api-signatures-get')) {
      assert.equal(url.searchParams.get('external_id'), PRESCRI_DEMO_EXTERNAL_ID);
      return Response.json(sandboxSignature);
    }
    assert.equal(url.pathname, '/functions/v1/api-signatures-pdf');
    assert.equal(url.searchParams.get('id'), identifier);
    assert.equal(options.headers.get('X-API-Secret'), credentials.secret);
    return new Response(pdf, { headers: { 'Content-Type': 'application/pdf' } });
  };
  const result = await downloadPrescriDemoPdf(credentials, fetcher);
  assert.equal(result.bytes.length, pdf.length);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(calls, [
    '/functions/v1/api-signatures-get',
    '/functions/v1/api-signatures-pdf',
  ]);
});

test('never returns an HTML error page as PDF', async () => {
  await assert.rejects(
    downloadPrescriDemoPdf(credentials, async (url) =>
      url.pathname.endsWith('/api-signatures-get')
        ? Response.json(sandboxSignature)
        : new Response('<html>error</html>', {
          headers: { 'Content-Type': 'text/html' },
        })),
    /prescri_provider_pdf_wrong_content_type/,
  );
});

test('unsigned/pending provider document is not downloaded', async () => {
  let calls = 0;
  await assert.rejects(
    downloadPrescriDemoPdf(credentials, async () => {
      calls++;
      return Response.json({ ...sandboxSignature, status: 'pending_authorization' });
    }),
    /prescri_sandbox_pdf_not_ready/,
  );
  assert.equal(calls, 1);
});
