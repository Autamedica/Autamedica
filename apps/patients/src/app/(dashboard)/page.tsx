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

function describeAgenda(summary: DashboardSummary | null): string {
  if (!summary) {
    return 'Sin citas próximas.';
  }

  if (summary.agenda.nextAppointment) {
    return summary.agenda.nextAppointment.isToday
      ? 'Tu próxima consulta es hoy.'
      : 'Tu próxima consulta ya está programada.';
  }

  return 'Sin citas próximas.';
}

function describeHistory(summary: DashboardSummary | null): string {
  if (!summary) {
    return 'Sin registros cargados.';
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

function preventionSummary(summary: DashboardSummary | null): string {
  if (!summary) {
    return 'Sin controles cargados.';
  }

  if (summary.prevention.total === 0) {
    return 'Sin controles cargados.';
  }

  if (summary.prevention.overdue > 0) {
    return `${summary.prevention.overdue} control(es) requieren seguimiento inmediato.`;
  }

  if (summary.prevention.dueSoon > 0) {
    return `${summary.prevention.dueSoon} control(es) están próximos a vencer.`;
  }

  return 'Tus controles preventivos cargados están al día.';
}

function resultsSummary(summary: DashboardSummary | null): string {
  if (!summary) {
    return 'Sin estudios cargados.';
  }

  if (summary.results.latest) {
    return `Último estudio: ${summary.results.latest.testType} (${formatDate(summary.results.latest.testDate)}).`;
  }

  return 'Sin estudios cargados.';
}

function vitalsSummary(summary: DashboardSummary | null): string {
  if (!summary) {
    return 'Sin registros recientes.';
  }

  if (summary.observations.lastVitals?.bloodPressure) {
    return `Última presión registrada: ${summary.observations.lastVitals.bloodPressure}.`;
  }

  if (summary.observations.lastVitals?.heartRate) {
    return `Última frecuencia cardíaca: ${summary.observations.lastVitals.heartRate} lpm.`;
  }

  return 'Sin registros recientes.';
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
    ? `Falta información en: ${labels.join(', ')}.`
    : 'No faltan datos principales.';
}

function getPatientFacingSummary(insight: PatientAiInsightRecord | null): string | null {
  if (!insight || insight.status !== 'generated' || !insight.result?.patientFacingSummary) {
    return null;
  }

  return insight.result.patientFacingSummary;
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

  return (
    <div className="px-4 py-4 lg:px-6 lg:py-6">
      <div className="mx-auto flex w-full max-w-[1560px] gap-6">
        <div className="min-w-0 flex-1 space-y-6">
          <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.95)_55%,_rgba(224,231,255,0.92))] shadow-sm shadow-slate-900/5">
            <div className="grid gap-8 px-6 py-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] lg:px-8 lg:py-8">
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm ring-1 ring-sky-100">
                    <Activity className="h-3.5 w-3.5" />
                    Resumen
                  </span>
                  <span className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">
                    {todayLabel}
                  </span>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  Hola, {userName}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                  Agenda, antecedentes, estudios y prevención en un solo lugar.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <StatusChip
                    icon={
                      hasContactProfile ? (
                        <ShieldCheck className="h-4 w-4" />
                      ) : (
                        <Lock className="h-4 w-4 text-amber-500" />
                      )
                    }
                    label="Perfil"
                    value={hasContactProfile ? 'Completo' : 'Pendiente'}
                  />
                  {loading ? (
                    <>
                      <StatusChipSkeleton />
                      <StatusChipSkeleton />
                      <StatusChipSkeleton />
                    </>
                  ) : (
                    <>
                      <StatusChip
                        icon={<Calendar className="h-4 w-4" />}
                        label="Agenda"
                        value={
                          nextAppointment
                            ? nextAppointment.isToday
                              ? 'Hoy'
                              : 'Programada'
                            : 'Sin próximas'
                        }
                      />
                      <StatusChip
                        icon={<Sparkles className="h-4 w-4" />}
                        label="Prevención"
                        value={
                          pendingPreventive > 0
                            ? `${pendingPreventive} pendiente(s)`
                            : 'Al día'
                        }
                      />
                      <StatusChip
                        icon={<ShieldCheck className="h-4 w-4" />}
                        label="Alertas"
                        value={alerts.length > 0 ? `${alerts.length} activa(s)` : 'Sin alertas'}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-stone-200 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(250,245,255,0.95)_55%,_rgba(245,245,244,0.96))] p-6 text-stone-900 shadow-sm shadow-stone-900/5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Hoy
                </p>
                <div className="mt-5 space-y-4">
                  {loading && (
                    <>
                      <FocusRowSkeleton />
                      <FocusRowSkeleton />
                      <FocusRowSkeleton />
                    </>
                  )}

                  {!loading && error && (
                    <FocusRow
                      title="No pudimos cargar tu resumen"
                      description={error}
                    />
                  )}

                  {!loading && !error && primaryPriorities.map((priority) => (
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
                      title="Resumen"
                      description={patientFacingSummary}
                    />
                  )}

                  {!loading && !error && missingSections.length > 0 && (
                    <FocusRow
                      title="Falta completar información"
                      description={describeMissingSections(missingSections)}
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
                <h3 className="text-lg font-semibold text-slate-900">Agenda</h3>
              </div>
              <div className="flex-1">
                {loading ? (
                  <LoadingParagraph />
                ) : (
                  <p className="text-sm leading-6 text-slate-600">{describeAgenda(summary)}</p>
                )}
              </div>
              {!loading && nextAppointment && (
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
                <h3 className="text-lg font-semibold text-slate-900">Historia</h3>
              </div>
              <div className="flex-1">
                {loading ? (
                  <LoadingParagraph />
                ) : (
                  <p className="text-sm leading-6 text-slate-600">{describeHistory(summary)}</p>
                )}
              </div>
              <Link
                href="/medical-history"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                Abrir historia
                <ChevronRight className="h-4 w-4" />
              </Link>
            </article>
          </section>

          <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
            <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Tus registros</h2>
            </div>
            <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 xl:grid-cols-4">
              <InsightLinkCard
                href="/results"
                icon={<TestTubeDiagonal className="h-5 w-5" />}
                title="Resultados"
                summary={resultsSummary(summary)}
                value={summary ? `${summary.results.total} estudio(s)` : 'Sin estudios'}
                loading={loading}
              />
              <InsightLinkCard
                href="/preventive-health"
                icon={<Heart className="h-5 w-5" />}
                title="Prevención"
                summary={preventionSummary(summary)}
                value={
                  summary
                    ? `${summary.prevention.overdue + summary.prevention.dueSoon} pendiente(s)`
                    : 'Sin pendientes'
                }
                loading={loading}
              />
              <InsightLinkCard
                href="/medical-history"
                icon={<Stethoscope className="h-5 w-5" />}
                title="Tratamientos"
                summary={
                  summary?.history.currentMedications.length
                    ? `${summary.history.currentMedications.length} medicación(es) activa(s).`
                    : 'Sin tratamientos activos.'
                }
                value={summary ? `${summary.history.activeMedicationsCount} activa(s)` : 'Sin activas'}
                loading={loading}
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
                loading={loading}
              />
            </div>
          </section>
        </div>

        <aside className="hidden w-[360px] shrink-0 xl:block">
          <div className="sticky top-6">
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

function StatusChip({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-3 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm">
      <div className="text-sky-600">{icon}</div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <p className="mt-1 text-sm font-medium text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function StatusChipSkeleton() {
  return (
    <div className="inline-flex items-center gap-3 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm">
      <SkeletonBar className="h-4 w-4 rounded-full" />
      <div className="space-y-2">
        <SkeletonBar className="h-2.5 w-14" />
        <SkeletonBar className="h-3.5 w-20" />
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

function FocusRowSkeleton() {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-4">
      <div className="space-y-2">
        <SkeletonBar className="h-3.5 w-28" />
        <SkeletonBar className="h-3 w-full" />
        <SkeletonBar className="h-3 w-4/5" />
      </div>
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
  loading = false,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  summary: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-start gap-4 rounded-[24px] border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-sm"
      aria-busy={loading}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-600 transition-colors group-hover:bg-slate-100 group-hover:text-slate-900">
        {icon}
      </div>
      {loading ? (
        <div className="w-full space-y-2">
          <SkeletonBar className="h-2.5 w-16" />
          <SkeletonBar className="h-4 w-24" />
          <SkeletonBar className="h-3 w-full" />
          <SkeletonBar className="h-3 w-4/5" />
        </div>
      ) : (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
          <h4 className="mt-2 text-sm font-semibold text-slate-900">{value}</h4>
          <p className="mt-1 text-xs leading-5 text-slate-500">{summary}</p>
        </div>
      )}
    </Link>
  );
}

function LoadingParagraph({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBar
          key={index}
          className={`h-3 ${
            index === lines - 1 ? 'w-3/4' : 'w-full'
          }`}
        />
      ))}
    </div>
  );
}

function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-slate-200/80 ${className}`} />;
}
