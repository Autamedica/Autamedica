/**
 * Browser test against Memed's REAL homologation SDK (not production).
 * READ-ONLY by default. A one-shot sandbox emission requires explicit manual dispatch.
 * Test patient/doctor are fictitious; no real contact channels or drugs.
 * The demo user's valid token is obtained at runtime using Memed's public
 * sandbox test keys. Token and synthetic CPF are never logged/artifacted.
 */
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const DOC = 'https://doc.memed.com.br/docs/primeiros-passos/';
const API = 'https://integrations.api.memed.com.br/v1';
const SCRIPT = 'https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js';
const DEMO = {
  externalId: 'autamedica-homologacao-demo-proprio-20261103-01',
  cpf: '92716031410',
  crm: '99091103',
  uf: 'RS',
};
const RUN_MODE = process.env.MEMED_DEMO_MODE === 'emit-once' ? 'emit-once' : 'audit';
const PATIENT = {
  idExterno: 'autamedica-homologacao-paciente-demo-20261103-01',
  nome: 'Paciente DEMO AutaMedica',
  sexo: 'Feminino',
  cpf: '39053344705',
  data_nascimento: '15/05/1985',
  email: 'paciente-demo-autamedica@example.invalid',
  endereco: 'Rua de Teste, 123 - NAO EXISTE',
  cidade: 'Porto Alegre',
};
const result = {
  environment: 'memed_homologation_only',
  productionAccess: false,
  mode: RUN_MODE,
  auditOnly: RUN_MODE !== 'emit-once',
  emitClicked: false,
  alternativeSignatureClicked: false,
  emittedDocumentIds: [],
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
  // Read-only: check whether Memed has already issued a prescription for this exact DEMO patient.
  // Never print physician tokens, other patient data or the full provider response.
  try {
    const historyUrl = new URL(API + '/prescricoes');
    historyUrl.searchParams.set('token', token);
    historyUrl.searchParams.set('page[limit]', '100');
    historyUrl.searchParams.set('page[offset]', '0');
    const historyRes = await fetch(historyUrl, {
      headers: { Accept: 'application/vnd.api+json' },
      redirect: 'error', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(15000),
    });
    result.sandboxPrescriptionHistoryStatus = historyRes.status;
    if (historyRes.ok) {
      const payload = await historyRes.json();
      const list = Array.isArray(payload?.data) ? payload.data : [];
      result.sandboxHistoryCount = list.length;
      const ownedDemo = list.filter(entry => {
        const rx = entry?.attributes?.prescricao || entry?.attributes || {};
        const patient = rx?.paciente || entry?.attributes?.paciente || {};
        return patient.external_id === PATIENT.idExterno ||
          patient.externalId === PATIENT.idExterno;
      });
      result.matchedOwnDemoCount = ownedDemo.length;
      result.ownedDemoHasProviderId = ownedDemo.some(entry =>
        /^[0-9]{1,20}$/.test(String(entry?.id ?? '')));
      const ownedWithId = ownedDemo.find(entry =>
        /^[0-9]{1,20}$/.test(String(entry?.id ?? '')));
      if (ownedWithId) {
        const pdfEndpoint = new URL(API + '/prescricoes/' + String(ownedWithId.id) + '/url-document/full');
        pdfEndpoint.searchParams.set('token', token);
        const pdfResponse = await fetch(pdfEndpoint, {
          headers: { Accept: 'application/vnd.api+json' },
          redirect: 'error', referrerPolicy: 'no-referrer',
          signal: AbortSignal.timeout(15000),
        });
        result.providerPdfEndpointStatus = pdfResponse.status;
        result.providerPdfContentType = (pdfResponse.headers.get('content-type') || '').split(';')[0];
        if (pdfResponse.ok) {
          const bytes = Buffer.from(await pdfResponse.arrayBuffer());
          if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') {
            result.providerPdfIsBinary = true;
            result.providerPdfLength = bytes.length;
          } else {
            const response = JSON.parse(bytes.toString('utf8'));
            result.providerPdfResponseKeys = Object.keys(response || {}).slice(0, 12);
            result.providerPdfDataKeys = Object.keys(response?.data || {}).slice(0, 12);
            const item = Array.isArray(response?.data) ? response.data[0] : response?.data;
            result.providerPdfItemKeys = Object.keys(item || {}).slice(0, 20);
            result.providerPdfItemType = typeof item?.type === 'string' ? item.type : null;
            result.providerPdfItemAttributeKeys = Object.keys(item?.attributes || {}).slice(0, 25);
            result.providerPdfItemLinkKeys = Object.keys(item?.links || {}).slice(0, 15);
            result.providerPdfLinksKeys = Object.keys(response?.links || {}).slice(0, 15);
            result.providerReportedSigned = item?.attributes?.signed === true ||
              item?.attributes?.signed === 1;
            const link = item?.attributes?.link;
            if (typeof link === 'string' && link.length > 0) {
              const downloadUrl = new URL(link);
              const hostname = downloadUrl.hostname.toLowerCase();
              result.providerPdfLinkHost = hostname;
              const allowed = downloadUrl.protocol === 'https:' &&
                (hostname === 'memed.com.br' || hostname.endsWith('.memed.com.br') ||
                 hostname.endsWith('.amazonaws.com') || hostname.endsWith('.cloudfront.net'));
              if (allowed) {
                const fileRes = await fetch(downloadUrl, {
                  redirect: 'error', referrerPolicy: 'no-referrer',
                  signal: AbortSignal.timeout(20000),
                });
                result.providerPdfDownloadStatus = fileRes.status;
                if (fileRes.ok) {
                  const fileBytes = Buffer.from(await fileRes.arrayBuffer());
                  const validHeader = fileBytes.subarray(0, 5).toString('ascii') === '%PDF-';
                  const validTrailer = fileBytes.subarray(-2048).toString('latin1').includes('%%EOF');
                  result.providerPdfVerified = validHeader && validTrailer && fileBytes.length > 1000;
                  if (result.providerPdfVerified) {
                    mkdirSync('test-results', { recursive: true });
                    writeFileSync('test-results/memed-sandbox-provider-demo.pdf', fileBytes);
                    result.providerPdfBytes = fileBytes.length;
                    result.providerPdfSha256 = createHash('sha256').update(fileBytes).digest('hex');
                  }
                }
              } else {
                result.providerPdfLinkHostAllowed = false;
              }
            }
          }
        }
      }
    }
  } catch {
    result.sandboxPrescriptionHistoryStatus = 'unavailable';
  }

  result.clinicianReady.physicianIdentity = true;
  result.clinicianReady.birthDate = Boolean(attrs.data_nascimento);

  if (RUN_MODE !== 'emit-once') {
    result.sandboxDemoPreflight = true;
    return;
  }
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    throw new Error('sandbox_emission_requires_manual_dispatch');
  }
  const localTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const weekday = localTime.find(part => part.type === 'weekday')?.value;
  const hour = Number(localTime.find(part => part.type === 'hour')?.value);
  if (weekday === 'Sat' || weekday === 'Sun' || !Number.isFinite(hour) || hour < 6) {
    throw new Error('sandbox_outside_service_window');
  }

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
          window.MdHub?.event?.add('prescricaoImpressa', payload => {
            const prescription = payload?.prescricao || payload || {};
            const docs = Array.isArray(prescription.documents) ? prescription.documents : [];
            window.__memedDemo.emissionEventReceived = true;
            window.__memedDemo.issuedDocumentIds = docs
              .filter(d => d?.type === 'full' && d?.status === 'saved')
              .map(d => String(d.prescription_id ?? ''))
              .filter(id => /^[0-9]{1,20}$/.test(id))
              .slice(0, 5);
            window.__memedDemo.issuedPrescriptionUuidPresent =
              typeof prescription.prescriptionUuid === 'string';
          });
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
        city: 'Porto Alegre', state: 'RS', cnes: '0000000',
        local_name: 'AutaMedica HOMOLOGACAO - SEM VALIDADE',
        address: 'Endereco Ficticio de Teste',
        phone: '0000000000',
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
          const rawName = await input.getAttribute('name') || await input.getAttribute('aria-label') || await input.getAttribute('placeholder') || '';
          const fieldName = /^[a-zA-ZÀ-ÿ0-9_\- ]{1,60}$/.test(rawName) ? rawName.toLowerCase() : 'unknown';
          fields.push({fieldName, type, category, visible: await input.isVisible(),
            filled: Boolean((await input.inputValue().catch(() => '')).trim()),
            checked: type === 'checkbox' ? await input.isChecked() : null});
        }
        return fields;
      } catch {return [];}
    }));
    mkdirSync('test-results', { recursive: true });
    await page.screenshot({
      path: 'test-results/memed-demo-identificacao.png',
      fullPage: true,
      animations: 'disabled',
      mask: page.frames().flatMap(frame => [frame.locator('input')]),
    });
    result.iframeRepoAvailable = await Promise.all(page.frames().map(async frame => {
      try {
        return await frame.evaluate(() => {
          if (!window.locator?.get) return { repositoryReady: false };
          const repository = window.locator.get('usuarioRepository');
          return { repositoryReady: Boolean(repository?.getUser && repository?.getPaciente) };
        });
      } catch { return { repositoryReady: false }; }
    }));
    result.preEmitEventReceived = Boolean(await page.evaluate(() => window.__memedDemo?.emissionEventReceived));
  }
  // In the isolated SDK sandbox, suppress all delivery channels before issuance.
  if (result.postGenerateControls.emit) {
    let deliveryControlsFound = false;
    for (const frame of page.frames()) {
      const email = frame.locator('input[name="option_send_enviar_prescricao_digital_email"]');
      const sms = frame.locator('input[name="option_send_enviar_prescricao_digital_sms"]');
      const sign = frame.locator('input[name="option_send_digital_signature"]');
      try {
        if (await email.count() && await sms.count() && await sign.count()) {
          deliveryControlsFound = true;
          if (await email.isChecked()) await email.uncheck({ force: true });
          if (await sms.isChecked()) await sms.uncheck({ force: true });
          if (await sign.isChecked()) await sign.uncheck({ force: true });
          if (await email.isChecked() || await sms.isChecked() || await sign.isChecked()) {
            throw new Error('sandbox_delivery_not_disabled');
          }
          break;
        }
      } catch (err) {
        if (err?.message === 'sandbox_delivery_not_disabled') throw err;
      }
    }
    result.deliveryChannelsOff = deliveryControlsFound;
  }
  if (!result.deliveryChannelsOff) throw new Error('sandbox_delivery_controls_not_confirmed');
  // Never retry the final issue click automatically: duplicates may accrue.
  for (const frame of page.frames()) {
    const button = frame.getByRole('button', { name: /^enviar e emitir$|^emitir$/i }).first();
    try {
      if (await button.isVisible({ timeout: 350 }) && await button.isEnabled()) {
        await button.click({ timeout: 7000 });
        result.emitClicked = true;
        break;
      }
    } catch {}
  }
  if (!result.emitClicked) throw new Error('sandbox_emit_button_not_found');
  for (let i = 0; i < 12; i++) {
    for (const frame of page.frames()) {
      const alternative = frame.getByRole('button', {
        name: /vou assinar de outra forma|assinar de outra forma/i,
      }).first();
      try {
        if (await alternative.isVisible({ timeout: 300 }) && await alternative.isEnabled()) {
          await alternative.click({ timeout: 7000 });
          result.alternativeSignatureClicked = true;
          break;
        }
      } catch {}
    }
    if (result.alternativeSignatureClicked ||
      await page.evaluate(() => Boolean(window.__memedDemo?.emissionEventReceived))) break;
    await page.waitForTimeout(700);
  }
  await page.waitForFunction(() => Boolean(window.__memedDemo?.emissionEventReceived),
    null, { timeout: 18000 }).catch(() => {});
  const issued = await page.evaluate(() => ({
    event: Boolean(window.__memedDemo?.emissionEventReceived),
    documentIds: window.__memedDemo?.issuedDocumentIds || [],
    uuidPresent: Boolean(window.__memedDemo?.issuedPrescriptionUuidPresent),
  }));
  result.prescriptionIssued = issued.event;
  result.emittedDocumentIds = issued.documentIds;
  result.emittedPrescriptionUuidPresent = issued.uuidPresent;
  if (!result.prescriptionIssued) throw new Error('sandbox_issuance_event_not_received');

  for (const providerId of issued.documentIds) {
    const url = new URL(API + '/prescricoes/' + providerId + '/url-document/full');
    url.searchParams.set('token', token);
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.api+json' }, redirect: 'error',
      referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000),
    });
    result.emittedPdfEndpointStatus = response.status;
    if (!response.ok) continue;
    const json = await response.json().catch(() => null);
    const doc = Array.isArray(json?.data) ? json.data[0] : json?.data;
    const pdfLink = doc?.attributes?.link;
    if (typeof pdfLink !== 'string' || !pdfLink) continue;
    const downloadUrl = new URL(pdfLink);
    const host = downloadUrl.hostname.toLowerCase();
    if (downloadUrl.protocol !== 'https:' ||
        !(host === 'memed.com.br' || host.endsWith('.memed.com.br') ||
          host.endsWith('.amazonaws.com') || host.endsWith('.cloudfront.net'))) {
      throw new Error('sandbox_pdf_host_not_allowed');
    }
    const fileResponse = await fetch(downloadUrl, {
      redirect: 'error', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(25000),
    });
    if (!fileResponse.ok) continue;
    const data = Buffer.from(await fileResponse.arrayBuffer());
    if (data.length <= 1000 || data.subarray(0, 5).toString('ascii') !== '%PDF-' ||
        !data.subarray(-2048).toString('latin1').includes('%%EOF')) continue;
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/memed-sandbox-provider-demo.pdf', data);
    result.providerPdfVerified = true;
    result.providerPdfBytes = data.length;
    result.providerPdfSha256 = createHash('sha256').update(data).digest('hex');
    break;
  }
  if (!result.providerPdfVerified) throw new Error('sandbox_provider_pdf_not_verified');
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
