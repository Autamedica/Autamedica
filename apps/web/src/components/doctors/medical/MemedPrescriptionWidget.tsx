import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

const MODULE = 'plataforma.prescricao';
const SCRIPT_ID = 'memed-prescricao-script';

interface MemedPatient {
  idExterno: string;
  nome: string;
  sexo: 'Masculino' | 'Feminino';
  cpf: string;
  data_nascimento: string;
  telefone: string;
  email: string;
}
interface MemedBootResponse {
  success: boolean;
  data?: { token: string; scriptUrl: string; patient: MemedPatient };
  error?: { message?: string };
}
interface MemedPrescriptionWidgetProps {
  patientId: string;
  onPrescriptionSaved: (memedId: string) => void;
  onClose: () => void;
}

type MemedEvent = 'prescricaoImpressa' | 'prescricaoExcluida';
type EventHandler = (event: MemedEvent, data: unknown) => Promise<void>;
type EventBus = { add: (event: string, handler: (data: unknown) => void) => void };
interface MemedGlobal {
  MdSinapsePrescricao?: { event: EventBus };
  MdHub?: {
    event: EventBus;
    command: { send: (module: string, name: string, value: object) => Promise<unknown> };
    module: { show: (module: string) => Promise<unknown>; hide?: (module: string) => Promise<unknown> };
  };
}
let listenersRegistered = false;
let activeHandler: EventHandler | null = null;

function getSdk(): MemedGlobal {
  return window as unknown as MemedGlobal;
}

function getMemedId(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const item = value as Record<string, unknown>;
  const id = item.id ?? item.prescriptionId;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : '';
}

function registerListeners() {
  const sdk = getSdk();
  if (listenersRegistered || !sdk.MdHub?.event) return;
  sdk.MdHub.event.add('prescricaoImpressa', (data) => {
    void activeHandler?.('prescricaoImpressa', data);
  });
  sdk.MdHub.event.add('prescricaoExcluida', (data) => {
    void activeHandler?.('prescricaoExcluida', data);
  });
  listenersRegistered = true;
}

export function MemedPrescriptionWidget({
  patientId,
  onPrescriptionSaved,
  onClose,
}: MemedPrescriptionWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [issuedMessage, setIssuedMessage] = useState<string | null>(null);
  const savedCallbackRef = useRef(onPrescriptionSaved);
  savedCallbackRef.current = onPrescriptionSaved;

  useEffect(() => {
    let cancelled = false;
    activeHandler = async (event, rawData) => {
      const memedId = getMemedId(rawData);
      if (!memedId) {
        if (!cancelled) setErrorMessage('Memed não informou o identificador da receita. Verifique o histórico antes de repetir a emissão.');
        return;
      }
      try {
        const response = await fetch('/api/doctors/prescriptions/memed-token', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, memedId, patientId }),
        });
        const body = await response.json();
        if (!response.ok || body.success !== true || body.data?.synchronized !== true) {
          throw new Error(body.error?.message || 'Falha ao sincronizar a receita com AutaMedica.');
        }
        if (!cancelled) {
          savedCallbackRef.current(memedId);
          if (event === 'prescricaoImpressa') {
            setIssuedMessage('Emissão confirmada na Memed. A entrega e a validação da assinatura ainda precisam ser confirmadas.');
          } else {
            setIssuedMessage('Exclusão sincronizada com AutaMedica.');
          }
        }
      } catch (error) {
        if (!cancelled) setErrorMessage(
          error instanceof Error ? error.message : 'Falha de sincronização da receita.',
        );
      }
    };

    async function openMemed(patient: MemedPatient) {
      const hub = getSdk().MdHub;
      if (!hub) throw new Error('Módulo de prescrição Memed indisponível.');
      registerListeners();
      await hub.command.send(MODULE, 'setPaciente', patient);
      if (cancelled) return;
      await hub.module.show(MODULE);
      if (!cancelled) setLoading(false);
    }

    async function initialize() {
      try {
        setLoading(true);
        setErrorMessage(null);
        const response = await fetch(
          `/api/doctors/prescriptions/memed-token?patientId=${encodeURIComponent(patientId)}`,
          { credentials: 'include' },
        );
        const body = await response.json() as MemedBootResponse;
        if (!response.ok || !body.success || !body.data?.token || !body.data.patient) {
          throw new Error(body.error?.message || 'Médico, paciente ou credenciais Memed incompletos.');
        }
        const { token, scriptUrl, patient } = body.data;
        if (cancelled) return;
        const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
        if (existing) {
          if (existing.getAttribute('data-token') !== token) {
            throw new Error('Token do médico atualizado. Recarregue o portal antes de emitir outra receita.');
          }
          await openMemed(patient);
          return;
        }
        const script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.type = 'text/javascript';
        script.src = scriptUrl;
        script.setAttribute('data-token', token);
        script.onerror = () => {
          script.remove();
          if (!cancelled) setErrorMessage('Falha ao carregar o módulo Memed.');
          if (!cancelled) setLoading(false);
        };
        script.onload = () => {
          const sdk = getSdk();
          if (!sdk.MdSinapsePrescricao?.event) {
            if (!cancelled) {
              setErrorMessage('O módulo Memed não foi inicializado.');
              setLoading(false);
            }
            return;
          }
          sdk.MdSinapsePrescricao.event.add('core:moduleInit', (module) => {
            const m = module as { name?: string } | null;
            if (m?.name !== MODULE || cancelled) return;
            void openMemed(patient).catch((error) => {
              if (!cancelled) {
                setErrorMessage(error instanceof Error ? error.message : 'Erro ao abrir Memed.');
                setLoading(false);
              }
            });
          });
        };
        document.head.appendChild(script);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Erro ao inicializar Memed.');
          setLoading(false);
        }
      }
    }

    void initialize();
    return () => {
      cancelled = true;
      activeHandler = null;
      // Keep SDK loaded exactly once; closing the modal only hides the module.
      const module = getSdk().MdHub?.module;
      if (module?.hide) void module.hide(MODULE).catch(() => undefined);
    };
  }, [patientId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl h-[90vh] bg-white rounded-xl overflow-hidden relative shadow-2xl flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-neutral-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Prescrição Brasil — Memed</h2>
            <p className="text-xs text-slate-500">O médico deve revisar e assinar a receita na Memed.</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        {errorMessage && <div role="alert" className="m-4 flex gap-2 rounded-lg bg-red-50 p-3 text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{errorMessage}</div>}
        {issuedMessage && <div role="status" className="m-4 rounded-lg bg-blue-50 p-3 text-blue-900">{issuedMessage}</div>}
        <div className="flex-1 relative bg-slate-50 overflow-auto">
          {loading && !errorMessage && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80">
              <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
              <p className="mt-2 text-sm">Conectando ao módulo Memed...</p>
            </div>
          )}
          <div id="memed-prescricao-container" className="w-full h-full min-h-[500px]" />
        </div>
      </div>
    </div>
  );
}
