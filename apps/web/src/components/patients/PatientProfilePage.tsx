'use client';

import { usePatientProfilePage } from '@/hooks/patients/usePatientProfilePage';
import { usePatientSession } from '@/hooks/patients/usePatientSession';
import type { UsePatientSessionResult } from '@/hooks/patients/usePatientSession';
import {
  Activity,
  AlertCircle,
  BadgeCheck,
  CalendarClock,
  ChevronLeft,
  ClipboardList,
  Droplets,
  Hash,
  HeartPulse,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCcw,
  Save,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  UserCircle2,
} from 'lucide-react';
import { Field, SelectField } from '@/components/shared/FormFields';
import { MetricCard } from '@/components/shared/MetricCard';
import { CrossModuleCard } from '@/components/shared/CrossModuleCard';
import {
  GENDER_OPTIONS, BLOOD_TYPE_OPTIONS,
  formatTimestamp, formatCompactDate, getCompletionTone,
} from './profile-constants';

function AuthenticatedPatientProfilePage({
  session,
}: {
  session: Pick<
    UsePatientSessionResult,
    'user' | 'profile' | 'patient' | 'error' | 'refresh'
  >;
}) {
  const {
    form,
    setField,
    resetForm,
    saveProfile,
    isSaving,
    secondaryError,
    saveError,
    saveSuccess,
    displayName,
    profileCompletion,
    age,
    bmi,
    genderLabel,
    lastUpdatedAt,
    missingFields,
    anamnesisCompletion,
    pendingAnamnesisSections,
    medicalSummary,
    medicalHistoryLoading,
    appointmentsLoading,
    upcomingAppointment,
    appointmentsCount,
    completedConsultations,
    reportsLoading,
    reportsCount,
    aiGeneratedReportsCount,
    latestReport,
    screeningsStats,
    screeningsHighlights,
  } = usePatientProfilePage(session);

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      {/* Hero */}
      <section className="bg-neutral-900 px-6 lg:px-12 pt-16 pb-20">
        <div className="max-w-7xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white/80 rounded-full text-xs font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            Perfil unificado
          </div>
          <h1 className="text-4xl lg:text-5xl text-white mb-4 leading-tight">{displayName}</h1>
          <p className="text-lg text-white/60">Última actualización: {formatTimestamp(lastUpdatedAt)}</p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6 lg:px-12 -mt-8 pb-10 space-y-6">
        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg">
          <div className="grid gap-6 px-6 py-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] lg:px-8">
            <div>
              <h2 className="text-2xl font-bold text-neutral-900 mb-3">
                Información personal
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
                Este perfil concentra solo la información canónica de identidad y contexto clínico
                base. La anamnesis, el historial y la prevención leen estos mismos datos para evitar
                duplicaciones y mantener consistencia.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-sky-100">
                  <Mail className="h-4 w-4 text-sky-600" />
                  {form.email || 'Sin email'}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-sky-100">
                  <Activity className="h-4 w-4 text-sky-600" />
                  {age !== null ? `${age} años` : 'Edad pendiente'}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-sky-100">
                  <UserCircle2 className="h-4 w-4 text-sky-600" />
                  {genderLabel}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-sky-100">
                  <Droplets className="h-4 w-4 text-sky-600" />
                  {form.bloodType || 'Grupo sanguíneo pendiente'}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-sky-100">
                  <HeartPulse className="h-4 w-4 text-sky-600" />
                  {bmi !== null ? `IMC ${bmi}` : 'IMC pendiente'}
                </span>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2">
                <div className="rounded-[1.5rem] border border-sky-100 bg-white/90 p-4 shadow-am-card">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                    Agenda conectada
                  </p>
                  <p className="mt-3 text-lg font-semibold text-gray-950">
                    {appointmentsLoading
                      ? 'Sincronizando agenda...'
                      : upcomingAppointment
                        ? `${upcomingAppointment.doctorName} · ${formatCompactDate(upcomingAppointment.scheduledAt)}`
                        : 'Sin citas próximas'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {appointmentsLoading
                      ? 'Cruzando próximos turnos y consultas previas.'
                      : upcomingAppointment?.specialty
                        ? `${upcomingAppointment.specialty}. ${appointmentsCount} turno(s) activos y ${completedConsultations} consulta(s) realizadas.`
                        : `${appointmentsCount} turno(s) activos y ${completedConsultations} consulta(s) realizadas.`}
                  </p>
                </div>

                <div className="rounded-[1.5rem] border border-sky-100 bg-white/90 p-4 shadow-am-card">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                    Informes reutilizables
                  </p>
                  <p className="mt-3 text-lg font-semibold text-gray-950">
                    {reportsLoading
                      ? 'Sincronizando informes...'
                      : latestReport
                        ? latestReport.title
                        : 'Sin informes clínicos todavía'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {reportsLoading
                      ? 'Leyendo reportes clínicos disponibles.'
                      : reportsCount > 0
                        ? `${reportsCount} informe(s), ${aiGeneratedReportsCount} generado(s) con IA. Último: ${formatCompactDate(latestReport?.dateRecorded ?? null)}.`
                        : 'Cuando existan informes o SOAPs, aparecerán acá sin duplicar carga manual.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-sky-100 bg-white/90 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
                    Integridad del perfil
                  </p>
                  <p className={`mt-2 text-4xl font-semibold ${getCompletionTone(profileCompletion)}`}>
                    {profileCompletion}%
                  </p>
                </div>
                <div className="rounded-2xl bg-sky-50 px-4 py-3 text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Pendientes
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{missingFields.length}</p>
                </div>
              </div>

              <div className="mt-6 h-3 overflow-hidden rounded-full bg-sky-50">
                <div
                  className="h-full rounded-full bg-sky-500 transition-[width] duration-500"
                  style={{ width: `${profileCompletion}%` }}
                />
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>Anamnesis</span>
                  <span className="font-semibold text-gray-900">{anamnesisCompletion}%</span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>Condiciones activas</span>
                  <span className="font-semibold text-gray-900">
                    {medicalSummary?.active_conditions_count ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>Controles preventivos al día</span>
                  <span className="font-semibold text-gray-900">{screeningsStats.upToDate}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {session.error ? (
          <div className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm leading-6">{session.error}</p>
          </div>
        ) : null}

        {secondaryError && secondaryError !== session.error ? (
          <div className="flex items-start gap-3 rounded-3xl border border-sky-100 bg-sky-50 px-5 py-4 text-sky-900">
            <Stethoscope className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm leading-6">
              Parte del contexto clínico complementario todavía no cargó. Podés seguir editando el
              perfil base mientras se sincronizan esos módulos.
            </p>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]">
          <section className="space-y-6">
            <div className="rounded-[2rem] border border-sky-100 bg-white p-6 shadow-am-card-lg sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-heading text-3xl text-gray-950">Datos canónicos del perfil</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                    Editá solo lo que es fuente de verdad en `profiles` y `patients`. La medicación,
                    alergias, diagnósticos y secciones extensas siguen viviendo en sus módulos dueños.
                  </p>
                </div>
                <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  <strong className="block font-semibold text-sky-900">Sin duplicar datos</strong>
                  Todo lo demás se muestra como resumen o link al módulo correspondiente.
                </div>
              </div>

              <div className="mt-8 space-y-8">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Identidad y contacto
                  </h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field
                      label="Nombre"
                      value={form.firstName}
                      onChange={(event) => setField('firstName', event.target.value)}
                      placeholder="Tu nombre"
                      icon={<UserCircle2 className="h-4 w-4" />}
                    />
                    <Field
                      label="Apellido"
                      value={form.lastName}
                      onChange={(event) => setField('lastName', event.target.value)}
                      placeholder="Tu apellido"
                      icon={<UserCircle2 className="h-4 w-4" />}
                    />
                    <Field
                      label="Email de acceso"
                      value={form.email}
                      disabled
                      hint="Se muestra como referencia y se reutiliza para autenticación."
                      icon={<Mail className="h-4 w-4" />}
                    />
                    <Field
                      label="Teléfono"
                      value={form.phone}
                      onChange={(event) => setField('phone', event.target.value)}
                      placeholder="+54 11 5555 5555"
                      icon={<Phone className="h-4 w-4" />}
                    />
                    <Field
                      label="CUIL"
                      value={form.cuil}
                      onChange={(event) => setField('cuil', event.target.value)}
                      placeholder="20-XXXXXXXX-9"
                      hint="Obligatorio para la validez legal de la receta (RCTA)."
                      icon={<Hash className="h-4 w-4" />}
                    />
                    <Field
                      label="Domicilio Real"
                      value={form.address}
                      onChange={(event) => setField('address', event.target.value)}
                      placeholder="Calle 123, Depto 4B, CABA"
                      hint="Requerido por Res. 2214/2025."
                      icon={<MapPin className="h-4 w-4" />}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Datos clínicos base
                  </h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field
                      label="Fecha de nacimiento"
                      type="date"
                      value={form.birthDate}
                      onChange={(event) => setField('birthDate', event.target.value)}
                      icon={<CalendarClock className="h-4 w-4" />}
                    />
                    <SelectField
                      label="Género"
                      value={form.gender}
                      onChange={(event) => setField('gender', event.target.value as typeof form.gender)}
                      icon={<UserCircle2 className="h-4 w-4" />}
                    >
                      {GENDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      label="Grupo sanguíneo"
                      value={form.bloodType}
                      onChange={(event) => setField('bloodType', event.target.value as typeof form.bloodType)}
                      icon={<Droplets className="h-4 w-4" />}
                    >
                      {BLOOD_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </SelectField>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Altura (cm)"
                        value={form.heightCm}
                        onChange={(event) => setField('heightCm', event.target.value)}
                        placeholder="170"
                      />
                      <Field
                        label="Peso (kg)"
                        value={form.weightKg}
                        onChange={(event) => setField('weightKg', event.target.value)}
                        placeholder="72.5"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Contacto de emergencia
                  </h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field
                      label="Nombre"
                      value={form.emergencyContactName}
                      onChange={(event) => setField('emergencyContactName', event.target.value)}
                      placeholder="Persona de confianza"
                    />
                    <Field
                      label="Relación"
                      value={form.emergencyContactRelationship}
                      onChange={(event) => setField('emergencyContactRelationship', event.target.value)}
                      placeholder="Hermana, padre, pareja..."
                    />
                    <Field
                      label="Teléfono"
                      value={form.emergencyContactPhone}
                      onChange={(event) => setField('emergencyContactPhone', event.target.value)}
                      placeholder="+54 11 5555 5555"
                      icon={<ShieldAlert className="h-4 w-4" />}
                    />
                    <Field
                      label="Email"
                      value={form.emergencyContactEmail}
                      onChange={(event) => setField('emergencyContactEmail', event.target.value)}
                      placeholder="contacto@ejemplo.com"
                      icon={<Mail className="h-4 w-4" />}
                    />
                  </div>
                </div>
              </div>

              {saveError ? (
                <div className="mt-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              ) : null}

              {saveSuccess ? (
                <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Perfil actualizado. Estos datos ya quedan disponibles para el resto del portal.</span>
                </div>
              ) : null}

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-sky-100 pt-6">
                <div className="text-sm text-gray-500">
                  Este guardado impacta en identificación, preventivos y contexto clínico básico.
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex items-center gap-2 rounded-full border border-sky-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-sky-200 hover:text-gray-950"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Restablecer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void saveProfile();
                    }}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-am-primary-sm transition-transform disabled:cursor-wait disabled:opacity-80 active:scale-[0.98]"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSaving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={<Activity className="h-5 w-5" />}
                label="Edad clínica"
                value={age !== null ? `${age} años` : 'Pendiente'}
              />
              <MetricCard
                icon={<HeartPulse className="h-5 w-5" />}
                label="IMC"
                value={bmi !== null ? String(bmi) : 'Pendiente'}
              />
              <MetricCard
                icon={<Droplets className="h-5 w-5" />}
                label="Grupo sanguíneo"
                value={form.bloodType || 'Pendiente'}
              />
              <MetricCard
                icon={<ShieldAlert className="h-5 w-5" />}
                label="Contacto de emergencia"
                value={form.emergencyContactPhone || 'Pendiente'}
              />
            </div>
          </section>

          <aside className="space-y-6">
            <CrossModuleCard
              title="Anamnesis"
              description="La fecha de nacimiento, el género y el contexto base completan el circuito clínico y evitan pedirte lo mismo varias veces."
              href="/patients/anamnesis"
              stats={[
                { label: 'Progreso', value: `${anamnesisCompletion}%` },
                {
                  label: 'Pendientes',
                  value:
                    pendingAnamnesisSections.length > 0
                      ? pendingAnamnesisSections.slice(0, 2).join(' · ')
                      : 'Sin pendientes',
                },
                {
                  label: 'Estado',
                  value: anamnesisCompletion >= 100 ? 'Completa' : 'En curso',
                },
              ]}
            />

            <CrossModuleCard
              title="Historial médico"
              description="Alergias, condiciones y medicación siguen siendo dueñas del historial. Acá solo mostramos el resumen para no duplicar edición."
              href="/patients/medical-history"
              stats={[
                {
                  label: 'Condiciones',
                  value: medicalHistoryLoading
                    ? 'Sincronizando...'
                    : String(medicalSummary?.active_conditions_count ?? 0),
                },
                {
                  label: 'Medicamentos',
                  value: medicalHistoryLoading
                    ? 'Sincronizando...'
                    : String(medicalSummary?.active_medications_count ?? 0),
                },
                {
                  label: 'Alergias',
                  value: medicalHistoryLoading
                    ? 'Sincronizando...'
                    : String(medicalSummary?.known_allergies_count ?? 0),
                },
              ]}
            />

            <CrossModuleCard
              title="Agenda"
              description="El perfil aprovecha turnos y consultas para mostrar continuidad asistencial sin replicar datos administrativos."
              href="/patients/appointments"
              stats={[
                {
                  label: 'Próxima',
                  value: appointmentsLoading
                    ? 'Sincronizando...'
                    : upcomingAppointment
                      ? formatCompactDate(upcomingAppointment.scheduledAt)
                      : 'Sin agenda',
                },
                {
                  label: 'Activas',
                  value: appointmentsLoading ? 'Sincronizando...' : String(appointmentsCount),
                },
                {
                  label: 'Realizadas',
                  value: appointmentsLoading ? 'Sincronizando...' : String(completedConsultations),
                },
              ]}
            />

            <CrossModuleCard
              title="Informes"
              description="Los reportes de consulta y documentos clínicos se leen desde su módulo origen y se resumen acá como contexto reutilizable."
              href="/patients/reports"
              stats={[
                {
                  label: 'Totales',
                  value: reportsLoading ? 'Sincronizando...' : String(reportsCount),
                },
                {
                  label: 'Último',
                  value: reportsLoading
                    ? 'Sincronizando...'
                    : latestReport
                      ? formatCompactDate(latestReport.dateRecorded)
                      : 'Sin datos',
                },
                {
                  label: 'IA',
                  value: reportsLoading ? 'Sincronizando...' : String(aiGeneratedReportsCount),
                },
              ]}
            />

            <CrossModuleCard
              title="Prevención"
              description="Las recomendaciones preventivas usan edad y género del perfil para priorizar controles sin volver a pedir esos datos."
              stats={[
                { label: 'Al día', value: String(screeningsStats.upToDate) },
                { label: 'Por coordinar', value: String(screeningsStats.dueSoon) },
                { label: 'Atrasados', value: String(screeningsStats.overdue) },
              ]}
            />

            <div className="rounded-[2rem] border border-sky-100 bg-white p-6 shadow-am-card-xl">
              <h2 className="font-heading text-2xl text-gray-950">Pendientes críticos</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Completá primero los campos que destraban más reutilización clínica.
              </p>
              {missingFields.length > 0 ? (
                <div className="mt-5 space-y-3">
                  {missingFields.map((field) => (
                    <div
                      key={field.id}
                      className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3"
                    >
                      <p className="text-sm font-semibold text-amber-900">{field.label}</p>
                      <p className="mt-1 text-sm leading-6 text-amber-800">{field.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                  <div className="flex items-start gap-3">
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      El núcleo del perfil está completo. El resto del circuito ya puede reutilizar
                      esta base sin pedirte información repetida.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[2rem] border border-sky-100 bg-white p-6 shadow-am-card-xl">
              <h2 className="font-heading text-2xl text-gray-950">Lectura transversal</h2>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl bg-sky-50/70 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Screenings
                  </p>
                  <div className="mt-2 space-y-2">
                    {screeningsHighlights.map((item) => (
                      <p key={item} className="text-sm text-gray-700">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl bg-sky-50/70 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Condiciones crónicas
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-700">
                    {medicalSummary?.chronic_conditions?.length
                      ? medicalSummary.chronic_conditions.slice(0, 3).join(' · ')
                      : 'Todavía no hay condiciones activas resumidas en historial.'}
                  </p>
                </div>

                <div className="rounded-2xl bg-sky-50/70 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Medicación actual
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-700">
                    {medicalSummary?.current_medications?.length
                      ? medicalSummary.current_medications.slice(0, 3).join(' · ')
                      : 'Sin medicación activa resumida en este momento.'}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-4">
                <div className="flex items-start gap-3">
                  <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <p className="text-sm leading-6 text-sky-900">
                    Si necesitás editar alergias, diagnósticos, hábitos o antecedentes detallados,
                    hacelo desde anamnesis o historial médico. Este perfil mantiene solo la base
                    compartida para que no existan dos versiones del mismo dato.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function PatientProfilePage() {
  const session = usePatientSession();

  if (session.loading) {
    return (
      <main className="min-h-screen bg-white px-5 py-8 text-gray-900">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="h-6 w-40 animate-pulse rounded-full bg-sky-100" />
          <div className="h-64 animate-pulse rounded-[2rem] bg-sky-50" />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
            <div className="h-[560px] animate-pulse rounded-[2rem] bg-sky-50" />
            <div className="h-[560px] animate-pulse rounded-[2rem] bg-sky-50" />
          </div>
        </div>
      </main>
    );
  }

  if (!session.user) {
    return (
      <main className="min-h-screen bg-white px-5 py-8 text-gray-900">
        <div className="mx-auto max-w-2xl rounded-[2rem] border border-sky-100 bg-white p-8 text-center shadow-am-2xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-50 text-sky-600">
            <UserCircle2 className="h-8 w-8" />
          </div>
          <h1 className="font-heading mt-5 text-4xl text-gray-950">Tu perfil clínico</h1>
          <p className="mt-4 text-base leading-7 text-gray-600">
            Iniciá sesión para ver y actualizar los datos que AutaMedica reutiliza en agenda,
            anamnesis, historial y recomendaciones preventivas.
          </p>
          <div className="mt-6 flex justify-center">
            <a
              href="/auth/login?role=patient"
              className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
            >
              Iniciar sesión
            </a>
          </div>
        </div>
      </main>
    );
  }

  return <AuthenticatedPatientProfilePage session={session} />;
}
