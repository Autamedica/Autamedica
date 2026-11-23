import { useEffect, useRef, useState } from 'react';
import { ensureMemedScript, getMemedHub, openMemedPatient, setMemedCallbacks } from '@/lib/prescriptions/brazil/memed-sdk';
import { Loader2, AlertCircle, ShieldCheck, X } from 'lucide-react';

interface MemedPrescriptionWidgetProps {
  patientId: string;
  requestId?: string;
  onPrescriptionSaved: (memedId: string) => Promise<void>;
  onPrescriptionDeleted: (memedId: string) => Promise<void>;
  onClose: () => void;
  onFallbackToNativePrescription: () => void;
  /** Use the full viewport inside Android Custom Tabs. */
  mobileFullscreen?: boolean;
}

export function MemedPrescriptionWidget({
  patientId,
  requestId,
  onPrescriptionSaved,
  onPrescriptionDeleted,
  onClose,
  onFallbackToNativePrescription,
  mobileFullscreen = false,
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
  const [missingPatientFields, setMissingPatientFields] = useState<{ demographics: boolean; address: boolean }>({ demographics: false, address: false });
  const [patientBirthInput, setPatientBirthInput] = useState('');
  const [patientGenderInput, setPatientGenderInput] = useState<'male' | 'female' | ''>('');
  const [patientAddressInput, setPatientAddressInput] = useState('');
  const [patientCityInput, setPatientCityInput] = useState('');
  const [skipOptionalAddress, setSkipOptionalAddress] = useState(false);
  const [patientDemographicsSubmitted, setPatientDemographicsSubmitted] = useState<{
    patientBirthDate?: string;
    patientGender?: 'male' | 'female';
    patientAddress?: string;
    patientCity?: string;
  } | null>(null);
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
          body: JSON.stringify({ patientId, ...(requestId ? { requestId } : {}), ...doctorIdentitySubmitted, ...patientDemographicsSubmitted }),
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
        const needsDemographics = Boolean(json.data.patientDemographicsMissing);
        const needsAddress = Boolean(json.data.patientAddressMissing) && !skipOptionalAddress;
        if (needsDemographics || needsAddress) {
          setMissingPatientFields({ demographics: needsDemographics, address: needsAddress });
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
  }, [patientId, requestId, doctorIdentitySubmitted, patientDemographicsSubmitted, skipOptionalAddress]);

  return (
    <div className={mobileFullscreen
      ? "fixed inset-0 z-50 flex min-h-0 items-stretch bg-white"
      : "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4"}>
      <div className={mobileFullscreen
        ? "relative flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-white"
        : "relative flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[92vh] sm:rounded-2xl sm:border sm:border-slate-200"}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/90 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Receituário digital Brasil</h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                <ShieldCheck className="h-3 w-3" />
                Memed · ICP-Brasil
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-600">Paciente: <span className="font-medium text-slate-800">{patientLabel ?? 'Confirmando cadastro…'}</span></p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            aria-label="Fechar Memed"
          >
            <X className="h-3.5 w-3.5" />
            Fechar
          </button>
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
            if (missingPatientFields.demographics && (!patientBirthInput || !patientGenderInput)) return;
            const trimmedAddress = patientAddressInput.trim();
            const trimmedCity = patientCityInput.trim();
            if (missingPatientFields.address && trimmedAddress.length < 5) return;
            setPatientDemographicsRequired(false);
            setErrorMessage(null);
            setLoading(true);
            setPatientDemographicsSubmitted({
              ...(missingPatientFields.demographics && patientBirthInput && patientGenderInput
                ? { patientBirthDate: patientBirthInput, patientGender: patientGenderInput }
                : {}),
              ...(missingPatientFields.address && trimmedAddress
                ? {
                    patientAddress: trimmedAddress,
                    ...(trimmedCity.length >= 2 ? { patientCity: trimmedCity } : {}),
                  }
                : {}),
            });
          }}>
            <p className="text-sm text-slate-800">
              Complete os dados que faltam do paciente, confirmando a informação diretamente com ele.
              {missingPatientFields.address
                ? ' Para receitas controladas e Notificação de Receita B (azul / SNCR - RDC 1.000/2025), a Memed exige endereço completo do paciente.'
                : ' A Memed pode exigir data de nascimento e sexo para determinados medicamentos e receituários.'}
            </p>
            {missingPatientFields.demographics && (
              <>
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
              </>
            )}
            {missingPatientFields.address && (
              <>
                <label className="block text-sm text-slate-700">
                  Endereço completo (rua, número, bairro)
                  <input type="text" required minLength={5} maxLength={200}
                    placeholder="Ex.: Av. Paulista, 1000, Bela Vista"
                    value={patientAddressInput} onChange={(event) => setPatientAddressInput(event.target.value)}
                    className="mt-1 block w-full rounded border p-2" />
                </label>
                <label className="block text-sm text-slate-700">
                  Cidade / UF (opcional, recomendado para SNCR)
                  <input type="text" minLength={2} maxLength={100}
                    placeholder="Ex.: São Paulo - SP"
                    value={patientCityInput} onChange={(event) => setPatientCityInput(event.target.value)}
                    className="mt-1 block w-full rounded border p-2" />
                </label>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700">
                Salvar dados e abrir Memed
              </button>
              {!missingPatientFields.demographics && missingPatientFields.address && (
                <button type="button" onClick={() => {
                  setPatientDemographicsRequired(false);
                  setErrorMessage(null);
                  setSkipOptionalAddress(true);
                }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">
                  Abrir sem endereço (receita simples)
                </button>
              )}
              <button type="button" onClick={onFallbackToNativePrescription}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50">
                Rascunho interno (sem validade em farmácia)
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
        <div id="memed-prescricao-container" className={mobileFullscreen
          ? "min-h-0 flex-1 overflow-auto overscroll-contain"
          : "min-h-[400px] flex-1 overflow-auto"} />
      </div>
    </div>
  );
}

