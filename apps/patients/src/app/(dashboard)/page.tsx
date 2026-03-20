'use client';

import { DynamicRightPanel } from '@/components/layout/DynamicRightPanel';
import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { usePatientSession } from '@/hooks/usePatientSession';
import type { DashboardPriorityTone, DashboardSummary } from '@/types/dashboard-summary';
import type { PatientAiInsightRecord } from '@/types/patient-snapshot';
import {
  Activity,
  Calendar,
  ChevronRight,
  FileText,
  Heart,
  Lock,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TestTubeDiagonal,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

const TRACKED_PORTAL_SECTIONS = [
  'appointments',
  'anamnesis',
  'medical_history',
  'lab_results',
  'preventive_screenings',
  'observations',
] as const;

interface DashboardPrimaryAction {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
}

interface DashboardCompletionAction {
  href: string;
  ctaLabel: string;
}

function getPatientName(
  profile: ReturnType<typeof usePatientSession>['profile'],
  user: ReturnType<typeof usePatientSession>['user'],
): string {
  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
  const metadata = user?.user_metadata as Record<string, unknown> | undefined;
  const metadataName =
    [metadata?.first_name, metadata?.last_name].filter(Boolean).join(' ').trim() || undefined;
  const emailLocal = user?.email?.split('@')[0];

  return profileName || metadataName || emailLocal || 'Paciente';
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    ...(options ?? {}),
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function describeAgenda(summary: DashboardSummary | null, loading: boolean): string {
  if (loading) {
    return 'Cargando tu agenda clínica.';
  }

  if (!summary) {
    return 'Completa tu perfil o agenda una consulta para empezar a ver tu agenda clínica aquí.';
  }

  if (summary.agenda.nextAppointment) {
    return summary.agenda.nextAppointment.isToday
      ? 'Tu próxima consulta es hoy.'
      : 'Tu próxima consulta ya está programada.';
  }

  return 'Todavía no tienes consultas programadas. Puedes agendar la próxima cuando la necesites.';
}

function describeHistory(summary: DashboardSummary | null, loading: boolean): string {
  if (loading) {
    return 'Reuniendo tu historia clínica.';
  }

  if (!summary) {
    return 'Completa tu anamnesis y antecedentes para construir una historia clínica útil.';
  }

  if (
    summary.history.activeConditionsCount === 0 &&
    summary.history.activeMedicationsCount === 0 &&
    summary.history.knownAllergiesCount === 0 &&
    summary.history.anamnesisCompletion === null
  ) {
    return 'Completa tu anamnesis para construir un resumen clínico más útil y accionable.';
  }

  const parts = [
    `${summary.history.activeConditionsCount} diagnóstico(s) activo(s)`,
    `${summary.history.activeMedicationsCount} medicación(es) activa(s)`,
    `${summary.history.knownAllergiesCount} alergia(s) registrada(s)`,
  ];

  if (summary.history.anamnesisCompletion !== null) {
    parts.push(`anamnesis al ${summary.history.anamnesisCompletion}%`);
  }

  return parts.join(' · ');
}

function preventionSummary(summary: DashboardSummary | null, loading: boolean): string {
  if (loading) {
    return 'Cargando tu seguimiento preventivo.';
  }

  if (!summary) {
    return 'Agrega más información clínica para sugerir controles preventivos relevantes.';
  }

  if (summary.prevention.total === 0) {
    return 'Completa tu historia clínica para sugerir controles preventivos relevantes.';
  }

  if (summary.prevention.overdue > 0) {
    return `${summary.prevention.overdue} control(es) requieren seguimiento inmediato.`;
  }

  if (summary.prevention.dueSoon > 0) {
    return `${summary.prevention.dueSoon} control(es) están próximos a vencer.`;
  }

  return 'Tus controles preventivos cargados están al día.';
}

function resultsSummary(summary: DashboardSummary | null, loading: boolean): string {
  if (loading) {
    return 'Consultando tus estudios cargados.';
  }

  if (!summary) {
    return 'Cuando subas estudios reales, los verás aquí con su contexto clínico.';
  }

  if (summary.results.latest) {
    return `Último estudio: ${summary.results.latest.testType} (${formatDate(summary.results.latest.testDate)}).`;
  }

  return 'Todavía no cargaste estudios. Cuando subas uno aparecerá aquí.';
}

function vitalsSummary(summary: DashboardSummary | null, loading: boolean): string {
  if (loading) {
    return 'Buscando tu último registro de signos vitales.';
  }

  if (!summary) {
    return 'Necesitas observaciones o signos vitales para activar este bloque.';
  }

  if (summary.observations.lastVitals?.bloodPressure) {
    return `Última presión registrada: ${summary.observations.lastVitals.bloodPressure}.`;
  }

  if (summary.observations.lastVitals?.heartRate) {
    return `Última frecuencia cardíaca: ${summary.observations.lastVitals.heartRate} lpm.`;
  }

  return 'Registra tus signos vitales para seguir cambios y señales clínicas recientes.';
}

function priorityToneClassName(tone: DashboardPriorityTone): string {
  if (tone === 'critical') {
    return 'border-rose-200 bg-rose-50 text-rose-800';
  }

  if (tone === 'attention') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }

  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
}

function describeMissingSections(missingSections: string[]): string {
  const labels = missingSections.map((section) => {
    switch (section) {
      case 'appointments':
        return 'agenda clínica';
      case 'anamnesis':
        return 'anamnesis';
      case 'medical_history':
        return 'antecedentes y tratamientos';
      case 'lab_results':
        return 'estudios';
      case 'preventive_screenings':
        return 'controles preventivos';
      case 'observations':
        return 'síntomas o signos vitales';
      default:
        return section;
    }
  });

  return labels.length > 0
    ? `Todavía faltan datos en: ${labels.join(', ')}.`
    : 'Tu perfil ya tiene las fuentes mínimas para personalizar el portal.';
}

function getPatientFacingSummary(insight: PatientAiInsightRecord | null): string | null {
  if (!insight || insight.status !== 'generated' || !insight.result?.patientFacingSummary) {
    return null;
  }

  return insight.result.patientFacingSummary;
}

function getProgressStatus({
  hasContactProfile,
  missingSections,
}: {
  hasContactProfile: boolean;
  missingSections: string[];
}): { completed: number; total: number; percentage: number } {
  const completedTrackedSections = TRACKED_PORTAL_SECTIONS.filter(
    (section) => !missingSections.includes(section),
  ).length;
  const completed = completedTrackedSections + (hasContactProfile ? 1 : 0);
  const total = TRACKED_PORTAL_SECTIONS.length + 1;
  const percentage = Math.round((completed / total) * 100);

  return { completed, total, percentage };
}

function describeProgress({
  percentage,
  missingSections,
  hasDashboardData,
  hasContactProfile,
}: {
  percentage: number;
  missingSections: string[];
  hasDashboardData: boolean;
  hasContactProfile: boolean;
}): string {
  if (!hasDashboardData) {
    return hasContactProfile
      ? 'Tu perfil básico ya existe, pero todavía faltan fuentes clínicas para construir el panel.'
      : 'Completa tu perfil y los primeros datos clínicos para activar un panel realmente personalizado.';
  }

  if (!hasContactProfile) {
    return 'Tu información clínica principal existe, pero el perfil básico todavía está incompleto.';
  }

  if (missingSections.length === 0) {
    return 'Tu portal ya refleja todas las fuentes clínicas principales disponibles.';
  }

  if (percentage < 40) {
    return 'Faltan datos base para personalizar bien el portal y priorizar mejor tus próximos pasos.';
  }

  if (percentage < 75) {
    return 'Ya existe una base clínica inicial. Completar las áreas faltantes hará el panel más útil.';
  }

  return 'Tu portal ya tiene buena cobertura clínica. Completa los últimos datos para cerrar el circuito.';
}

function getPrimaryAction({
  hasContactProfile,
  missingSections,
  nextAppointment,
  pendingPreventive,
  alertsCount,
}: {
  hasContactProfile: boolean;
  missingSections: string[];
  nextAppointment: DashboardSummary['agenda']['nextAppointment'] | null;
  pendingPreventive: number;
  alertsCount: number;
}): DashboardPrimaryAction {
  if (!hasContactProfile) {
    return {
      eyebrow: 'Paso recomendado',
      title: 'Completa tu perfil básico',
      description: 'Agrega tus datos personales y de contacto para activar un seguimiento clínico más confiable.',
      href: '/profile',
      ctaLabel: 'Completar perfil',
      secondaryHref: '/medical-history',
      secondaryLabel: 'Ver historia clínica',
    };
  }

  if (missingSections.includes('anamnesis')) {
    return {
      eyebrow: 'Paso recomendado',
      title: 'Completa tu anamnesis',
      description: 'Es la pieza que más impacta en la personalización de alertas, prioridades y prevención.',
      href: '/anamnesis',
      ctaLabel: 'Completar anamnesis',
      secondaryHref: '/medical-history',
      secondaryLabel: 'Abrir historia clínica',
    };
  }

  if (nextAppointment) {
    return {
      eyebrow: nextAppointment.isToday ? 'Consulta de hoy' : 'Agenda activa',
      title: nextAppointment.isToday
        ? 'Prepárate para tu consulta de hoy'
        : 'Revisa tu próxima consulta',
      description: nextAppointment.isToday
        ? 'Confirma horario, especialidad y cualquier dato clínico que quieras tener a mano.'
        : 'Tu agenda ya tiene una próxima cita. Revisa fecha, profesional y contexto antes de llegar.',
      href: '/appointments',
      ctaLabel: 'Ver mi agenda',
      secondaryHref: '/medical-history',
      secondaryLabel: 'Revisar antecedentes',
    };
  }

  if (pendingPreventive > 0) {
    return {
      eyebrow: 'Prevención',
      title: 'Pon al día tus controles preventivos',
      description: 'Tienes controles por revisar. Resolverlos ahora mejora el seguimiento preventivo del portal.',
      href: '/preventive-health',
      ctaLabel: 'Revisar prevención',
      secondaryHref: '/results',
      secondaryLabel: 'Ver resultados',
    };
  }

  if (alertsCount > 0) {
    return {
      eyebrow: 'Seguimiento',
      title: 'Revisa las señales detectadas',
      description: 'Hay eventos clínicos que merecen seguimiento. Conviene revisarlos antes de cargar más datos.',
      href: '/medical-history',
      ctaLabel: 'Ver señales clínicas',
      secondaryHref: '/indicators',
      secondaryLabel: 'Abrir indicadores',
    };
  }

  if (missingSections.includes('lab_results')) {
    return {
      eyebrow: 'Resultados',
      title: 'Sube tu último estudio',
      description: 'Agregar estudios reales mejora el contexto médico y evita un panel con vacíos innecesarios.',
      href: '/results',
      ctaLabel: 'Cargar resultados',
      secondaryHref: '/medical-history',
      secondaryLabel: 'Revisar historia clínica',
    };
  }

  return {
    eyebrow: 'Portal al día',
    title: 'Tu resumen ya tiene una base sólida',
    description: 'Ahora puedes revisar agenda, historia clínica y prevención sin pasos pendientes urgentes.',
    href: '/medical-history',
    ctaLabel: 'Ver mi resumen clínico',
    secondaryHref: '/appointments',
    secondaryLabel: 'Ir a mi agenda',
  };
}

function getCompletionAction({
  hasContactProfile,
  missingSections,
  fallback,
}: {
  hasContactProfile: boolean;
  missingSections: string[];
  fallback: DashboardPrimaryAction;
}): DashboardCompletionAction {
  if (!hasContactProfile) {
    return { href: '/profile', ctaLabel: 'Completar perfil' };
  }

  if (missingSections.includes('anamnesis')) {
    return { href: '/anamnesis', ctaLabel: 'Completar anamnesis' };
  }

  if (missingSections.includes('medical_history')) {
    return { href: '/medical-history', ctaLabel: 'Completar historia clínica' };
  }

  if (missingSections.includes('lab_results')) {
    return { href: '/results', ctaLabel: 'Cargar resultados' };
  }

  if (missingSections.includes('preventive_screenings')) {
    return { href: '/preventive-health', ctaLabel: 'Revisar prevención' };
  }

  if (missingSections.includes('observations')) {
    return { href: '/medical-history', ctaLabel: 'Registrar observaciones' };
  }

  if (missingSections.includes('appointments')) {
    return { href: '/appointments', ctaLabel: 'Ver mi agenda' };
  }

  return { href: fallback.href, ctaLabel: fallback.ctaLabel };
}

export default function DashboardPage() {
  const { user, profile } = usePatientSession();
  const { data, loading, error } = useDashboardSummary();
  const userName = getPatientName(profile, user);
  const hasContactProfile = Boolean(profile?.firstName || profile?.lastName || profile?.phone);
  const todayLabel = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const summary = data?.summary ?? null;
  const alerts = data?.alerts ?? [];
  const missingSections = data?.missingSections ?? [];
  const latestInsight = data?.latestInsight ?? null;
  const nextAppointment = summary?.agenda.nextAppointment ?? null;
  const primaryPriorities = summary?.priorities.slice(0, 3) ?? [];
  const pendingPreventive = (summary?.prevention.overdue ?? 0) + (summary?.prevention.dueSoon ?? 0);
  const patientFacingSummary = getPatientFacingSummary(latestInsight);
  const progress = getProgressStatus({ hasContactProfile, missingSections });
  const primaryAction = getPrimaryAction({
    hasContactProfile,
    missingSections,
    nextAppointment,
    pendingPreventive,
    alertsCount: alerts.length,
  });
  const completionAction = getCompletionAction({
    hasContactProfile,
    missingSections,
    fallback: primaryAction,
  });

  return (
    <div className="px-4 py-4 lg:px-6 lg:py-6">
      <div className="mx-auto flex w-full max-w-[1560px] gap-6">
        <div className="min-w-0 flex-1 space-y-6">
          <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.95)_55%,_rgba(224,231,255,0.92))] shadow-sm shadow-slate-900/5">
            <div className="grid gap-8 px-6 py-7 xl:grid-cols-[minmax(0,1.25fr)_minmax(310px,0.75fr)] lg:px-8 lg:py-8">
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm ring-1 ring-sky-100">
                    <Activity className="h-3.5 w-3.5" />
                    Resumen clínico personalizado
                  </span>
                  <span className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">
                    {todayLabel}
                  </span>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  Hola, {userName}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                  Este panel se construye con tus datos clínicos reales: agenda, historia médica,
                  estudios y controles preventivos.
                </p>

                <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <section className="overflow-hidden rounded-[30px] bg-slate-950 px-6 py-6 text-white shadow-lg shadow-slate-900/15">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-200">
                      {primaryAction.eyebrow}
                    </p>
                    <h2 className="mt-3 max-w-xl text-2xl font-semibold tracking-tight sm:text-[2rem]">
                      {primaryAction.title}
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                      {primaryAction.description}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Link
                        href={primaryAction.href}
                        className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                      >
                        {primaryAction.ctaLabel}
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                      <Link
                        href={primaryAction.secondaryHref}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-medium text-white/90 transition hover:bg-white/10"
                      >
                        {primaryAction.secondaryLabel}
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </section>

                  <section className="rounded-[30px] border border-white/80 bg-white/85 p-5 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Progreso clínico
                    </p>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-3xl font-semibold tracking-tight text-slate-900">
                          {progress.percentage}%
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {progress.completed} de {progress.total} áreas listas
                        </p>
                      </div>
                      <Sparkles className="h-6 w-6 text-sky-500" />
                    </div>
                    <div className="mt-4 h-2 rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full bg-[linear-gradient(90deg,_#0ea5e9,_#2563eb)]"
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-600">
                      {describeProgress(progress.percentage, missingSections)}
                    </p>
                  </section>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <DashboardMetricCard
                    icon={
                      hasContactProfile ? (
                        <ShieldCheck className="h-4 w-4" />
                      ) : (
                        <Lock className="h-4 w-4 text-amber-500" />
                      )
                    }
                    label="Perfil"
                    value={hasContactProfile ? 'Listo' : 'Completar'}
                    detail={hasContactProfile ? 'Datos básicos cargados' : 'Falta información personal'}
                  />
                  <DashboardMetricCard
                    icon={<Calendar className="h-4 w-4" />}
                    label="Agenda"
                    value={
                      nextAppointment
                        ? nextAppointment.isToday
                          ? 'Consulta hoy'
                          : 'Próxima cita'
                        : 'Sin agenda'
                    }
                    detail={
                      nextAppointment
                        ? formatDateTime(nextAppointment.startTime)
                        : 'Todavía no tienes consultas próximas'
                    }
                  />
                  <DashboardMetricCard
                    icon={<Sparkles className="h-4 w-4" />}
                    label="Prevención"
                    value={pendingPreventive > 0 ? `${pendingPreventive} pendiente(s)` : 'Al día'}
                    detail={
                      pendingPreventive > 0
                        ? 'Hay controles preventivos para revisar'
                        : 'Sin alertas preventivas por ahora'
                    }
                  />
                  <DashboardMetricCard
                    icon={<TestTubeDiagonal className="h-4 w-4" />}
                    label="Resultados"
                    value={summary ? `${summary.results.total} estudio(s)` : 'Cargando'}
                    detail={
                      summary?.results.latest
                        ? `Último: ${summary.results.latest.testType}`
                        : 'Cuando cargues estudios aparecerán aquí'
                    }
                  />
                </div>
              </div>

              <div className="rounded-[28px] border border-stone-200 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(250,245,255,0.95)_55%,_rgba(245,245,244,0.96))] p-6 text-stone-900 shadow-sm shadow-stone-900/5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">
                  En foco hoy
                </p>
                <div className="mt-5 space-y-4">
                  {loading && (
                    <FocusRow
                      title="Preparando tu resumen"
                      description="Estamos reuniendo tus datos clínicos más recientes."
                    />
                  )}

                  {!loading && error && (
                    <FocusRow
                      title="No pudimos cargar tu resumen"
                      description={error}
                    />
                  )}

                  {!loading && !error && primaryPriorities.slice(0, 2).map((priority) => (
                    <FocusLinkRow
                      key={priority.id}
                      title={priority.title}
                      description={priority.description}
                      href={priority.href}
                      tone={priority.tone}
                    />
                  ))}

                  {!loading && !error && patientFacingSummary && (
                    <FocusRow
                      title="Resumen personalizado"
                      description={patientFacingSummary}
                    />
                  )}

                  {!loading && !error && !patientFacingSummary && primaryPriorities.length === 0 && (
                    <FocusRow
                      title="Sin tareas urgentes"
                      description="Tu panel no muestra prioridades críticas ahora mismo. Puedes revisar historia clínica o prevención para mantenerlo actualizado."
                    />
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <article className="relative flex flex-col rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-4 flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Calendar className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Agenda clínica</h3>
              </div>
              <p className="flex-1 text-sm leading-6 text-slate-600">
                {describeAgenda(summary)}
              </p>
              {nextAppointment && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">
                    {nextAppointment.doctorName ?? 'Consulta médica'}
                  </p>
                  <p className="mt-1">
                    {formatDateTime(nextAppointment.startTime)}
                  </p>
                  {nextAppointment.doctorSpecialty && (
                    <p className="mt-1 text-xs text-slate-500">{nextAppointment.doctorSpecialty}</p>
                  )}
                </div>
              )}
              <Link
                href="/appointments"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800"
              >
                Ver mi agenda
                <ChevronRight className="h-4 w-4" />
              </Link>
            </article>

            <article className="relative flex flex-col rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-4 flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-600">
                  <FileText className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Mi historia clínica</h3>
              </div>
              <p className="flex-1 text-sm leading-6 text-slate-600">
                {describeHistory(summary)}
              </p>
              <Link
                href="/medical-history"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                Abrir historia clínica
                <ChevronRight className="h-4 w-4" />
              </Link>
            </article>
          </section>

          <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
            <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Estado de tu información</h2>
              <p className="mt-1 text-sm text-slate-500">
                Cada bloque refleja datos reales de tu perfil clínico y se vacía si esa información todavía no existe.
              </p>
            </div>
            {missingSections.length > 0 && (
              <div className="border-b border-amber-100 bg-amber-50/80 px-6 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
                      Para personalizar mejor tu portal
                    </p>
                    <p className="mt-1 text-sm leading-6 text-amber-900">
                      {describeMissingSections(missingSections)}
                    </p>
                  </div>
                  <Link
                    href={completionAction.href}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-800"
                  >
                    {completionAction.ctaLabel}
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
            <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 xl:grid-cols-4">
              <InsightLinkCard
                href="/results"
                icon={<TestTubeDiagonal className="h-5 w-5" />}
                title="Resultados"
                summary={resultsSummary(summary)}
                value={
                  summary
                    ? `${summary.results.total} estudio(s)`
                    : 'Cargando'
                }
              />
              <InsightLinkCard
                href="/preventive-health"
                icon={<Heart className="h-5 w-5" />}
                title="Prevención"
                summary={preventionSummary(summary)}
                value={
                  summary
                    ? `${summary.prevention.overdue + summary.prevention.dueSoon} pendiente(s)`
                    : 'Cargando'
                }
              />
              <InsightLinkCard
                href="/medical-history"
                icon={<Stethoscope className="h-5 w-5" />}
                title="Tratamientos"
                summary={
                  summary?.history.currentMedications.length
                    ? `${summary.history.currentMedications.length} medicación(es) activa(s).`
                    : 'No hay tratamientos activos cargados.'
                }
                value={
                  summary
                    ? `${summary.history.activeMedicationsCount} activa(s)`
                    : 'Cargando'
                }
              />
              <InsightLinkCard
                href="/medical-history"
                icon={<Activity className="h-5 w-5" />}
                title="Signos vitales"
                summary={vitalsSummary(summary)}
                value={
                  summary?.observations.lastVitals
                    ? formatDate(summary.observations.lastVitals.measuredAt)
                    : 'Sin registro'
                }
              />
            </div>
          </section>
        </div>

        <aside className="hidden w-[320px] shrink-0 xl:block">
          <div className="sticky top-6 overflow-hidden rounded-[32px] border border-slate-200 bg-white/90 shadow-sm shadow-slate-900/5 backdrop-blur">
            <div className="border-b border-stone-200 bg-[linear-gradient(135deg,_rgba(250,245,255,0.9),_rgba(255,255,255,0.98)_55%,_rgba(239,246,255,0.88))] px-5 py-4 text-stone-900">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">
                Resumen contextual
              </p>
              <p className="mt-1 text-sm text-stone-600">
                Vista secundaria para revisar agenda, contexto y seguimiento sin quitar protagonismo al panel principal.
              </p>
            </div>
            <DynamicRightPanel
              context="dashboard"
              dashboardView={data}
              summaryLoading={loading}
              summaryError={error}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function DashboardMetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/80 bg-white/85 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-sky-50 p-2.5 text-sky-600">{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function FocusRow({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-4">
      <p className="text-sm font-semibold text-stone-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-stone-600">{description}</p>
    </div>
  );
}

function FocusLinkRow({
  title,
  description,
  href,
  tone,
}: {
  title: string;
  description: string;
  href: string;
  tone: DashboardPriorityTone;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-2xl border px-4 py-4 transition hover:shadow-sm ${priorityToneClassName(tone)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-6 opacity-90">{description}</p>
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
      </div>
    </Link>
  );
}

function InsightLinkCard({
  href,
  icon,
  title,
  summary,
  value,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  summary: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-start gap-4 rounded-[24px] border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-600 transition-colors group-hover:bg-slate-100 group-hover:text-slate-900">
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
        <h4 className="mt-2 text-sm font-semibold text-slate-900">{value}</h4>
        <p className="mt-1 text-xs leading-5 text-slate-500">{summary}</p>
      </div>
    </Link>
  );
}
