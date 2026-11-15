import { useEffect, useRef, useState } from 'react';
import { ensureMemedScript, getMemedHub, openMemedPatient, setMemedCallbacks } from '@/lib/prescriptions/brazil/memed-sdk';
import { Loader2, AlertCircle } from 'lucide-react';

interface MemedPrescriptionWidgetProps {
  patientId: string;
  onPrescriptionSaved: (memedId: string) => Promise<void>;
  onPrescriptionDeleted: (memedId: string) => Promise<void>;
  onClose: () => void;
  onFallbackToNativePrescription: () => void;
}

export function MemedPrescriptionWidget({
  patientId,
  onPrescriptionSaved,
  onPrescriptionDeleted,
  onClose,
  onFallbackToNativePrescription,
}: MemedPrescriptionWidgetProps) {
  const [patientLabel, setPatientLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fallbackAvailable, setFallbackAvailable] = useState(false);
  const [issuedId, setIssuedId] = useState<string | null>(null);
  const [identityRequired, setIdentityRequired] = useState(false);
  const [doctorCpfInput, setDoctorCpfInput] = useState('');
  const [doctorBirthInput, setDoctorBirthInput] = useState('');
  const [doctorIdentitySubmitted, setDoctorIdentitySubmitted] = useState<{ cpf: string; birthDate: string } | null>(null);
  const [patientDemographicsRequired, setPatientDemographicsRequired] = useState(false);
  const [patientBirthInput, setPatientBirthInput] = useState('');
  const [patientGenderInput, setPatientGenderInput] = useState<'male' | 'female' | ''>('');
  const [patientDemographicsSubmitted, setPatientDemographicsSubmitted] = useState<{ patientBirthDate: string; patientGender: 'male' | 'female' } | null>(null);
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
    setFallbackAvailable(false);
    setPatientDemographicsRequired(false);
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
          body: JSON.stringify({ patientId, ...doctorIdentitySubmitted, ...patientDemographicsSubmitted }),
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
          const code = json.error?.message;
          const patientGate = ['memed_patient_consent_required', 'memed_patient_identity_incomplete',
            'memed_patient_required', 'memed_patient_country_required'].includes(code);
          const doctorGate = ['verified_brazilian_license_required', 'memed_doctor_identity_incomplete',
            'active_brazilian_doctor_required', 'memed_pilot_prescriber_only'].includes(code);
          throw new Error(code === 'memed_issuance_not_enabled'
            ? 'Memed está em validação clínica. A consulta continua normalmente e você pode emitir a receita nativa Autamedica.'
            : patientGate
              ? 'Paciente sem consentimento LGPD ativo ou identidade completa. A receita Memed foi bloqueada; continue pela receita nativa Autamedica.'
              : doctorGate
                ? 'Identidade ou habilitação do prescritor ainda não está validada para Memed. Continue pela receita nativa Autamedica.'
                : 'Memed não autorizou esta emissão. Continue pela receita nativa Autamedica; a videoconsulta permanece ativa.');
        }
        if (cancelled) return;
        setPatientLabel(json.data.patient.nome);
        if (json.data.patientDemographicsMissing) {
          setPatientDemographicsRequired(true);
          setLoading(false);
          return;
        }
        await ensureMemedScript(json.data.token, json.data.scriptUrl, json.data.doctor.userId);
        if (cancelled) return;
        await openMemedPatient(json.data.patient, () => !cancelled);
        if (!cancelled) setLoading(false);
      } catch (error) {
        if (!cancelled) {
          setLoading(false);
          setFallbackAvailable(true);
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
  }, [patientId, doctorIdentitySubmitted, patientDemographicsSubmitted]);

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
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white">
                Validar cadastro Memed
              </button>
              <button type="button" onClick={onFallbackToNativePrescription}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800">
                Continuar con receta nativa Autamedica
              </button>
            </div>
          </form>
        )}
        {patientDemographicsRequired && !loading && (
          <form className="space-y-3 border-b p-5" onSubmit={(event) => {
            event.preventDefault();
            if (!patientBirthInput || !patientGenderInput) return;
            setPatientDemographicsRequired(false);
            setErrorMessage(null);
            setLoading(true);
            setPatientDemographicsSubmitted({ patientBirthDate: patientBirthInput, patientGender: patientGenderInput });
          }}>
            <p className="text-sm text-slate-800">Complete os dados que faltam do paciente, confirmando a informação diretamente com ele. A Memed pode exigir data de nascimento e sexo para determinados medicamentos e receituários.</p>
            <label className="block text-sm text-slate-700">
              Data de nascimento do paciente
              <input type="date" required max={new Date().toISOString().slice(0, 10)}
                value={patientBirthInput} onChange={(event) => setPatientBirthInput(event.target.value)}
                className="mt-1 block w-full rounded border p-2" />
            </label>
            <label className="block text-sm text-slate-700">
              Sexo cadastral do paciente
              <select required value={patientGenderInput} onChange={(event) => setPatientGenderInput(event.target.value as 'male' | 'female' | '')}
                className="mt-1 block w-full rounded border p-2">
                <option value="">Selecione</option>
                <option value="female">Feminino</option>
                <option value="male">Masculino</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white">
                Salvar dados e abrir Memed
              </button>
              <button type="button" onClick={onFallbackToNativePrescription}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800">
                Continuar con receta nativa Autamedica
              </button>
            </div>
          </form>
        )}
        {loading && <div className="flex items-center gap-2 p-5 text-slate-700"><Loader2 className="h-5 w-5 animate-spin" />Carregando Memed...</div>}
        {errorMessage && <div role="alert" className="space-y-3 border-b border-amber-200 bg-amber-50 p-5 text-amber-950">
          <div className="flex items-start gap-2 text-sm"><AlertCircle className="h-5 w-5 shrink-0" />{errorMessage}</div>
          {fallbackAvailable && <button type="button" onClick={onFallbackToNativePrescription}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Continuar con receta nativa Autamedica
          </button>}
        </div>}
        {issuedId && <div role="status" className="p-3 text-sm text-amber-800">
          Prescrição confirmada na API Memed e registrada como pendente (ID {issuedId}). Confirme a assinatura e a entrega ao paciente antes de concluir o atendimento.
        </div>}
        <div id="memed-prescricao-container" className="min-h-[400px] flex-1 overflow-auto" />
      </div>
    </div>
  );
}

