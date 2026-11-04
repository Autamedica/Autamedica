/**
 * Browser test against Memed's REAL homologation SDK (not production).
 * Registers no new prescriber and DOES NOT issue or sign any prescription.
 * The demo user's valid token is obtained at runtime using Memed's public
 * sandbox test keys. Token and synthetic CPF are never logged/artifacted.
 */
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const DOC = 'https://doc.memed.com.br/docs/primeiros-passos/';
const API = 'https://integrations.api.memed.com.br/v1';
const SCRIPT = 'https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js';
const DEMO = {
  externalId: 'autamedica-homologacao-demo-proprio-20261103-01',
  cpf: '92716031410',
  crm: '99091103',
  uf: 'RS',
};
const PATIENT = {
  idExterno: 'autamedica-homologacao-paciente-demo-20261103-01',
  nome: 'Paciente DEMO AutaMedica',
  sexo: 'Feminino',
  cpf: '39053344705',
  data_nascimento: '15/05/1985',
};
const result = {
  environment: 'memed_homologation_only',
  productionAccess: false,
  prescriberAuthenticated: false,
  sdkScriptLoaded: false,
  moduleInitialized: false,
  patientSet: false,
  moduleShown: false,
  prescriptionIssued: false,
  signatureVerified: false,
  errorCode: null,
};
let server;
let browser;

async function main() {
  const docs = await fetch(DOC, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!docs.ok) throw new Error('test_credentials_unavailable');
  const html = await docs.text();
  const key = html.match(/iJGiB4[A-Za-z0-9]{50}/)?.[0];
  const secret = html.match(/Xe8M5Gv[A-Za-z0-9]{49}/)?.[0];
  if (!key || !secret) throw new Error('test_credentials_unavailable');

  const endpoint = new URL(API + '/sinapse-prescricao/usuarios/' + DEMO.cpf);
  endpoint.searchParams.set('api-key', key);
  endpoint.searchParams.set('secret-key', secret);
  const res = await fetch(endpoint, {
    headers: { Accept: 'application/vnd.api+json' },
    redirect: 'error', referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15000),
  });
  if (res.status !== 200) throw new Error('demo_prescriber_lookup_not_200');
  const provider = await res.json();
  const attrs = provider?.data?.attributes;
  const board = attrs?.board;
  if (!attrs || attrs.external_id !== DEMO.externalId || attrs.cpf !== DEMO.cpf ||
      String(board?.board_number) !== DEMO.crm ||
      String(board?.board_state).toUpperCase() !== DEMO.uf ||
      String(board?.board_code).toUpperCase() !== 'CRM' ||
      typeof attrs.token !== 'string' || !attrs.token) {
    throw new Error('demo_prescriber_identity_rejected');
  }
  const token = attrs.token;
  result.prescriberAuthenticated = true;

  server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end('<!doctype html><html lang="pt"><head><meta charset="utf-8"></head><body><div id="memed-prescricao-container"></div></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 850 },
    locale: 'pt-BR',
  });
  // Never allow the real production Memed API or SDK in this test.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'api.memed.com.br' || url.hostname === 'partners.memed.com.br') {
      result.productionAccess = true;
      await route.abort();
    } else {
      await route.continue();
    }
  });

  await page.goto('http://127.0.0.1:' + port, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, scriptUrl }) => {
    window.__memedDemo = { loaded: false, ready: false, failed: false };
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.type = 'text/javascript';
    script.setAttribute('data-token', token);
    script.referrerPolicy = 'no-referrer';
    script.onload = () => {
      window.__memedDemo.loaded = true;
      if (!window.MdSinapsePrescricao?.event?.add) {
        window.__memedDemo.failed = true;
        return;
      }
      window.MdSinapsePrescricao.event.add('core:moduleInit', module => {
        if (module?.name === 'plataforma.prescricao') window.__memedDemo.ready = true;
      });
    };
    script.onerror = () => { window.__memedDemo.failed = true; };
    document.head.appendChild(script);
  }, { token, scriptUrl: SCRIPT });
  try {
    await page.waitForFunction(() => window.__memedDemo?.ready === true ||
      window.__memedDemo?.failed === true, null, { timeout: 45000 });
  } catch {
    throw new Error('memed_sdk_timeout');
  }
  const status = await page.evaluate(() => ({ ...window.__memedDemo }));
  result.sdkScriptLoaded = status.loaded;
  result.moduleInitialized = status.ready;
  if (!status.ready) throw new Error('memed_sdk_not_initialized');
  if (result.productionAccess) throw new Error('production_memd_call_blocked');

  const actions = await page.evaluate(async (patient) => {
    const hub = window.MdHub;
    if (!hub?.command?.send || !hub?.module?.show) return { patientSet: false, moduleShown: false, error: 'hub_missing' };
    let patientSet = false;
    try {
      await hub.command.send('plataforma.prescricao', 'setFeatureToggle', {
        deletePatient: false, editPatient: false, editIdentification: false,
        forceSign: true, allowShareModal: false,
      });
      await hub.command.send('plataforma.prescricao', 'setPaciente', patient);
      patientSet = true;
      await hub.module.show('plataforma.prescricao');
      return { patientSet, moduleShown: true, error: null };
    } catch {
      return { patientSet, moduleShown: false, error: 'sdk_command_rejected' };
    }
  }, PATIENT);
  result.patientSet = actions.patientSet;
  result.moduleShown = actions.moduleShown;

  // Read-only inspection of the actual homologation UI to identify a safe
  // next step. Report only an allowlist of action keywords, not DOM,
  // names, patient details, tokens, requests or screenshots.
  await page.waitForTimeout(1600);
  const keywords = ['nova prescri', 'medicamento', 'adicionar', 'imprimir',
    'finalizar', 'assinar', 'emitir', 'salvar', 'continuar', 'pesquisar',
    'buscar', 'receita', 'prescrever', 'teste'];
  result.uiInspection = [];
  for (const frame of page.frames()) {
    try {
      const matches = await frame.evaluate((words) => {
        const strings = [...document.querySelectorAll(
          'button,[role="button"],input[placeholder],a,[aria-label]'
        )].map(el => (el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') || el.textContent || '')
          .toLowerCase().trim()).filter(value => value.length < 90);
        return words.filter(word => strings.some(x => x.includes(word)));
      }, keywords);
      result.uiInspection.push({ accessible: true, keywords: matches,
        frameKind: frame === page.mainFrame() ? 'host' : 'iframe' });
    } catch {
      result.uiInspection.push({ accessible: false, keywords: [], frameKind: 'iframe' });
    }
  }
  if (!actions.patientSet) throw new Error('memed_patient_set_rejected');
  if (!actions.moduleShown) throw new Error('memed_module_show_rejected');
  if (result.productionAccess) throw new Error('production_memed_call_blocked');

  // Memed's officially documented addItem command. Pure sandbox fixture:
  // no real drug or dosage is prescribed; never sign or print it as valid.
  const itemResult = await page.evaluate(async () => {
    try {
      await window.MdHub.command.send('plataforma.prescricao', 'addItem', {
        nome: 'ITEM DEMO AUTAMEDICA - NAO DISPENSAR',
        posologia: 'NAO ADMINISTRAR. TESTE TECNICO SEM PRESCRICAO CLINICA.',
        quantidade: 1,
        unit: 'embalagem',
        descricao: 'Simulacao de homologacao sem medicamento real',
      });
      return { accepted: true, reason: null };
    } catch {
      return { accepted: false, reason: 'sandbox_add_item_rejected' };
    }
  });
  result.demoItemAdded = itemResult.accepted;
  result.demoItemVisible = false;
  result.signActionVisible = false;
  await page.waitForTimeout(1600);
  for (const frame of page.frames()) {
    try {
      const signal = await frame.evaluate(() => {
        const body = (document.body?.textContent || '').toUpperCase();
        const buttonText = [...document.querySelectorAll('button,[role="button"]')]
          .map(b => (b.textContent || '').toUpperCase());
        return {
          itemVisible: body.includes('ITEM DEMO AUTAMEDICA'),
          signAction: buttonText.some(b => b.includes('ASSINAR')),
        };
      });
      result.demoItemVisible ||= signal.itemVisible;
      result.signActionVisible ||= signal.signAction;
    } catch { /* iframe inaccessible */ }
  }
  // Count only known DEMO item and official action controls, not personal data.
  result.uiCounts = { demoItem: 0, addActions: 0, signActions: 0, signLinks: 0, signAria: 0 };
  for (const frame of page.frames()) {
    result.uiCounts.demoItem += await frame.getByText('ITEM DEMO AUTAMEDICA - NAO DISPENSAR').count().catch(() => 0);
    result.uiCounts.addActions += await frame.getByRole('button', { name: /adicionar/i }).count().catch(() => 0);
    result.uiCounts.signActions += await frame.getByRole('button', { name: /assinar/i }).count().catch(() => 0);
    result.uiCounts.signLinks += await frame.getByRole('link', { name: /assinar/i }).count().catch(() => 0);
    result.uiCounts.signAria += await frame.locator('[aria-label*="Assinar"],[title*="Assinar"]').count().catch(() => 0);
  }
  // Read-only sandbox history. Only expose numeric count and status, not
  // prescription IDs, patient identifiers, provider tokens or document URLs.
  const historyUrl = new URL(API + '/prescricoes');
  historyUrl.searchParams.set('token', token);
  try {
    const historyResponse = await fetch(historyUrl, {
      redirect: 'error', referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/vnd.api+json' },
      signal: AbortSignal.timeout(15000),
    });
    const historyJson = historyResponse.ok ? await historyResponse.json() : null;
    result.sandboxHistory = {
      status: historyResponse.status,
      count: Array.isArray(historyJson?.data) ? historyJson.data.length : null,
    };
  } catch { result.sandboxHistory = { status: null, count: null, error: 'provider_history_unavailable' }; }
  result.signFirstStep = { attempted: false, clicked: false };
  for (const frame of page.frames()) {
    const link = frame.getByRole('link', { name: /assinar/i });
    if (await link.count().catch(() => 0)) {
      result.signFirstStep.attempted = true;
      result.signFirstStep.clicked = await link.first().click({ timeout: 6500 })
        .then(() => true).catch(() => false);
      break;
    }
  }
  await page.waitForTimeout(1800);
  const afterUrl = new URL(API + '/prescricoes');
  afterUrl.searchParams.set('token', token);
  try {
    const response = await fetch(afterUrl, {
      headers: { Accept: 'application/vnd.api+json' },
      redirect: 'error', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(15000),
    });
    const json = response.ok ? await response.json() : null;
    result.sandboxHistoryAfter = {
      status: response.status,
      count: Array.isArray(json?.data) ? json.data.length : null,
    };
  } catch {
    result.sandboxHistoryAfter = { status: null, count: null };
  }
  result.signingPrompt = { dialogs: 0, visibleTopics: [] };
  const topics = ['certificado digital', 'certificado', 'assinatura', 'medicamento',
    'posologia', 'obrigatorio', 'finalizar', 'continuar', 'cancelar',
    'imprimir', 'erro', 'birdid', 'lacuna'];
  for (const frame of page.frames()) {
    result.signingPrompt.dialogs += await frame.getByRole('dialog').count().catch(() => 0);
    for (const topic of topics) {
      const locator = frame.getByText(new RegExp(topic, 'i'));
      if (await locator.count().catch(() => 0) > 0) {
        if (!result.signingPrompt.visibleTopics.includes(topic)) {
          result.signingPrompt.visibleTopics.push(topic);
        }
      }
    }
  }
  if (!itemResult.accepted) throw new Error('sandbox_add_item_rejected');
  if (result.productionAccess) throw new Error('production_memed_call_blocked');
}

try { await main(); }
catch (error) {
  result.errorCode = error instanceof Error && /^[a-z_]+$/.test(error.message)
    ? error.message : 'browser_or_external_dependency_failed';
} finally {
  try { await browser?.close(); } catch {}
  try { await new Promise(resolve => server ? server.close(resolve) : resolve()); } catch {}
}
// Redacted, count/boolean-only evidence. No token, CPF, medical details.
console.log(JSON.stringify(result, null, 2));
if (result.errorCode) process.exitCode = 1;
