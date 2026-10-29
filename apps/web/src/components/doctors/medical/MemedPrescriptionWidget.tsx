import { useEffect, useRef, useState } from 'react';
import { ensureMemedScript, getMemedHub, openMemedPatient, setMemedCallbacks } from '@/lib/prescriptions/brazil/memed-sdk';
import { Loader2, AlertCircle } from 'lucide-react';

interface MemedPrescriptionWidgetProps {
  patientId: string;
  onPrescriptionSaved: (memedId: string) => Promise<void>;
  onPrescriptionDeleted: (memedId: string) => Promise<void>;
  onClose: () => void;
}

export function MemedPrescriptionWidget({
  patientId,
  onPrescriptionSaved,
  onPrescriptionDeleted,
  onClose,
}: MemedPrescriptionWidgetProps) {
  const [patientLabel, setPatientLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [issuedId, setIssuedId] = useState<string | null>(null);
  const [identityRequired, setIdentityRequired] = useState(false);
  const [doctorCpfInput, setDoctorCpfInput] = useState('');
  const [doctorBirthInput, setDoctorBirthInput] = useState('');
  const [doctorIdentitySubmitted, setDoctorIdentitySubmitted] = useState<{ cpf: string; birthDate: string } | null>(null);
  const onSavedRef = useRef(onPrescriptionSaved);
  const onDeletedRef = useRef(onPrescriptionDeleted);
  onSavedRef.current = onPrescriptionSaved;
  onDeletedRef.current = onPrescriptionDeleted;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPatientLabel(null);
    setIssuedId(null);
    setErrorMessage(null);
    const onIssued = (id: string) => {
      if (cancelled) return;
      void onSavedRef.current(id).then(() => {
        if (!cancelled) setIssuedId(id);
      }).catch(() => {
        if (!cancelled) setErrorMessage('A Memed informou a emissão, mas o prontuário não confirmou a verificação. Verifique antes de compartilhar.');
      });
    };
    const onDeleted = (id: string) => {
      if (!cancelled) {
        void onDeletedRef.current(id).catch(() => {
          if (!cancelled) setErrorMessage('Não foi possível sincronizar a exclusão da receita.');
        });
      }
    };
    const clearCallbacks = setMemedCallbacks(onIssued, onDeleted);
    async function openMemed() {
      try {
        const tokenRequest: RequestInit = {
          method: 'POST', credentials: 'include', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId, ...doctorIdentitySubmitted }),
        };
        const response = await fetch('/api/doctors/prescriptions/memed-token', tokenRequest);
        const json = await response.json();
        if (response.status === 400 && [
          'memed_doctor_identity_incomplete',
          'memed_doctor_birth_date_required',
        ].includes(json.error?.message)) {
          if (!cancelled) {
            setIdentityRequired(true);
            setLoading(false);
          }
          return;
        }
        if (!response.ok || json.success !== true || !json.data?.token || !json.data?.scriptUrl || !json.data?.patient) {
          throw new Error(json.error?.message === 'memed_issuance_not_enabled'
            ? 'A emissão de receitas está desativada enquanto concluímos a validação da integração.'
            : 'Não foi possível autorizar o médico e o paciente para a Memed. Confira os dados do cadastro.');
        }
        if (cancelled) return;
        setPatientLabel(json.data.patient.nome);
        await ensureMemedScript(json.data.token, json.data.scriptUrl, json.data.doctor.userId);
        if (cancelled) return;
        await openMemedPatient(json.data.patient, () => !cancelled);
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
      clearCallbacks();
      const hub = getMemedHub();
      void hub?.module.hide?.('plataforma.prescricao').catch(() => undefined);
      // Leave the script in place to prevent duplicate initialization.
    };
  }, [patientId, doctorIdentitySubmitted]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="font-semibold text-slate-900">Prescrição digital Brasil — Memed</h2>
            <p className="text-xs text-slate-600">Paciente: {patientLabel ?? 'Confirmando cadastro…'}</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-1 text-slate-700" aria-label="Fechar Memed">Fechar</button>
        </div>
        {identityRequired && !loading && (
          <form className="space-y-3 border-b p-5" onSubmit={(event) => {
            event.preventDefault();
            if (!doctorCpfInput || !doctorBirthInput) return;
            setIdentityRequired(false);
            setErrorMessage(null);
            setLoading(true);
            setDoctorIdentitySubmitted({ cpf: doctorCpfInput, birthDate: doctorBirthInput });
          }}>
            <p className="text-sm text-slate-800">Para vincular sua identidade ao Memed, informe seu CPF e data de nascimento reais. A matrícula CRM deve estar previamente validada.</p>
            <label className="block text-sm text-slate-700">
              CPF do médico (11 dígitos)
              <input type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]{11}"
                required value={doctorCpfInput} onChange={(event) => setDoctorCpfInput(event.target.value.replace(/\D/g, '').slice(0, 11))}
                className="mt-1 block w-full rounded border p-2" />
            </label>
            <label className="block text-sm text-slate-700">
              Data de nascimento do médico
              <input type="date" autoComplete="off" required max={new Date().toISOString().slice(0, 10)}
                value={doctorBirthInput} onChange={(event) => setDoctorBirthInput(event.target.value)}
                className="mt-1 block w-full rounded border p-2" />
            </label>
            <p className="text-xs text-slate-600">A data de nascimento será transmitida à Memed apenas para o cadastro, sem armazenamento na AutaMedica.</p>
            <button type="submit" className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white">
              Validar cadastro Memed
            </button>
          </form>
        )}
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

