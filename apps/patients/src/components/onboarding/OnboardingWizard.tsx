'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, ArrowRight, ArrowLeft, Check, User, Calendar, Phone } from 'lucide-react';
import { usePatientProfile } from '@/hooks/useProfile';

interface OnboardingWizardProps {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  allRequired?: boolean;
}

interface FormData {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  phone: string;
  emergencyName: string;
  emergencyPhone: string;
}

const GENDER_OPTIONS = [
  { value: 'male', label: 'Masculino' },
  { value: 'female', label: 'Femenino' },
  { value: 'other', label: 'Otro' },
  { value: 'prefer_not_to_say', label: 'Prefiero no decirlo' },
];

const STEPS = [
  { title: 'Bienvenida', icon: Heart },
  { title: 'Datos básicos', icon: User },
  { title: 'Contacto', icon: Phone },
];

export function OnboardingWizard({
  userId,
  firstName,
  lastName,
  email,
  allRequired = false,
}: OnboardingWizardProps) {
  const router = useRouter();
  const { updateProfile, isSaving } = usePatientProfile(userId);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [form, setForm] = useState<FormData>({
    firstName: firstName ?? '',
    lastName: lastName ?? '',
    birthDate: '',
    gender: '',
    phone: '',
    emergencyName: '',
    emergencyPhone: '',
  });

  const updateField = useCallback((field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  }, []);

  const validateStep1 = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!form.firstName.trim()) newErrors.firstName = 'El nombre es obligatorio';
    if (!form.lastName.trim()) newErrors.lastName = 'El apellido es obligatorio';
    if (!form.birthDate) newErrors.birthDate = 'La fecha de nacimiento es obligatoria';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = (): boolean => {
    if (!allRequired) return true;
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!form.phone.trim()) newErrors.phone = 'El teléfono es obligatorio';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep(prev => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setStep(prev => Math.max(prev - 1, 0));
  };

  const handleComplete = async (skipOptional: boolean) => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !skipOptional && !validateStep2()) return;

    const toNullable = (v: string) => (v.trim() || null);

    const result = await updateProfile({
      profile: {
        firstName: toNullable(form.firstName),
        lastName: toNullable(form.lastName),
        phone: skipOptional ? undefined : toNullable(form.phone),
      },
      patient: {
        birthDate: form.birthDate || null,
        gender: (form.gender || null) as 'male' | 'female' | 'other' | 'prefer_not_to_say' | null,
        emergencyContact: (!skipOptional && (form.emergencyName || form.emergencyPhone))
          ? {
              name: toNullable(form.emergencyName),
              phone: toNullable(form.emergencyPhone),
            }
          : undefined,
      },
    });

    if (result) {
      // Mark onboarding as completed via separate API call
      await fetch('/api/profile/onboarding-complete', { method: 'POST' });
      router.push('/');
      router.refresh();
    }
  };

  const displayName = email?.split('@')[0] ?? 'paciente';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4">
      <div className="w-full max-w-lg">
        {/* Progress bar */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  i < step
                    ? 'bg-sky-600 text-white'
                    : i === step
                      ? 'bg-sky-100 text-sky-700 ring-2 ring-sky-600'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-8 rounded ${i < step ? 'bg-sky-600' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-sky-100">
                <Heart className="h-10 w-10 text-sky-600" />
              </div>
              <h1 className="mb-2 text-2xl font-bold text-slate-900">
                Bienvenido/a a AutaMedica
              </h1>
              <p className="mb-6 text-slate-600">
                Hola <span className="font-semibold text-sky-700">{displayName}</span>, vamos a configurar
                tu perfil de salud en unos segundos.
              </p>
              <ul className="mb-8 space-y-3 text-left text-sm text-slate-600">
                <li className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <span>Gestiona tus citas y teleconsultas</span>
                </li>
                <li className="flex items-start gap-3">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <span>Mantiene tu historia clinica centralizada</span>
                </li>
                <li className="flex items-start gap-3">
                  <Heart className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <span>Recibe alertas preventivas personalizadas</span>
                </li>
              </ul>
              <button
                onClick={handleNext}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-6 py-3 font-semibold text-white transition hover:bg-sky-700"
              >
                Empezar
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 1: Required fields */}
          {step === 1 && (
            <div>
              <h2 className="mb-1 text-xl font-bold text-slate-900">Tus datos básicos</h2>
              <p className="mb-6 text-sm text-slate-500">
                Estos datos son necesarios para brindarte la mejor atención.
              </p>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-slate-700">
                      Nombre <span className="text-red-500">*</span>
                    </span>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={e => updateField('firstName', e.target.value)}
                      className={`rounded-lg border-2 px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-sky-200 ${
                        errors.firstName ? 'border-red-400' : 'border-slate-200 focus:border-sky-500'
                      }`}
                      placeholder="Tu nombre"
                    />
                    {errors.firstName && (
                      <span className="text-xs text-red-500">{errors.firstName}</span>
                    )}
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-slate-700">
                      Apellido <span className="text-red-500">*</span>
                    </span>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={e => updateField('lastName', e.target.value)}
                      className={`rounded-lg border-2 px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-sky-200 ${
                        errors.lastName ? 'border-red-400' : 'border-slate-200 focus:border-sky-500'
                      }`}
                      placeholder="Tu apellido"
                    />
                    {errors.lastName && (
                      <span className="text-xs text-red-500">{errors.lastName}</span>
                    )}
                  </label>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">
                    Fecha de nacimiento <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={e => updateField('birthDate', e.target.value)}
                    className={`rounded-lg border-2 px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-sky-200 ${
                      errors.birthDate ? 'border-red-400' : 'border-slate-200 focus:border-sky-500'
                    }`}
                  />
                  {errors.birthDate && (
                    <span className="text-xs text-red-500">{errors.birthDate}</span>
                  )}
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">Género</span>
                  <select
                    value={form.gender}
                    onChange={e => updateField('gender', e.target.value)}
                    className="rounded-lg border-2 border-slate-200 px-3 py-2 text-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  >
                    <option value="">Seleccionar</option>
                    {GENDER_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={handleBack}
                  className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Atrás
                </button>
                <button
                  onClick={handleNext}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
                >
                  Siguiente
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Optional fields */}
          {step === 2 && (
            <div>
              <h2 className="mb-1 text-xl font-bold text-slate-900">Información de contacto</h2>
              <p className="mb-6 text-sm text-slate-500">
                {allRequired
                  ? 'Estos datos ahora son obligatorios para continuar usando la plataforma.'
                  : 'Puedes completar esto ahora o hacerlo después desde Configuración.'}
              </p>

              <div className="space-y-4">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">
                    Teléfono {allRequired && <span className="text-red-500">*</span>}
                  </span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => updateField('phone', e.target.value)}
                    className={`rounded-lg border-2 px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-sky-200 ${
                      errors.phone ? 'border-red-400' : 'border-slate-200 focus:border-sky-500'
                    }`}
                    placeholder="+54 11 1234 5678"
                  />
                  {errors.phone && (
                    <span className="text-xs text-red-500">{errors.phone}</span>
                  )}
                </label>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-slate-700">Contacto de emergencia</h3>
                  <div className="space-y-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-600">Nombre completo</span>
                      <input
                        type="text"
                        value={form.emergencyName}
                        onChange={e => updateField('emergencyName', e.target.value)}
                        className="rounded-lg border-2 border-slate-200 px-3 py-2 text-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="Nombre del contacto"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-600">Teléfono</span>
                      <input
                        type="tel"
                        value={form.emergencyPhone}
                        onChange={e => updateField('emergencyPhone', e.target.value)}
                        className="rounded-lg border-2 border-slate-200 px-3 py-2 text-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="Número de emergencia"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={handleBack}
                  className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Atrás
                </button>
                <div className="flex items-center gap-3">
                  {!allRequired && (
                    <button
                      onClick={() => handleComplete(true)}
                      disabled={isSaving}
                      className="text-sm text-slate-500 transition hover:text-slate-700"
                    >
                      Completar después
                    </button>
                  )}
                  <button
                    onClick={() => handleComplete(false)}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                  >
                    {isSaving ? 'Guardando...' : 'Finalizar'}
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Tu información está protegida con cifrado de nivel médico.
        </p>
      </div>
    </div>
  );
}
