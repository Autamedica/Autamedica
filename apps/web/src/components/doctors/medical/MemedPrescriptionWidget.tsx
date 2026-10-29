import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface MemedPrescriptionWidgetProps {
  patientId: string;
  patientName: string;
  patientCpf: string;
  patientBirthDate: string; // YYYY-MM-DD
  patientGender: string;
  onPrescriptionSaved: (memedId: string) => Promise<void>;
  onPrescriptionDeleted: (memedId: string) => Promise<void>;
  onClose: () => void;
}

interface MemedHub {
  command: { send: (module: string, command: string, data: Record<string, unknown>) => Promise<unknown> };
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
let moduleInitialized = false;
let eventListenersRegistered = false;
let activeOnIssued: ((id: string) => void) | null = null;
let activeOnDeleted: ((id: string) => void) | null = null;

function getHub(): MemedHub | undefined {
  return (window as unknown as { MdHub?: MemedHub }).MdHub;
}
function getCore(): MemedCore | undefined {
  return (window as unknown as { MdSinapsePrescricao?: MemedCore }).MdSinapsePrescricao;
}

function ensureScript(token: string, scriptUrl: string): Promise<void> {
  if (scriptToken && scriptToken !== token) {
    return Promise.reject(new Error('Sessão de outro médico detectada. Recarregue a página antes de prescrever.'));
  }
  if (moduleInitialized && getHub()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  // Only load a documented Memed script over HTTPS.
  const url = new URL(scriptUrl);
  if (url.protocol !== 'https:' || !/(^|\\.)memed\\.com\\.br$/.test(url.hostname)) {
    return Promise.reject(new Error('URL do módulo Memed não autorizada.'));
  }

  scriptToken = token;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.type = 'text/javascript';
    script.src = url.href;
    script.setAttribute('data-token', token);

    script.onload = () => {
      const core = getCore();
      if (!core?.event) {
        scriptPromise = null;
        reject(new Error('Módulo Memed não disponibilizou a API de eventos.'));
        return;
      }
      core.event.add('core:moduleInit', (module) => {
        if (module.name !== MODULE_NAME) return;
        const hub = getHub();
        if (!hub?.event || !hub.command || !hub.module) {
          reject(new Error('MdHub indisponível.'));
          return;
        }
        if (!eventListenersRegistered) {
          hub.event.add('prescricaoImpressa', (data) => {
            const prescription = (data.prescricao ?? data) as Record<string, unknown>;
            const id = prescription.id ?? prescription.prescriptionUuid ?? data.id;
            if (id !== undefined && id !== null && activeOnIssued) {
              activeOnIssued(String(id));
            }
          });
          hub.event.add('prescricaoExcluida', (data) => {
            const prescription = (data.prescricao ?? data) as Record<string, unknown>;
            const id = prescription.id ?? prescription.prescriptionUuid ?? data.id;
            if (id !== undefined && id !== null && activeOnDeleted) {
              activeOnDeleted(String(id));
            }
          });
          eventListenersRegistered = true;
        }
        moduleInitialized = true;
        resolve();
      });
    };
    script.onerror = () => {
      scriptPromise = null;
      scriptToken = null;
      script.remove();
      reject(new Error('Falha ao carregar o módulo Memed.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function formatDate(date: string): string {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) throw new Error('Data de nascimento do paciente inválida.');
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function patientSex(value: string): string {
  const gender = value.toLowerCase();
  if (['male', 'masculino', 'm'].includes(gender)) return 'Masculino';
  if (['female', 'feminino', 'f'].includes(gender)) return 'Feminino';
  throw new Error('Sexo do paciente deve ser confirmado antes da prescrição.');
}

export function MemedPrescriptionWidget({
  patientId,
  patientName,
  patientCpf,
  patientBirthDate,
  patientGender,
  onPrescriptionSaved,
  onPrescriptionDeleted,
  onClose,
}: MemedPrescriptionWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [issuedId, setIssuedId] = useState<string | null>(null);
  const onSavedRef = useRef(onPrescriptionSaved);
  const onDeletedRef = useRef(onPrescriptionDeleted);
  onSavedRef.current = onPrescriptionSaved;
  onDeletedRef.current = onPrescriptionDeleted;

  useEffect(() => {
    let cancelled = false;
    activeOnIssued = (id) => {
      if (cancelled) return;
      void onSavedRef.current(id).then(() => {
        if (!cancelled) setIssuedId(id);
      }).catch(() => {
        if (!cancelled) setErrorMessage('A Memed informou a emissão, mas o prontuário não confirmou a verificação. Verifique antes de compartilhar.');
      });
    };
    activeOnDeleted = (id) => {
      if (!cancelled) {
        void onDeletedRef.current(id).catch(() => {
          if (!cancelled) setErrorMessage('Não foi possível sincronizar a exclusão da receita.');
        });
      }
    };
    async function openMemed() {
      try {
        const cpf = patientCpf.replace(/\\D/g, '');
        if (!patientId || !patientName.trim() || !/^\\d{11}$/.test(cpf)) {
          throw new Error('Selecione um paciente com nome completo e CPF válido.');
        }
        const sex = patientSex(patientGender);
        const dob = formatDate(patientBirthDate);
        const response = await fetch('/api/doctors/prescriptions/memed-token', { credentials: 'include' });
        const json = await response.json();
        if (!response.ok || json.success !== true || !json.data?.token || !json.data?.scriptUrl) {
          throw new Error(json.error?.message ?? 'Médico sem credenciais Memed válidas.');
        }
        if (cancelled) return;
        await ensureScript(json.data.token, json.data.scriptUrl);
        if (cancelled) return;
        const hub = getHub();
        if (!hub) throw new Error('MdHub indisponível para prescrição.');
        await hub.command.send(MODULE_NAME, 'setPaciente', {
          idExterno: `autamedica-${patientId}`,
          nome: patientName,
          cpf,
          sexo: sex,
          data_nascimento: dob,
        });
        if (cancelled) return;
        await hub.module.show(MODULE_NAME);
        if (!cancelled) setLoading(false);
      } catch (error) {
        if (!cancelled) {
          setLoading(false);
          setErrorMessage(error instanceof Error ? error.message : 'Erro ao iniciar Memed.');
        }
      }
    }
    void openMemed();
    return () => {
      cancelled = true;
      activeOnIssued = null;
      activeOnDeleted = null;
      void getHub()?.module.hide?.(MODULE_NAME);
      // Leave the script in place to prevent duplicate initialization.
    };
  }, [patientId, patientName, patientCpf, patientBirthDate, patientGender]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="font-semibold text-slate-900">Prescrição digital Brasil — Memed</h2>
            <p className="text-xs text-slate-600">Paciente: {patientName}</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-1 text-slate-700" aria-label="Fechar Memed">Fechar</button>
        </div>
        {loading && <div className="flex items-center gap-2 p-5 text-slate-700"><Loader2 className="h-5 w-5 animate-spin" />Carregando Memed...</div>}
        {errorMessage && <div role="alert" className="flex items-start gap-2 p-5 text-red-700"><AlertCircle className="h-5 w-5 shrink-0" />{errorMessage}</div>}
        {issuedId && <div role="status" className="p-3 text-sm text-amber-800">
          Prescrição confirmada na API Memed e registrada como pendente (ID {issuedId}). Confirme a assinatura e a entrega ao paciente antes de concluir o atendimento.
        </div>}
        <div id="memed-prescricao-container" className="min-h-[400px] flex-1 overflow-auto" />
      </div>
    </div>
  );
}
