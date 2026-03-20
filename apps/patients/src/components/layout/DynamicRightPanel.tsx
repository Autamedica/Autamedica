'use client';

import Link from 'next/link';
import {
  BloodPressureModal,
  LabResultModal,
  MedicationModal,
  SymptomModal,
} from '@/components/quick-actions/QuickActionModals';
import { dashboardQuickCaptureLinks } from '@/data/patient-navigation';
import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { usePatientSession } from '@/hooks/usePatientSession';
import type { DashboardSummary } from '@/types/dashboard-summary';
import type { DashboardViewData } from '@/types/dashboard-view';
import type {
  PatientAiInsightRecord,
  PatientDeterministicAlert,
} from '@/types/patient-snapshot';
import {
  Activity,
  AlertTriangle,
  Calendar,
  Clock,
  FileText,
  Heart,
  MessageSquare,
  Pill,
  Sparkles,
  TestTubeDiagonal,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

type PanelTab = 'brief' | 'actions' | 'medical' | 'chat';

interface DynamicRightPanelProps {
  context?: 'dashboard' | 'video' | 'appointments' | 'history';
  dashboardView?: DashboardViewData | null;
  summaryLoading?: boolean;
  summaryError?: string | null;
}

type PanelContext = NonNullable<DynamicRightPanelProps['context']>;

interface TabConfig {
  id: PanelTab;
  label: string;
  icon: typeof Activity;
}

type QuickActionModalKey = 'blood-pressure' | 'medication' | 'symptom' | 'lab-result';

function tabsForContext(context: PanelContext): TabConfig[] {
  switch (context) {
    case 'video':
      return [
        { id: 'chat', label: 'Canal', icon: MessageSquare },
        { id: 'medical', label: 'Contexto', icon: FileText },
      ];
    case 'appointments':
      return [
        { id: 'brief', label: 'Agenda', icon: Calendar },
        { id: 'actions', label: 'Registro', icon: Zap },
      ];
    case 'history':
      return [
        { id: 'medical', label: 'Resumen', icon: TrendingUp },
        { id: 'actions', label: 'Captura', icon: Activity },
      ];
    default:
      return [
        { id: 'brief', label: 'Resumen', icon: FileText },
        { id: 'actions', label: 'Registro', icon: Activity },
        { id: 'medical', label: 'Contexto', icon: Heart },
      ];
  }
}

function defaultTabForContext(context: PanelContext): PanelTab {
  switch (context) {
    case 'video':
      return 'chat';
    case 'history':
      return 'medical';
    default:
      return 'brief';
  }
}

function getPreferredName(
  profile: ReturnType<typeof usePatientSession>['profile'],
  user: ReturnType<typeof usePatientSession>['user'],
): string {
  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
  const metadata = user?.user_metadata as Record<string, unknown> | undefined;
  const metadataName =
    typeof metadata?.full_name === 'string' ? metadata.full_name : undefined;
  const fallbackName = user?.email?.split('@')[0] ?? 'Paciente';

  return (profileName || metadataName || fallbackName).split(' ')[0] ?? 'Paciente';
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(value));
}

function alertHref(category: PatientDeterministicAlert['category']): string {
  switch (category) {
    case 'appointments':
      return '/appointments';
    case 'prevention':
      return '/preventive-health';
    case 'results':
      return '/results';
    case 'history':
    case 'profile':
      return '/medical-history';
    case 'symptoms':
    case 'vitals':
      return '/medical-history';
    default:
      return '/medical-history';
  }
}

function getPatientFacingSummary(insight: PatientAiInsightRecord | null): string | null {
  if (!insight || insight.status !== 'generated' || !insight.result?.patientFacingSummary) {
    return null;
  }

  return insight.result.patientFacingSummary;
}

export function DynamicRightPanel({
  context = 'dashboard',
  dashboardView,
  summaryLoading,
  summaryError,
}: DynamicRightPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>(() => defaultTabForContext(context));
  const tabs = useMemo(() => tabsForContext(context), [context]);
  const managedExternally =
    dashboardView !== undefined || summaryLoading !== undefined || summaryError !== undefined;
  const internalDashboardView = useDashboardSummary({ enabled: !managedExternally });
  const { user, profile } = usePatientSession();
  const preferredName = getPreferredName(profile, user);

  const resolvedDashboardView = managedExternally ? dashboardView ?? null : internalDashboardView.data;
  const resolvedSummary = resolvedDashboardView?.summary ?? null;
  const resolvedLoading = managedExternally ? Boolean(summaryLoading) : internalDashboardView.loading;
  const resolvedError = managedExternally ? summaryError ?? null : internalDashboardView.error;

  useEffect(() => {
    setActiveTab(defaultTabForContext(context));
  }, [context]);

  return (
    <aside className="relative flex w-full min-w-0 max-w-[340px] flex-col border-l border-slate-200/50 bg-white/35 shadow-xl shadow-indigo-900/5 backdrop-blur-2xl">
      <div className="border-b border-indigo-100/50 bg-white/60 px-5 py-4 backdrop-blur-md">
        <p className="inline-flex rounded-full bg-indigo-100/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
          Panel contextual
        </p>
        <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
          Referencia rápida con agenda, prioridades y contexto médico real.
        </p>
      </div>

      <div className="flex border-b border-slate-200/60 bg-white/40 backdrop-blur-sm">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group flex flex-1 items-center justify-center gap-2 px-3 py-3.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-300 ${
                isActive
                  ? 'border-b-2 border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-[inset_0_-1px_0_0_rgba(79,70,229,0.1)]'
                  : 'border-b-2 border-transparent text-slate-500 hover:bg-slate-50/50 hover:text-slate-700'
              }`}
            >
              <Icon
                className={`h-4 w-4 transition-transform duration-300 ${
                  isActive ? 'scale-110' : 'group-hover:scale-110'
                }`}
              />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'brief' && (
          <DailyBriefPanel
            summary={resolvedSummary}
            loading={resolvedLoading}
            error={resolvedError}
            preferredName={preferredName}
            alerts={resolvedDashboardView?.alerts ?? []}
            latestInsight={resolvedDashboardView?.latestInsight ?? null}
            missingSections={resolvedDashboardView?.missingSections ?? []}
          />
        )}
        {activeTab === 'actions' && <ClinicalLogPanel />}
        {activeTab === 'medical' && (
          <MedicalContextPanel
            summary={resolvedSummary}
            loading={resolvedLoading}
            error={resolvedError}
          />
        )}
        {activeTab === 'chat' && <ChatPanel context={context} />}
      </div>
    </aside>
  );
}

function DailyBriefPanel({
  summary,
  loading,
  error,
  preferredName,
  alerts,
  latestInsight,
  missingSections,
}: {
  summary: DashboardSummary | null;
  loading: boolean;
  error: string | null;
  preferredName: string;
  alerts: PatientDeterministicAlert[];
  latestInsight: PatientAiInsightRecord | null;
  missingSections: string[];
}) {
  const patientFacingSummary = getPatientFacingSummary(latestInsight);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-indigo-100/50 bg-white/40 p-5 shadow-sm backdrop-blur-md">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-white/20" />
        <div className="relative">
          <p className="inline-flex rounded-full bg-indigo-100/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
            Resumen real
          </p>
          <h3 className="mt-3 text-lg font-bold leading-tight text-slate-900">
            {preferredName}, esto refleja tu estado clínico disponible
          </h3>
          <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
            Sin datos simulados. Si algo falta, el panel lo mostrará vacío.
          </p>
        </div>
      </section>

      {loading && (
        <PanelNotice>
          Estamos reuniendo tus datos clínicos más recientes.
        </PanelNotice>
      )}

      {!loading && error && (
        <PanelNotice tone="error">
          {error}
        </PanelNotice>
      )}

      {!loading && !error && summary && (
        <>
          <section className="grid grid-cols-3 gap-2">
            <SummaryMetric label="Agenda" value={`${summary.agenda.upcomingCount}`} />
            <SummaryMetric
              label="Señales"
              value={`${alerts.length}`}
              highlight={alerts.some((alert) => alert.severity === 'critical' || alert.severity === 'high')}
            />
            <SummaryMetric
              label="Faltantes"
              value={`${missingSections.length}`}
              highlight={missingSections.length > 0}
            />
          </section>

          {summary.priorities.length > 0 && (
            <section>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Prioridades
              </p>
              <div className="space-y-3">
                {summary.priorities.slice(0, 2).map((priority) => (
                  <Link
                    key={priority.id}
                    href={priority.href}
                    className="block rounded-xl border border-stone-200 bg-white p-4 transition hover:border-stone-300 hover:shadow-sm"
                  >
                    <p className="text-sm font-semibold text-stone-900">{priority.title}</p>
                    <p className="mt-1 text-xs leading-5 text-stone-600">{priority.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {patientFacingSummary && (
            <FactCard
              title="Resumen personalizado"
              description={patientFacingSummary}
              icon={<Sparkles className="h-4 w-4" />}
            />
          )}

          {alerts.length > 0 && (
            <section>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Señales detectadas
              </p>
              <div className="space-y-3">
                {alerts.slice(0, 3).map((alert) => (
                  <Link
                    key={alert.id}
                    href={alertHref(alert.category)}
                    className="block rounded-xl border border-stone-200 bg-white p-4 transition hover:border-stone-300 hover:shadow-sm"
                  >
                    <p className="text-sm font-semibold text-stone-900">{alert.title}</p>
                    <p className="mt-1 text-xs leading-5 text-stone-600">{alert.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <FactCard
              title="Próxima consulta"
              description={
                summary.agenda.nextAppointment
                  ? `${summary.agenda.nextAppointment.doctorName ?? 'Consulta médica'} · ${formatDateTime(summary.agenda.nextAppointment.startTime)}`
                  : 'No hay consultas próximas agendadas.'
              }
              icon={<Calendar className="h-4 w-4" />}
            />
            <FactCard
              title="Último estudio cargado"
              description={
                summary.results.latest
                  ? `${summary.results.latest.testType} · ${formatDate(summary.results.latest.testDate)}`
                  : 'Todavía no hay estudios cargados.'
              }
              icon={<TestTubeDiagonal className="h-4 w-4" />}
            />
          </section>

          {summary.priorities.length === 0 && !patientFacingSummary && alerts.length === 0 && (
            <PanelNotice>
              No hay prioridades urgentes en este momento.
            </PanelNotice>
          )}
        </>
      )}
    </div>
  );
}

function ClinicalLogPanel() {
  const [activeModal, setActiveModal] = useState<QuickActionModalKey | null>(null);

  return (
    <>
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-2xl border border-amber-100/50 bg-white/40 p-5 shadow-sm backdrop-blur-md">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50/50 to-white/20" />
          <div className="relative">
            <p className="inline-flex rounded-full bg-amber-100/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Captura rápida
            </p>
            <h3 className="mt-3 text-lg font-bold leading-tight text-slate-900">
              Registra un dato puntual sin salir del resumen
            </h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
              Para revisar detalle completo, usa historia clínica, resultados o prevención.
            </p>
          </div>
        </div>

        <ActionButton
          icon={<Activity className="h-4 w-4" />}
          label="Anotar mi presión arterial"
          description="Registra una medición de hoy."
          onClick={() => setActiveModal('blood-pressure')}
          dataTour="action-blood-pressure"
        />
        <ActionButton
          icon={<Pill className="h-4 w-4" />}
          label="Confirmar mi medicación"
          description="Guarda una toma reciente."
          onClick={() => setActiveModal('medication')}
          dataTour="action-medication"
        />
        <ActionButton
          icon={<FileText className="h-4 w-4" />}
          label="Registrar un síntoma"
          description="Documenta cómo te sientes hoy."
          onClick={() => setActiveModal('symptom')}
          dataTour="action-symptom"
        />
        <ActionButton
          icon={<TrendingUp className="h-4 w-4" />}
          label="Subir un estudio médico"
          description="Añade laboratorios o informes reales a tu perfil."
          onClick={() => setActiveModal('lab-result')}
          dataTour="action-lab-result"
        />

        <div className="flex flex-wrap gap-2 pt-2">
          {dashboardQuickCaptureLinks.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {link.contextLinkLabel}
            </Link>
          ))}
        </div>
      </div>

      <BloodPressureModal
        isOpen={activeModal === 'blood-pressure'}
        onClose={() => setActiveModal(null)}
      />
      <MedicationModal isOpen={activeModal === 'medication'} onClose={() => setActiveModal(null)} />
      <SymptomModal isOpen={activeModal === 'symptom'} onClose={() => setActiveModal(null)} />
      <LabResultModal isOpen={activeModal === 'lab-result'} onClose={() => setActiveModal(null)} />
    </>
  );
}

function MedicalContextPanel({
  summary,
  loading,
  error,
}: {
  summary: DashboardSummary | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-teal-100/50 bg-white/40 p-5 shadow-sm backdrop-blur-md">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-50/50 to-white/20" />
        <div className="relative">
          <p className="inline-flex rounded-full bg-teal-100/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-700">
            Contexto clínico
          </p>
          <h3 className="mt-3 text-lg font-bold leading-tight text-slate-900">
            Resumen operativo del paciente
          </h3>
        </div>
      </div>

      {loading && <PanelNotice>Estamos cargando tu contexto clínico.</PanelNotice>}
      {!loading && error && <PanelNotice tone="error">{error}</PanelNotice>}

      {!loading && !error && summary && (
        <>
          <section>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Signos vitales
            </p>
            {summary.observations.lastVitals ? (
              <div className="space-y-3">
                {summary.observations.lastVitals.bloodPressure && (
                  <VitalSign
                    icon={<Heart className="h-5 w-5 text-rose-500" />}
                    label="Presión arterial"
                    value={summary.observations.lastVitals.bloodPressure}
                    status={`Registrada el ${formatDate(summary.observations.lastVitals.measuredAt)}`}
                  />
                )}
                {summary.observations.lastVitals.heartRate && (
                  <VitalSign
                    icon={<Activity className="h-5 w-5 text-blue-500" />}
                    label="Frecuencia cardíaca"
                    value={`${summary.observations.lastVitals.heartRate} lpm`}
                  />
                )}
              </div>
            ) : (
              <PanelNotice>Sin signos vitales recientes registrados.</PanelNotice>
            )}
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Medicación activa
            </p>
            <div className="space-y-2">
              {summary.history.currentMedications.length > 0 ? (
                summary.history.currentMedications.map((medication) => (
                  <MedicationItem
                    key={medication.id}
                    name={`${medication.name} ${medication.dosage}`}
                    time={medication.frequency}
                    completed={false}
                  />
                ))
              ) : (
                <PanelNotice>No hay medicación activa cargada.</PanelNotice>
              )}
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Alergias declaradas
            </p>
            {summary.history.criticalAllergies.length > 0 ? (
              <div className="space-y-2">
                {summary.history.criticalAllergies.map((allergy) => (
                  <div key={allergy} className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-700" />
                      <span className="text-sm font-medium text-red-900">{allergy}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <PanelNotice>Sin alergias críticas registradas.</PanelNotice>
            )}
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Último estudio
            </p>
            {summary.results.latest ? (
              <FactCard
                title={summary.results.latest.testType}
                description={`${formatDate(summary.results.latest.testDate)} · ${
                  summary.results.latest.laboratoryName ?? 'Laboratorio no informado'
                }`}
                icon={<TestTubeDiagonal className="h-4 w-4" />}
              />
            ) : (
              <PanelNotice>Todavía no hay estudios cargados.</PanelNotice>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ChatPanel({ context }: { context: PanelContext }) {
  const title =
    context === 'video'
      ? 'El canal de mensajes aparecerá cuando la consulta tenga mensajería disponible.'
      : 'Este espacio se habilita dentro de una consulta activa.';

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-sky-100/50 bg-white/40 p-5 shadow-sm backdrop-blur-md">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-50/50 to-white/20" />
        <div className="relative">
          <p className="inline-flex rounded-full bg-sky-100/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-700">
            Conversación clínica
          </p>
          <h3 className="mt-3 text-lg font-bold leading-tight text-slate-900">
            Sin mensajes simulados
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{title}</p>
        </div>
      </div>
      <PanelNotice>
        Cuando exista un hilo real de conversación, se mostrará aquí.
      </PanelNotice>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col items-center overflow-hidden rounded-2xl border p-4 shadow-sm backdrop-blur-sm transition-all duration-300 ${
        highlight
          ? 'border-rose-200/50 bg-rose-50/40 text-rose-900'
          : 'border-slate-200/50 bg-white/40 text-slate-900 hover:bg-white/60'
      }`}
    >
      <div
        className={`absolute inset-0 bg-gradient-to-br ${
          highlight ? 'from-rose-100/30' : 'from-slate-50/30'
        } to-transparent`}
      />
      <span className="relative text-2xl font-extrabold tracking-tight">{value}</span>
      <span className="relative mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  description,
  onClick,
  dataTour,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  dataTour?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-tour={dataTour}
      className="w-full rounded-lg border border-stone-200 bg-white px-4 py-3 text-left transition hover:border-stone-400 hover:bg-stone-50"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-stone-700">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-stone-900">{label}</p>
          <p className="mt-0.5 text-xs text-stone-600">{description}</p>
        </div>
      </div>
    </button>
  );
}

function VitalSign({
  icon,
  label,
  value,
  status,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  status?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-3">
      <div>{icon}</div>
      <div className="flex-1">
        <p className="text-xs text-stone-600">{label}</p>
        <p className="text-lg font-semibold text-stone-900">{value}</p>
        {status && <p className="text-xs text-stone-600">{status}</p>}
      </div>
    </div>
  );
}

function MedicationItem({
  name,
  time,
  completed = false,
}: {
  name: string;
  time: string;
  completed?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border p-2 ${
        completed ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-2">
        {completed ? (
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600">
            <span className="text-[10px] text-white">✓</span>
          </div>
        ) : (
          <Clock className="h-4 w-4 text-amber-600" />
        )}
        <span className="text-sm text-stone-900">{name}</span>
      </div>
      <span className={`text-xs ${completed ? 'font-semibold text-emerald-700' : 'text-stone-600'}`}>
        {time}
      </span>
    </div>
  );
}

function PanelNotice({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'error';
}) {
  return (
    <div
      className={`rounded-xl border p-4 text-xs leading-5 ${
        tone === 'error'
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-stone-200 bg-stone-50 text-stone-700'
      }`}
    >
      {children}
    </div>
  );
}

function FactCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-stone-700">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-stone-900">{title}</p>
          <p className="mt-1 text-xs leading-5 text-stone-600">{description}</p>
        </div>
      </div>
    </div>
  );
}
