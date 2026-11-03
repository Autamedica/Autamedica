/**
 * Live Memed HOMOLOGATION smoke only. No production credentials/endpoints.
 * Fixed test keys are loaded at runtime from Memed's own public quickstart,
 * never hardcoded in source, emitted to CI logs, or sent to a foreign host.
 *
 * Usage: node scripts/memed-homologation-smoke.mjs
 * Optional controlled sandbox mutation: MEMED_HOMO_REGISTER_DEMO=true
 */
import { writeFileSync } from 'node:fs';

const API_BASE = 'https://integrations.api.memed.com.br/v1';
const DOC_URL = 'https://doc.memed.com.br/docs/primeiros-passos/';
const REGISTER = process.env.MEMED_HOMO_REGISTER_DEMO === 'true';
const VALIDATE_DEMO = process.env.MEMED_HOMO_VALIDATE_DEMO === 'true';
const report = {
  environment: 'Memed homologacao',
  timestamp: new Date().toISOString(),
  productionContacted: false,
  testKeysFromOfficialDocs: false,
  checkKey: { attempted: false, httpStatus: null, valid: false },
  demoDoctor: { attempted: false, httpStatus: null, registered: false, providerCodes: [] },
  demoCfmValidation: { attempted: false, httpStatus: null, validated: false, providerCodes: [] },
  patientRegistration: 'not_applicable_to_backend_smoke',
  prescriptionIssued: false,
  signatureVerified: false,
};

const summarize = () => {
  const body = JSON.stringify(report, null, 2);
  console.log(body);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Memed homologação real — resultado sanitizado\n\n\`\`\`json\n${body}\n\`\`\`\n\nSem receitas/assinaturas reais.\n`, { flag: 'a' });
  }
};

function authCodes(payload) {
  const candidates = payload && typeof payload === 'object'
    ? (Array.isArray(payload.errors) ? payload.errors
      : Array.isArray(payload.success) ? payload.success : []) : [];
  return candidates.map(x => String(x?.code || 'unknown').slice(0, 60)).slice(0, 6);
}
async function endpoint(path, { apiKey, secretKey }, options = {}) {
  const url = new URL(API_BASE + path);
  if (url.origin !== 'https://integrations.api.memed.com.br') throw new Error('host_not_allowlisted');
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('secret-key', secretKey);
  const response = await fetch(url, {
    ...options,
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: 'application/vnd.api+json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* sanitize malformed provider responses */ }
  return { status: response.status, payload };
}

async function main() {
  // Only Memed public documentation can be used to retrieve the fixed test pair.
  const d = await fetch(DOC_URL, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!d.ok) throw new Error(`official_documentation_unavailable_http_${d.status}`);
  const source = await d.text();
  const apiKey = source.match(/iJGiB4[A-Za-z0-9]{50}/)?.[0];
  const secretKey = source.match(/Xe8M5Gv[A-Za-z0-9]{49}/)?.[0];
  if (apiKey?.length !== 56 || secretKey?.length !== 56) {
    throw new Error('official_test_keys_not_found_in_documentation');
  }
  report.testKeysFromOfficialDocs = true;
  report.checkKey.attempted = true;
  const check = await endpoint('/sinapse-prescricao/check-key', { apiKey, secretKey }, { method: 'GET' });
  report.checkKey.httpStatus = check.status;
  report.checkKey.valid = check.status === 200 && authCodes(check.payload).includes('chave-valida');
  if (!report.checkKey.valid) {
    report.checkKey.providerCodes = authCodes(check.payload);
    throw new Error('homologation_keys_rejected_or_service_unavailable');
  }
  if (!REGISTER && !VALIDATE_DEMO) return;

  // All fields are unmistakably DEMO (never from AutaMedica's production DB).
  const demo = {
    data: {
      type: 'usuarios',
      attributes: {
        external_id: 'autamedica-demo-docs-exemplo-20261103',
        nome: 'Gustavo',
        sobrenome: 'Ribeiro Sousa',
        cpf: '53076220403', // DEMO fixture from Memed's own 'Cadastrar o prescritor' example
        board: { board_code: 'CRM', board_number: '315435435', board_state: 'SP' },
        email: 'medico-autamedica-demo@example.invalid',
        sexo: 'M',
        data_nascimento: '05/09/1972',
      },
    },
  };
  if (VALIDATE_DEMO) {
    report.demoCfmValidation.attempted = true;
    const validate = await endpoint('/sinapse-prescricao/usuarios/validate-board', { apiKey, secretKey }, {
      method: 'POST', body: JSON.stringify(demo),
    });
    report.demoCfmValidation.httpStatus = validate.status;
    report.demoCfmValidation.providerCodes = authCodes(validate.payload);
    // Schema metadata only. Do not log provider payload, identity, or tokens.
    const data = validate.payload?.data;
    const attributes = data?.attributes;
    const names = (value) => value && typeof value === 'object'
      ? Object.keys(value).slice(0, 12) : [];
    report.demoCfmValidation.responseShape = {
      rootKeys: names(validate.payload),
      dataKeys: names(data),
      attributeKeys: names(attributes),
      outcome: ['approved', 'rejected', 'pending'].includes(attributes?.outcome)
        ? attributes.outcome : null,
      validatedType: typeof attributes?.validated,
    };
    report.demoCfmValidation.validated = validate.status === 200
      && validate.payload?.data?.attributes?.validated === true
      && validate.payload?.data?.attributes?.outcome === 'approved';
  }
  // The dry-run never mutates providers; do not register a known invalid doctor.
  if (!REGISTER || (VALIDATE_DEMO && !report.demoCfmValidation.validated)) return;

  report.demoDoctor.attempted = true;
  const result = await endpoint('/sinapse-prescricao/usuarios', { apiKey, secretKey }, {
    method: 'POST', body: JSON.stringify(demo),
  });
  report.demoDoctor.httpStatus = result.status;
  report.demoDoctor.providerCodes = authCodes(result.payload);
  const attrs = result.payload?.data?.attributes;
  report.demoDoctor.registered = result.status >= 200 && result.status < 300
    && typeof attrs?.token === 'string' && attrs.token.length > 0
    && attrs?.cpf === demo.data.attributes.cpf;
  // Token and returned PII are neither logged nor stored.
  if (!report.demoDoctor.registered) throw new Error('demo_doctor_not_registered');
}

let failed = false;
try { await main(); }
catch (error) {
  failed = true;
  report.failure = error instanceof Error && /^(official_|homologation_|demo_doctor_|host_)/.test(error.message)
    ? error.message : 'network_or_unexpected_error';
}
summarize();
if (failed) process.exitCode = 1;
