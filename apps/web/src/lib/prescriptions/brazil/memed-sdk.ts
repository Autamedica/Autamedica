import { getBrowserSupabaseClient } from '@/lib/supabase-browser';
import type { MemedPatient } from './memed-patient';

interface MemedHub {
  command: { send: (module: string, command: string, data?: Record<string, unknown>) => Promise<unknown> };
  module: { show: (module: string) => Promise<unknown>; hide?: (module: string) => Promise<unknown> };
  event: { add: (name: string, callback: (payload: Record<string, unknown>) => void) => void };
}
interface MemedCore {
  event: { add: (name: string, callback: (module: { name?: string }) => void) => void };
}

const SCRIPT_ID = 'memed-prescricao-script';
const MODULE_NAME = 'plataforma.prescricao';

// Memed mandates a singleton script/listeners in SPA sessions.
let scriptPromise: Promise<void> | null = null;
let scriptToken: string | null = null;
let scriptUserId: string | null = null;
let authObserverInstalled = false;
let sessionInvalidated = false;
let moduleInitialized = false;
let eventListenersRegistered = false;
let activeOnIssued: ((id: string) => void) | null = null;
let activeOnDeleted: ((id: string) => void) | null = null;
let opening: Promise<void> = Promise.resolve();

export function getMemedHub(): MemedHub | undefined {
  return (window as unknown as { MdHub?: MemedHub }).MdHub;
}
function getCore(): MemedCore | undefined {
  return (window as unknown as { MdSinapsePrescricao?: MemedCore }).MdSinapsePrescricao;
}

export function ensureMemedScript(token: string, scriptUrl: string, userId: string): Promise<void> {
  if (sessionInvalidated) return Promise.reject(new Error('Sessão encerrada. Recarregue a página antes de prescrever.'));
  if ((scriptUserId && scriptUserId !== userId) || (scriptToken && scriptToken !== token)) {
    return Promise.reject(new Error('A sessão Memed foi alterada. Recarregue a página para autenticar novamente.'));
  }
  if (moduleInitialized && getMemedHub()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  // Only load a documented Memed script over HTTPS.
  const url = new URL(scriptUrl);
  if (!['https://partners.memed.com.br/integration.js',
    'https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js'].includes(url.href)) {
    return Promise.reject(new Error('URL do módulo Memed não autorizada.'));
  }

  scriptToken = token;
  scriptUserId = userId;
  if (!authObserverInstalled) {
    getBrowserSupabaseClient().auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_OUT' && session?.user.id === scriptUserId) return;
      if (!session && event !== 'SIGNED_OUT' && event !== 'INITIAL_SESSION') return;
      sessionInvalidated = true;
      activeOnIssued = null;
      activeOnDeleted = null;
      const hub = getMemedHub();
      void hub?.module.hide?.(MODULE_NAME).catch(() => undefined);
      // Supabase callbacks must not await other SDK work under the auth lock.
      void hub?.command.send('plataforma.sdk', 'logout').catch(() => undefined);
      moduleInitialized = false;
      scriptPromise = Promise.reject(new Error('Sessão encerrada. Recarregue a página antes de prescrever.'));
      void scriptPromise.catch(() => undefined);
    });
    authObserverInstalled = true;
  }
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.type = 'text/javascript';
    script.src = url.href;
    script.setAttribute('data-token', token);
    script.referrerPolicy = 'no-referrer';
    const timer = window.setTimeout(() => {
      reject(new Error('A Memed não iniciou no prazo esperado. Recarregue a página para tentar novamente.'));
    }, 15000);

    script.onload = () => {
      const core = getCore();
      if (!core?.event) {
        window.clearTimeout(timer);
        reject(new Error('Módulo Memed não disponibilizou a API de eventos.'));
        return;
      }
      core.event.add('core:moduleInit', (module) => {
        if (module.name !== MODULE_NAME) return;
        const hub = getMemedHub();
        if (sessionInvalidated) {
          window.clearTimeout(timer);
          void hub?.command.send('plataforma.sdk', 'logout').catch(() => undefined);
          reject(new Error('Sessão encerrada. Recarregue a página antes de prescrever.'));
          return;
        }
        if (!hub?.event || !hub.command || !hub.module) {
          reject(new Error('MdHub indisponível.'));
          return;
        }
        if (!eventListenersRegistered) {
          hub.event.add('prescricaoImpressa', (data) => {
            const prescription = (data.prescricao ?? data) as Record<string, unknown>;
            const id = prescription.prescriptionUuid ?? prescription.id ?? data.id;
            if (id !== undefined && id !== null && activeOnIssued) {
              activeOnIssued(String(id));
            }
          });
          hub.event.add('prescricaoExcluida', (data) => {
            const prescription = (data.prescricao ?? data) as Record<string, unknown>;
            const id = prescription.prescriptionUuid ?? prescription.id ?? data.id;
            if (id !== undefined && id !== null && activeOnDeleted) {
              activeOnDeleted(String(id));
            }
          });
          eventListenersRegistered = true;
        }
        window.clearTimeout(timer);
        moduleInitialized = true;
        resolve();
      });
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      scriptPromise = null;
      scriptToken = null;
      script.remove();
      reject(new Error('Falha ao carregar o módulo Memed.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function setMemedCallbacks(onIssued: (id: string) => void, onDeleted: (id: string) => void): () => void {
  activeOnIssued = onIssued;
  activeOnDeleted = onDeleted;
  return () => {
    if (activeOnIssued === onIssued) activeOnIssued = null;
    if (activeOnDeleted === onDeleted) activeOnDeleted = null;
  };
}

export function openMemedPatient(patient: MemedPatient, isCurrent: () => boolean): Promise<void> {
  const task = opening.then(async () => {
    const current = () => !sessionInvalidated && isCurrent();
    if (!current()) return;
    const hub = getMemedHub();
    if (!hub) throw new Error('Módulo Memed indisponível.');
    // Official Memed controls: identity is fixed by the backend and signing is mandatory.
    await hub.command.send(MODULE_NAME, 'setFeatureToggle', {
      deletePatient: false, removePatient: false, editPatient: false,
      editIdentification: false, dropdownSync: false, historyPrescription: false,
      conclusionModalEdit: false, forceSign: true, allowShareModal: false,
    });
    if (!current()) return;
    await hub.command.send(MODULE_NAME, 'setPaciente', { ...patient });
    if (!current()) return;
    await hub.module.show(MODULE_NAME);
    if (!current()) await hub.module.hide?.(MODULE_NAME);
  });
  opening = task.catch(() => undefined);
  return task;
}
