'use client';

import { useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';

interface AddExternalPatientModalProps {
  isBrazilianDoctor: boolean;
  onClose: () => void;
  onCreated: (patientId: string) => void;
}

export function AddExternalPatientModal({
  isBrazilianDoctor,
  onClose,
  onCreated,
}: AddExternalPatientModalProps) {
  const [fullName, setFullName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | 'other'>('female');
  const [birthDate, setBirthDate] = useState('');
  const [contact, setContact] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labels = isBrazilianDoctor
    ? {
        title: 'Adicionar paciente externo',
        subtitle: 'Cadastre um paciente de consultório ou atendimento particular para acompanhar evoluções, sinais vitais e receitas.',
        nameLabel: 'Nome completo *',
        namePlaceholder: 'Ex.: Maria Silva Santos',
        docLabel: 'CPF (11 dígitos) *',
        docPlaceholder: 'Somente números',
        genderLabel: 'Sexo *',
        female: 'Feminino',
        male: 'Masculino',
        other: 'Outro',
        birthLabel: 'Data de nascimento',
        contactLabel: 'WhatsApp ou E-mail',
        contactPlaceholder: '+5555999999999 ou email@exemplo.com',
        consent: 'Confirmo autorização do paciente para registro clínico e envio de documentos.',
        cancel: 'Cancelar',
        submit: 'Cadastrar paciente',
        saving: 'Cadastrando...',
        errFallback: 'Não foi possível cadastrar o paciente externo.',
      }
    : {
        title: 'Agregar paciente externo',
        subtitle: 'Registrá un paciente particular o de consultorio para llevar evoluciones, signos vitales, seguimientos y recetas.',
        nameLabel: 'Nombre completo *',
        namePlaceholder: 'Ej.: Juan Pérez',
        docLabel: 'DNI (7-8 dígitos) *',
        docPlaceholder: 'Solo números',
        genderLabel: 'Sexo *',
        female: 'Femenino',
        male: 'Masculino',
        other: 'Otro',
        birthLabel: 'Fecha de nacimiento',
        contactLabel: 'WhatsApp o E-mail',
        contactPlaceholder: '+54911... o correo@ejemplo.com',
        consent: 'Confirmo el consentimiento del paciente para su registro clínico y envío de documentos.',
        cancel: 'Cancelar',
        submit: 'Registrar paciente',
        saving: 'Registrando...',
        errFallback: 'No se pudo registrar el paciente externo.',
      };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      const response = await fetch('/api/doctors/patients/eventual', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          documentNumber: documentNumber.replace(/\D/g, ''),
          gender,
          birthDate: birthDate.trim() || undefined,
          contact: contact.trim() || undefined,
          consentAccepted,
          careCountryConfirmed: true,
        }),
      });
      const json = (await response.json()) as {
        success?: boolean;
        data?: { patientId?: string };
        error?: { code?: string; message?: string } | string;
      };
      if (!response.ok || json.success === false || !json.data?.patientId) {
        const msg =
          typeof json.error === 'string'
            ? json.error
            : json.error?.message || json.error?.code || labels.errFallback;
        throw new Error(msg);
      }
      onCreated(json.data.patientId);
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.errFallback);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-external-patient-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 id="add-external-patient-title" className="text-lg font-bold text-slate-900">
                {labels.title}
              </h2>
              <p className="text-xs text-slate-500">{labels.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={labels.cancel}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              {labels.nameLabel}
            </label>
            <input
              type="text"
              required
              minLength={3}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={labels.namePlaceholder}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                {labels.docLabel}
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={documentNumber}
                onChange={(e) =>
                  setDocumentNumber(e.target.value.replace(/\D/g, '').slice(0, isBrazilianDoctor ? 11 : 8))
                }
                placeholder={labels.docPlaceholder}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                {labels.genderLabel}
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'female' | 'male' | 'other')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                <option value="female">{labels.female}</option>
                <option value="male">{labels.male}</option>
                <option value="other">{labels.other}</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                {labels.birthLabel}
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                {labels.contactLabel}
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={labels.contactPlaceholder}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-sky-600"
            />
            <span>{labels.consent}</span>
          </label>

          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {labels.cancel}
            </button>
            <button
              type="submit"
              disabled={saving || !consentAccepted}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? labels.saving : labels.submit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
