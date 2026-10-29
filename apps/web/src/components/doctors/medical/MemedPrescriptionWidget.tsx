import { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface MemedPrescriptionWidgetProps {
  doctorCrm: string;
  doctorUf: string;
  patientName: string;
  patientCpf: string;
  onPrescriptionSaved: (memedId: string) => void;
  onClose: () => void;
}

export function MemedPrescriptionWidget({
  doctorCrm: _doctorCrm,
  doctorUf: _doctorUf,
  patientName,
  patientCpf,
  onPrescriptionSaved,
  onClose,
}: MemedPrescriptionWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let scriptEl: HTMLScriptElement | null = null;
    let isCancelled = false;

    async function initMemed() {
      try {
        if (!patientName.trim() || !/^\\d{11}$/.test(patientCpf.replace(/\\D/g, ''))) {
          throw new Error('Selecione um paciente com nome e CPF válido antes de prescrever.');
        }
        setLoading(true);
        setErrorMessage(null);

        // 1. Obtener el token del médico desde nuestro backend
        const tokenRes = await fetch('/api/doctors/prescriptions/memed-token');
        if (!tokenRes.ok) {
          throw new Error('Falha ao obter credenciais do médico na Memed.');
        }

        const tokenData = await tokenRes.json();
        const dataToken = tokenData?.data?.token ?? tokenData?.token;
        if (!dataToken) throw new Error('Token Memed ausente na resposta do servidor.');
        const scriptUrl = tokenData.scriptUrl || 'https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js';

        if (isCancelled) return;

        // 2. Inyectar script con el data-token oficial
        scriptEl = document.createElement('script');
        scriptEl.type = 'text/javascript';
        scriptEl.src = scriptUrl;
        scriptEl.setAttribute('data-token', dataToken);
        scriptEl.setAttribute('data-color', '#0f172a');

        scriptEl.onload = () => {
          if (isCancelled) return;
          setLoading(false);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Memed: any = (window as any).MdSinapsePrescricao;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const MdHub: any = (window as any).MdHub;

          if (Memed) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Memed.event.add('core:moduleInit', async function moduleInitHandler(module: any) {
              if (module.name === 'plataforma.prescricao') {
                if (MdHub?.command) {
                  await MdHub.command.send('plataforma.prescricao', 'setPaciente', {
                    nome: patientName,
                    cpf: patientCpf ? patientCpf.replace(/\D/g, '') : undefined,
                  });
                  await MdHub.module.show('plataforma.prescricao');
                } else if (Memed.setPaciente) {
                  Memed.setPaciente({
                    nome: patientName,
                    cpf: patientCpf,
                  });
                  if (Memed.show) Memed.show();
                }
              }
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Memed.event.add('prescricaoSalva', function (prescricao: any) {
              const id = prescricao?.id || prescricao?.prescriptionId || String(prescricao);
              onPrescriptionSaved(id);
            });
          }
        };

        scriptEl.onerror = () => {
          if (!isCancelled) {
            setLoading(false);
            setErrorMessage('Não foi possível carregar a plataforma Memed.');
          }
        };

        document.body.appendChild(scriptEl);
      } catch (err) {
        if (!isCancelled) {
          setLoading(false);
          setErrorMessage(err instanceof Error ? err.message : 'Erro ao inicializar Memed');
        }
      }
    }

    initMemed();

    return () => {
      isCancelled = true;
      if (scriptEl && document.body.contains(scriptEl)) {
        document.body.removeChild(scriptEl);
      }
      // Ocultar contenedor si quedó en el DOM
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const MdHub: any = (window as any).MdHub;
      if (MdHub?.module?.hide) {
        MdHub.module.hide('plataforma.prescricao');
      }
    };
  }, [patientName, patientCpf, onPrescriptionSaved]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl h-[90vh] bg-white rounded-xl overflow-hidden relative shadow-2xl flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-neutral-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Prescrição Digital Brasil (Memed / ICP-Brasil)</h2>
            <p className="text-xs text-slate-500">Paciente: {patientName} {patientCpf ? `• CPF: ${patientCpf}` : ''}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 relative bg-slate-50 overflow-auto">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-white/80 z-10">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-slate-700" />
              <p className="text-sm font-medium">Conectando com o módulo oficial da Memed...</p>
              <p className="text-xs text-slate-400 mt-1">Homologação de prescrição e assinatura ICP-Brasil</p>
            </div>
          )}

          {errorMessage && (
            <div className="p-8 text-center flex flex-col items-center justify-center h-full">
              <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
              <p className="text-sm font-semibold text-slate-800">{errorMessage}</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm"
              >
                Fechar
              </button>
            </div>
          )}

          <div id="memed-prescricao-container" className="w-full h-full min-h-[500px]" />
        </div>
      </div>
    </div>
  );
}
