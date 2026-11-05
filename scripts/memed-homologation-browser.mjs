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
  email: 'paciente-demo-autamedica@example.invalid',
  endereco: 'Rua de Teste, 123 - NAO EXISTE',
  cidade: 'Cidade de Homologacao',
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
  demoItemAdded: false,
  generateClicked: false,
  continueClicked: false,
  postContinueControls: { emit: false, confirm: false },
  afterContinueActions: {},
  afterContinueForm: [],
  formFieldTypes: [],
  clinicianReady: { physicianIdentity: false, birthDate: false },
  iframeRepoAvailable: [],
  postGenerateControls: { continue: false, emit: false, confirm: false },
  demoUiButtons: { generate: false, continue: false, emit: false },
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
  result.clinicianReady.physicianIdentity = true;
  result.clinicianReady.birthDate = Boolean(attrs.data_nascimento);

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
        if (module?.name === 'plataforma.prescricao') {
          window.__memedDemo.ready = true;
          window.MdHub?.event?.add('prescricaoImpressa', () => { window.__memedDemo.emissionEventReceived = true; });
        }
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
    let demoItemAdded = false;
    try {
      await hub.command.send('plataforma.prescricao', 'setFeatureToggle', {
        deletePatient: false, editPatient: false, editIdentification: true,
        forceSign: false, allowShareModal: false,
      });
      await hub.command.send('plataforma.prescricao', 'setWorkplace', {
        city: 'Cidade Teste', state: 'RS', cnes: '0000000',
        local_name: 'AutaMedica HOMOLOGACAO - SEM VALIDADE',
        address: 'Endereco Ficticio de Teste',
      });
      await hub.command.send('plataforma.prescricao', 'setPaciente', patient);
      patientSet = true;
      await hub.module.show('plataforma.prescricao');

      try {
        await hub.command.send('plataforma.prescricao', 'addItem', {
          nome: 'DOCUMENTO DEMO - NAO E MEDICAMENTO - SEM VALIDADE',
          posologia: '<p>Somente teste de integracao, nao dispensar.</p>',
          quantidade: 1,
        });
        demoItemAdded = true;
      } catch { /* SDK may reject test-only items */ }
      return { patientSet, moduleShown: true, demoItemAdded, error: null };
    } catch {
      return { patientSet, moduleShown: false, error: 'sdk_command_rejected' };
    }
  }, PATIENT);
  result.patientSet = actions.patientSet;
  result.moduleShown = actions.moduleShown;
  result.demoItemAdded = Boolean(actions.demoItemAdded);
  await page.waitForTimeout(1200);
  for (const frame of page.frames()) {
    try {
      const checks = [
        ['generate', /gerar prescri[cç][aã]o|gerar receita/i],
        ['continue', /continuar|avan[cç]ar/i],
        ['emit', /enviar e emitir|^emitir$|^concluir$/i],
      ];
      for (const [name, pattern] of checks) {
        const button = frame.getByRole('button', { name: pattern }).first();
        if (await button.isVisible({ timeout: 200 })) result.demoUiButtons[name] = true;
      }
    } catch { /* widget may be loaded inside another iframe */ }
  }

  result.uiSurfaces = await Promise.all(page.context().pages().map(async currentPage => ({
    frameCount: currentPage.frames().length,
    frameUi: await Promise.all(currentPage.frames().map(async frame => {
      try {
        const tags = await frame.locator('button, [role="button"]').count();
        const inputs = await frame.locator('input').count();
        const pageTitle = await frame.locator('h1,h2').count();
        return { buttons: tags, inputs, headings: pageTitle, isMainFrame: frame === currentPage.mainFrame() };
      } catch { return { buttons: -1, inputs: -1, headings: -1 }; }
    })),
  })));
  if (result.demoUiButtons.generate) {
    for (const frame of page.frames()) {
      const generate = frame.getByRole('button', { name: /gerar prescri[cç][aã]o|gerar receita/i }).first();
      try {
        if (await generate.isVisible({ timeout: 300 }) && await generate.isEnabled()) {
          await generate.click({ timeout: 4000 });
          result.generateClicked = true;
          break;
        }
      } catch { /* test UI can move into a modal */ }
    }
  }
  if (result.generateClicked) {
    await page.waitForTimeout(2500);
    for (const frame of page.frames()) {
      for (const [name, pattern] of [
        ['continue', /continuar|avan[cç]ar/i],
        ['emit', /emitir|concluir|gerar/i],
        ['confirm', /confirmar|salvar/i],
      ]) {
        try {
          if (await frame.getByRole('button', { name: pattern }).first().isVisible({ timeout: 200 })) {
            result.postGenerateControls[name] = true;
          }
        } catch { /* modal not ready */ }
      }
    }
    if (result.postGenerateControls.continue) {
      for (const frame of page.frames()) {
        const next = frame.getByRole('button', { name: /continuar|avan[cç]ar/i }).first();
        try {
          if (await next.isVisible({ timeout: 200 }) && await next.isEnabled()) {
            await next.click({ timeout: 5000 });
            result.continueClicked = true;
            break;
          }
        } catch { /* sandbox modal transition */ }
      }
    }
    if (result.continueClicked) {
      await page.waitForTimeout(7000);
      for (const frame of page.frames()) {
        for (const [name, regex] of [['emit', /gerar|emitir|finalizar|concluir/i],
                                     ['confirm', /confirmar|salvar|aceitar/i]]) {
          try {
            if (await frame.getByRole('button', { name: regex }).first().isVisible({ timeout: 250 })) {
              result.postContinueControls[name] = true;
            }
          } catch {}
        }
      }
    }
    if (result.continueClicked) {
      const actions = ['continuar','enviar','imprimir','gerar','assinar','baixar','voltar','fechar','revisar','confirmar','concluir','salvar','finalizar','compartilhar'];
      for (const action of actions) {
        let visible = false;
        for (const frame of page.frames()) {
          try {
            if (await frame.getByRole('button', { name: new RegExp(action, 'i') }).first().isVisible({ timeout: 120 })) {
              visible = true;
            }
          } catch {}
        }
        result.afterContinueActions[action] = visible;
      }
    }
    if (result.continueClicked) {
      result.afterContinueForm = await Promise.all(page.frames().map(async frame => {
        try {
          return {
            inputs: await frame.locator('input').count(),
            invalid: await frame.locator('input:invalid').count(),
            ariaInvalid: await frame.locator('input[aria-invalid="true"]').count(),
            required: await frame.locator('input[required]').count(),
            emptyRequired: await frame.locator('input[required]:not([value])').count(),
            uncheckedBoxes: await frame.locator('input[type="checkbox"]:not(:checked)').count(),
            alerts: await frame.locator('[role="alert"]').count(),
          };
        } catch { return { inputs: -1 }; }
      }));
    }
    result.formFieldTypes = await Promise.all(page.frames().map(async frame => {
      try {
        const inputs = await frame.locator('input').all();
        const fields = [];
        for (const input of inputs.slice(0, 20)) {
          const type = await input.getAttribute('type') || 'text';
          const identifier = (await input.getAttribute('name') || '').toLowerCase();
          const category = /cpf|documento|passport/.test(identifier) ? 'document' :
            /data|birth|nasc/.test(identifier) ? 'birth_date' :
            /mail/.test(identifier) ? 'email' :
            /phone|tel|cel/.test(identifier) ? 'phone' :
            /endere|address|cep|cnes|cidade|city|estado|uf/.test(identifier) ? 'address' :
            /aceit|termo|consent/.test(identifier) ? 'terms' : 'other';
          fields.push({type, category, visible: await input.isVisible(), filled: Boolean((await input.inputValue().catch(() => '')).trim())});
        }
        return fields;
      } catch {return [];}
    }));
    result.iframeRepoAvailable = await Promise.all(page.frames().map(async frame => {
      try {
        return await frame.evaluate(() => {
          if (!window.locator?.get) return { repositoryReady: false };
          const repository = window.locator.get('usuarioRepository');
          return { repositoryReady: Boolean(repository?.getUser && repository?.getPaciente) };
        });
      } catch { return { repositoryReady: false }; }
    }));
    result.prescriptionIssued = Boolean(await page.evaluate(() => window.__memedDemo?.emissionEventReceived));
  }
  result.sandboxDemoPreflight = true;
  if (!actions.patientSet) throw new Error('memed_patient_set_rejected');
  if (!actions.moduleShown) throw new Error('memed_module_show_rejected');
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
