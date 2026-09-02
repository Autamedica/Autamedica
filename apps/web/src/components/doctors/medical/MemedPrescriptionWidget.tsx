import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

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
  onClose
}: MemedPrescriptionWidgetProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. In a real scenario, we fetch a Memed token from our backend using the doctor's CRM/UF.
    // 2. We inject the Memed Sinapse script here.
    const script = document.createElement('script');
    script.src = 'https://integracoes.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js';
    script.setAttribute('data-color', '#0f172a'); // slate-900 (Autamedica style)
    
    script.onload = () => {
      setLoading(false);
      // Initialize Memed Sinapse
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Memed: any = (window as any).MdSinapsePrescricao;
      
      if (Memed) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Memed.event.add('core:moduleInit', function moduleInitHandler(module: any) {
          if (module.name === 'plataforma.prescricao') {
            // Set patient info
            Memed.setPaciente({
              nome: patientName,
              cpf: patientCpf,
            });
          }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Memed.event.add('core:moduleInit', function moduleInitHandler(module: any) {
          if (module.name === 'plataforma.prescricao') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Memed.event.add('prescricaoSalva', function(prescricao: any) {
              onPrescriptionSaved(prescricao.id);
            });
          }
        });
      }
    };

    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [patientName, patientCpf, onPrescriptionSaved]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl h-[90vh] bg-white rounded-xl overflow-hidden relative shadow-2xl flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold text-slate-900">Nova Prescrição (Memed / ICP-Brasil)</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            X
          </button>
        </div>
        
        <div className="flex-1 relative bg-slate-50">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Iniciando módulo de prescrição Memed...</p>
            </div>
          ) : (
            <div id="memed-container" className="w-full h-full">
              {/* Memed injects the UI here or as an overlay */}
              <p className="p-8 text-center text-slate-500">
                O módulo Memed foi carregado. <br/>
                Para usar em produção, o token de autenticação (backend) deve ser providenciado.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
