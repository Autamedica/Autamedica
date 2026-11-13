import React, { useEffect, useState } from "react";
import {
  Activity,
  CalendarCheck,
  Database,
  Mail,
  RefreshCw,
  Route,
  Send,
  Target,
  TrendingUp,
  Users,
  DollarSign,
  BarChart3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface GrowthData {
  summary: {
    period_days: number;
    total_leads: number;
    leads_by_vertical: Record<string, number>;
    leads_by_utm_source: Record<string, number>;
    leads_by_day: Array<{ date: string; count: number }>;
    emails_sent: number;
    emails_by_type: Record<string, number>;
    conversions: {
      lead_to_appointment: number;
      lead_to_revenue: number;
      total_revenue: number;
    };
  };
  supabase_signups?: {
    source: string;
    profiles_created: number;
    newsletter_subscribed: number;
    reconciliation?: {
      profiles_checked: number;
      matched_profiles: number;
      unmatched_profiles: number;
      profiles_without_email: number;
    };
    recent_profiles: Array<{
      user_id: string;
      growth_lead_match?: "matched" | "unmatched" | "missing_email" | "unknown";
      email: string | null;
      role: string | null;
      newsletter_subscribed: boolean | null;
      created_at: string;
    }>;
  };
  recent_leads: Array<{
    id: string;
    email: string;
    name: string | null;
    vertical: string;
    intent: string | null;
    first_utm_source: string | null;
    first_utm_medium?: string | null;
    first_utm_campaign?: string | null;
    status: string;
    created_at: string;
  }>;
  email_jobs: Array<{
    id: string;
    job_type: string;
    recipient_email: string;
    status: string;
    sent_at: string | null;
    created_at?: string | null;
  }>;
  nurturing_sequences: Array<{
    id: string;
    name: string;
    vertical: string | null;
    enabled: boolean;
  }>;
  resend?: {
    sent_events: number;
    delivered_events: number;
    clicked_events: number;
    last_event_at: string | null;
  };
  newsletter?: {
    source: string;
    sent_broadcasts: number;
    failed_broadcasts: number;
    draft_broadcasts: number;
    sent_emails: number;
    delivered_emails: number;
    bounced_emails: number;
    delayed_emails: number;
    opened_emails: number;
    clicked_emails: number;
    last_event_at: string | null;
    last_sent_at: string | null;
    resend_events: Record<string, number>;
    recent_editions: Array<{
      id: string;
      edition_date: string;
      subject: string;
      status: string;
      provider: string | null;
      provider_message_id: string | null;
      sent_at: string | null;
      error_message: string | null;
      created_at: string;
    }>;
  };
  attribution: Array<{
    lead_id: string;
    lead_email: string;
    vertical: string | null;
    first_utm_source: string | null;
    converted_to_appointment: boolean;
    converted_to_revenue: boolean;
    payment_amount: number | null;
    hours_to_appointment: number | null;
  }>;
  cac?: {
    stats: Array<{
      source: string;
      leads: number;
      appointments: number;
      revenue: number;
      spend: number;
      cac: number;
      cac_per_appointment: number;
      margin: number;
      roas: number;
    }>;
    total_spend: number;
    total_revenue: number;
    total_margin: number;
    spend_rows: number;
    spend_source: string;
  };
}

interface GrowthDashboardUIProps {
  devBypass?: boolean;
}

export const GrowthDashboardUI: React.FC<GrowthDashboardUIProps> = ({
  devBypass = false,
}) => {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [refreshTick, setRefreshTick] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const devParam = devBypass ? "&dev_admin=1" : "";
        const [dashRes, cacRes] = await Promise.all([
          fetch(`/api/admin/growth-dashboard?days=${days}${devParam}`),
          fetch(`/api/admin/growth-cac?days=${days}${devParam}`),
        ]);

        if (!dashRes.ok)
          throw new Error("No se pudieron cargar las metricas de growth");

        const dashJson = await dashRes.json();
        let cacJson: GrowthData["cac"];
        if (cacRes.ok) {
          cacJson = await cacRes.json();
        }

        setData({ ...dashJson, ...(cacJson ? { cac: cacJson } : {}) });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [days, devBypass, refreshTick]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => {
      setRefreshTick((tick) => tick + 1);
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [autoRefresh]);

  if (loading && !data)
    return (
      <div className="p-8 text-center text-gray-500">
        Cargando métricas de crecimiento...
      </div>
    );
  if (error)
    return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  if (!data) return null;

  const {
    summary,
    supabase_signups,
    recent_leads,
    email_jobs,
    nurturing_sequences,
    attribution,
    newsletter,
    resend,
    cac,
  } = data;
  const totalLeads = summary.total_leads || 0;
  const emailStatusCounts = countBy(
    email_jobs,
    (job) => job.status || "unknown",
  );
  const pendingEmailJobs =
    (emailStatusCounts.pending || 0) + (emailStatusCounts.queued || 0);
  const failedEmailJobs = emailStatusCounts.failed || 0;
  const resendSent = newsletter?.sent_emails ?? 0;
  const resendDelivered = newsletter?.delivered_emails ?? 0;
  const resendBounced = newsletter?.bounced_emails ?? 0;
  const resendDelayed = newsletter?.delayed_emails ?? 0;
  const resendOpened = newsletter?.opened_emails ?? 0;
  const resendClicked = newsletter?.clicked_emails ?? 0;
  const reconciliation = supabase_signups?.reconciliation;
  const profileLeadGap = reconciliation?.unmatched_profiles;
  const lastNewsletterEvent = newsletter?.last_event_at
    ? formatDateTime(newsletter.last_event_at)
    : "sin eventos";
  const lastNewsletterSent = newsletter?.last_sent_at
    ? formatDateTime(newsletter.last_sent_at)
    : "sin envíos";
  const hasAdSpend = Boolean(cac?.spend_rows && cac.spend_rows > 0);
  const hasRecentVerifiedNewsletter = Boolean(newsletter?.last_event_at);
  const recentProfiles = supabase_signups?.recent_profiles ?? [];
  const unsyncedProfiles = recentProfiles.filter(
    (profile) => profile.growth_lead_match === "unmatched",
  );
  const roleCounts = countBy(
    recentProfiles,
    (profile) => profile.role || "unknown",
  );
  const dataHealthItems = [
    {
      label: "Supabase → Growth OS",
      status: reconciliation && profileLeadGap === 0 && reconciliation.profiles_without_email === 0 ? "ok" : "warning",
      value: profileLeadGap === undefined ? "sin verificar" : `${profileLeadGap} sin correspondencia`,
      detail: reconciliation
        ? `${reconciliation.profiles_checked} perfiles comparados por correo · ${reconciliation.profiles_without_email} sin correo`
        : "Comparación de identidad no disponible",
    },
    {
      label: "Email Resend (todos)",
      status: (resend?.delivered_events ?? 0) > 0 ? "ok" : "warning",
      value: resend ? `${resend.delivered_events} eventos de entrega` : "sin verificar",
      detail: resend
        ? `${resend.sent_events} de envío · ${resend.clicked_events} de clic`
        : "Actividad de correo no disponible",
    },
    {
      label: "Newsletter Resend",
      status: hasRecentVerifiedNewsletter ? "ok" : "warning",
      value: `${resendDelivered} delivered`,
      detail: `último evento: ${lastNewsletterEvent}`,
    },
    {
      label: "Ediciones newsletter",
      status: (newsletter?.failed_broadcasts ?? 0) > 0 ? "danger" : "ok",
      value: `${newsletter?.failed_broadcasts ?? 0} fallos`,
      detail: `último envío: ${lastNewsletterSent}`,
    },
    {
      label: "Gasto publicitario (sin CAC verificado)",
      status: hasAdSpend ? "ok" : "warning",
      value: hasAdSpend ? `${cac?.spend_rows ?? 0} registros de gasto` : "sin costes registrados",
      detail: hasAdSpend
        ? "Pendiente de conciliación por moneda y canal"
        : "growth_os.ad_spend vacío",
    },
  ];
  const activeSequences = nurturing_sequences.filter(
    (sequence) => sequence.enabled,
  );
  const attributionAppointments = attribution.filter(
    (item) => item.converted_to_appointment,
  ).length;
  const attributionPaymentCount = attribution.filter((item) => item.converted_to_revenue).length;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
            AutaMedica Growth OS
          </p>
          <h2 className="mt-1 text-2xl font-bold text-gray-950">
            Monitoreo real de Growth OS
          </h2>
          <p className="text-sm text-gray-500">
            Lectura conservadora: los leads son registros internos de Growth OS;
            newsletter usa eventos verificados de Resend.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh((enabled) => !enabled)}
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium shadow-sm transition ${autoRefresh ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-gray-300 bg-white text-gray-700"}`}
          >
            Auto-refresh {autoRefresh ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setRefreshTick((tick) => tick + 1)}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-cyan-500 hover:text-cyan-700 disabled:opacity-60"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
          <select
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-600"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Data Health
            </p>
            <h3 className="text-xl font-bold text-gray-950">
              Integridad del funnel
            </h3>
            <p className="text-sm text-gray-500">
              Primero verificamos fuentes. Después interpretamos adquisición.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            Auto-refresh cada 30s
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dataHealthItems.map((item) => (
            <DataHealthCard key={item.label} {...item} />
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        <strong>Nota de integridad:</strong> Supabase tiene registros reales en{" "}
        <code>public.profiles</code>, pero Growth OS solo ve{" "}
        <code>growth_os.leads</code>. Los leads no deben leerse como adquisición
        real sin atribución verificable. La correspondencia por correo no
        demuestra adquisición ni consentimiento para comunicaciones.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Registros Supabase"
          value={supabase_signups?.profiles_created ?? 0}
          subValue={`${supabase_signups?.newsletter_subscribed ?? 0} newsletter true · public.profiles`}
          icon={Users}
          tone="cyan"
        />
        <StatCard
          title="Newsletter enviados"
          value={resendSent}
          subValue={`${resendDelivered} delivered · ${resendBounced} bounced`}
          icon={Mail}
          tone="slate"
        />
        <StatCard
          title="Newsletter entregados"
          value={resendDelivered}
          subValue={`${resendDelayed} delayed · ${resendOpened} opened · ${resendClicked} clicked`}
          icon={CalendarCheck}
          tone="amber"
        />
        <StatCard
          title="Leads Growth OS"
          value={summary.total_leads}
          subValue={`activos internos · últimos ${days} días · filtrando test`}
          icon={TrendingUp}
          tone="emerald"
        />
      </div>

      {cac && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">
                Inversión registrada
              </span>
              <DollarSign className="h-5 w-5 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-white">
              {cac.spend_rows} registros
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {cac.spend_rows > 0
                ? `${cac.spend_rows} registros en ${cac.spend_source}`
                : "Sin spend cargado en ad_spend"}
            </div>
          </div>
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">
                Margen de contribución
              </span>
              <BarChart3 className="h-5 w-5 text-emerald-500" />
            </div>
            <div
              className="text-2xl font-bold text-slate-300"
            >
              No calculable
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Faltan honorarios, comisiones, pasarela y conciliación de monedas
            </div>
          </div>
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">
                CAC por paciente pagador
              </span>
              <Target className="h-5 w-5 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              No calculable
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Los leads no equivalen a pacientes pagadores
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <DistributionCard
          title="Leads por vertical"
          icon={Target}
          entries={summary.leads_by_vertical}
          total={totalLeads}
          barClassName="bg-cyan-600"
          emptyText="Todavia no hay verticales con leads."
        />
        <DistributionCard
          title="Origen declarado en Growth OS"
          icon={Route}
          entries={summary.leads_by_utm_source}
          total={totalLeads}
          barClassName="bg-slate-800"
          emptyText="No hay fuentes UTM verificadas en Growth OS para este periodo."
        />
        <DistributionCard
          title="Eventos Resend verificados"
          icon={Send}
          entries={newsletter?.resend_events ?? {}}
          total={Object.values(newsletter?.resend_events ?? {}).reduce(
            (sum, value) => sum + value,
            0,
          )}
          barClassName="bg-amber-500"
          emptyText="Todavia no hay eventos verificados de Resend en este periodo."
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-6">
            <h3 className="font-bold text-gray-950">
              Registros Supabase recientes
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Fuente: public.profiles. Esto es actividad real de registro, no
              Growth OS.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-3">
            <MiniMetric
              label="Perfiles recientes"
              value={recentProfiles.length}
            />
            <MiniMetric
              label="Sin correspondencia (período)"
              value={profileLeadGap ?? "Sin verificar"}
              danger={(profileLeadGap ?? 0) > 0}
            />
            <MiniMetric
              label="Newsletter true"
              value={supabase_signups?.newsletter_subscribed ?? 0}
            />
          </div>
          <div className="border-t border-gray-100 px-6 pb-6">
            <DistributionCard
              title="Registros por rol"
              icon={Users}
              entries={roleCounts}
              total={recentProfiles.length}
              barClassName="bg-cyan-600"
              emptyText="No hay registros recientes en Supabase."
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-950">Perfiles sin correspondencia</h3>
              <p className="text-sm text-gray-500">
                Muestra reciente sin coincidencia de correo en todos los leads.
              </p>
            </div>
            <Database className="h-5 w-5 text-amber-600" />
          </div>
          <div className="space-y-2 max-h-80 overflow-auto pr-1">
            {unsyncedProfiles.slice(0, 12).map((profile) => (
              <div
                key={profile.user_id}
                className="rounded-lg bg-amber-50 px-3 py-2 text-sm"
              >
                <div className="truncate font-medium text-gray-900">
                  {profile.email || "sin email"}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-amber-800">
                  <span>{profile.role || "unknown"}</span>
                  <span>
                    {new Date(profile.created_at).toLocaleDateString("es-AR")}
                  </span>
                </div>
              </div>
            ))}
            {unsyncedProfiles.length === 0 && (
              <EmptyLine text="No hay perfiles sin correspondencia en esta muestra reciente." />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-6">
            <h3 className="font-bold text-gray-950">Embudo comprobado</h3>
            <p className="mt-1 text-sm text-gray-500">
              Lo que ya podemos medir desde lead hasta pago atribuido.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-4">
            <PipelineStep
              label="Lead"
              value={totalLeads}
              detail="registro interno, no fuente externa verificada"
              active
            />
            <PipelineStep
              label="Email"
              value={summary.emails_sent}
              detail={`${failedEmailJobs} fallidos`}
              active={summary.emails_sent > 0}
            />
            <PipelineStep
              label="Turno"
              value={summary.conversions.lead_to_appointment}
              detail={`${attributionAppointments} via vista atribucion`}
              active={summary.conversions.lead_to_appointment > 0}
            />
            <PipelineStep
              label="Leads con pago"
              value={attributionPaymentCount}
              detail="Vínculos reportados; importe pendiente de conciliación por moneda"
              active={attributionPaymentCount > 0}
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-950">Nurturing</h3>
              <p className="text-sm text-gray-500">
                Secuencias y cola de envios.
              </p>
            </div>
            <Activity className="h-5 w-5 text-cyan-700" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric
              label="Secuencias activas"
              value={activeSequences.length}
            />
            <MiniMetric
              label="Secuencias totales"
              value={nurturing_sequences.length}
            />
            <MiniMetric
              label="Jobs internos pendientes"
              value={pendingEmailJobs}
            />
            <MiniMetric
              label="Jobs internos fallidos"
              value={failedEmailJobs}
              danger={failedEmailJobs > 0}
            />
          </div>
          <div className="mt-5 space-y-2">
            {nurturing_sequences.slice(0, 5).map((sequence) => (
              <div
                key={sequence.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"
              >
                <span className="truncate text-gray-700">{sequence.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${sequence.enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-200 text-gray-600"}`}
                >
                  {sequence.enabled ? "activa" : "pausada"}
                </span>
              </div>
            ))}
            {nurturing_sequences.length === 0 && (
              <EmptyLine text="No hay secuencias configuradas." />
            )}
          </div>
        </div>
      </div>

      {cac && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">
              Atribución de leads por canal (no CAC validado)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium">
                <tr>
                  <th className="px-6 py-3">Canal</th>
                  <th className="px-6 py-3">Leads</th>
                  <th className="px-6 py-3">Gasto no conciliado</th>
                  <th className="px-6 py-3">CPL pendiente</th>
                  <th className="px-6 py-3">Turnos</th>
                  <th className="px-6 py-3">Ingreso no conciliado</th>
                  <th className="px-6 py-3">ROAS pendiente</th>
                  <th className="px-6 py-3">Margen pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cac.stats
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((s) => (
                    <tr
                      key={s.source}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-gray-900 capitalize">
                        {s.source}
                      </td>
                      <td className="px-6 py-4">{s.leads}</td>
                      <td className="px-6 py-4 text-gray-500">
                        Sin conciliar
                      </td>
                      <td className="px-6 py-4 font-medium text-cyan-700">
                        No conciliado
                      </td>
                      <td className="px-6 py-4">{s.appointments}</td>
                      <td className="px-6 py-4 text-emerald-700 font-medium">
                        Sin conciliar
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600"
                        >
                          No conciliado
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 text-gray-500"
                      >
                        No conciliado
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-gray-900">Leads Recientes</h3>
          <span className="text-xs font-medium bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full">
            Top 50
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 font-medium">
              <tr>
                <th className="px-6 py-3">Nombre / Email</th>
                <th className="px-6 py-3">Vertical</th>
                <th className="px-6 py-3">Source</th>
                <th className="px-6 py-3">Campaña</th>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recent_leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">
                      {lead.name || "Sin nombre"}
                    </div>
                    <div className="text-xs text-gray-500">{lead.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="capitalize px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                      {lead.vertical}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-xs">
                    {lead.first_utm_source || "direct"}
                    {lead.first_utm_medium ? (
                      <span className="text-gray-400">
                        {" "}
                        / {lead.first_utm_medium}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-xs">
                    {lead.first_utm_campaign || "-"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${lead.status === "new" ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-600"}`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-xs">
                    {new Date(lead.created_at).toLocaleDateString("es-AR")}
                  </td>
                </tr>
              ))}
              {recent_leads.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-sm text-gray-500"
                  >
                    Todavia no hay leads captados en este periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const DataHealthCard: React.FC<{
  label: string;
  status: string;
  value: string;
  detail: string;
}> = ({ label, status, value, detail }) => {
  const classes = dataHealthTone[status] ?? dataHealthTone.warning;

  return (
    <div className={`rounded-xl border p-4 ${classes.box}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${classes.badge}`}
        >
          {status}
        </span>
      </div>
      <div className={`text-xl font-bold ${classes.value}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
};

const StatCard: React.FC<{
  title: string;
  value: string | number;
  subValue: string;
  icon: LucideIcon;
  tone: "cyan" | "slate" | "amber" | "emerald";
}> = ({ title, value, subValue, icon: Icon, tone }) => (
  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
    <div className="flex justify-between items-start mb-4">
      <span className="text-gray-500 text-sm font-medium">{title}</span>
      <span className={`rounded-lg p-2 ${toneClasses[tone].soft}`}>
        <Icon className={`h-5 w-5 ${toneClasses[tone].text}`} />
      </span>
    </div>
    <div>
      <div className={`text-2xl font-bold ${toneClasses[tone].strong}`}>
        {value}
      </div>
      <div className="text-xs text-gray-400 mt-1">{subValue}</div>
    </div>
  </div>
);

const DistributionCard: React.FC<{
  title: string;
  icon: LucideIcon;
  entries: Record<string, number>;
  total: number;
  barClassName: string;
  emptyText: string;
}> = ({ title, icon: Icon, entries, total, barClassName, emptyText }) => {
  const [view, setView] = useState<'list' | 'waffle'>('list');
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const sortedEntries = Object.entries(entries || {}).sort(
    ([, a], [, b]) => b - a,
  );

  const renderWaffle = () => {
    const items = sortedEntries;
    const totalCount = items.reduce((acc, [, val]) => acc + val, 0);

    if (totalCount === 0) {
      return <EmptyLine text={emptyText} />;
    }

    // Calcular proporciones aproximadas de 100 bloques
    let remainingBlocks = 100;
    const itemsWithPercents = items.map(([name, count]) => {
      const pct = Math.floor((count / totalCount) * 100);
      remainingBlocks -= pct;
      return { name, count, pct };
    });

    if (remainingBlocks > 0) {
      const itemsWithResidues = items.map(([, count], idx) => {
        const exact = (count / totalCount) * 100;
        const diff = exact - Math.floor(exact);
        return { idx, diff };
      });
      itemsWithResidues.sort((a, b) => b.diff - a.diff);
      for (let i = 0; i < remainingBlocks; i++) {
        const itemIdx = itemsWithResidues[i % itemsWithResidues.length].idx;
        itemsWithPercents[itemIdx].pct += 1;
      }
    }

    const blocks: string[] = [];
    itemsWithPercents.forEach((item) => {
      for (let i = 0; i < item.pct; i++) {
        blocks.push(item.name);
      }
    });

    // Colores premium
    const colors = [
      'bg-cyan-500 shadow-cyan-500/20 text-cyan-500',
      'bg-indigo-500 shadow-indigo-500/20 text-indigo-500',
      'bg-emerald-500 shadow-emerald-500/20 text-emerald-500',
      'bg-amber-500 shadow-amber-500/20 text-amber-500',
      'bg-rose-500 shadow-rose-500/20 text-rose-500',
      'bg-purple-500 shadow-purple-500/20 text-purple-500',
      'bg-slate-500 shadow-slate-500/20 text-slate-500',
    ];

    const colorMap: Record<string, string> = {};
    items.forEach(([name], idx) => {
      colorMap[name] = colors[idx % colors.length];
    });

    return (
      <div className="space-y-4 select-none">
        <div className="flex flex-wrap gap-1 justify-center py-1 border-b border-slate-100 pb-3">
          {items.map(([name, count]) => {
            const pct = Math.round((count / totalCount) * 100);
            const colorClass = colorMap[name].split(' ')[0];
            return (
              <div
                key={name}
                onMouseEnter={() => setHoveredItem(name)}
                onMouseLeave={() => setHoveredItem(null)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold transition cursor-default ${
                  hoveredItem === name ? 'bg-slate-100 scale-105 shadow-xs' : 'bg-slate-50'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${colorClass}`} />
                <span className="text-slate-600 truncate max-w-[80px]">{humanize(name)}</span>
                <span className="text-slate-400 font-mono">({pct}%)</span>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center">
          <div className="grid grid-cols-10 gap-0.5 p-1 bg-slate-50 rounded-lg border border-slate-200/60 shadow-inner w-fit">
            {blocks.map((name, idx) => {
              const isDimmed = hoveredItem !== null && hoveredItem !== name;
              const colorClass = colorMap[name];
              
              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredItem(name)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`h-3 w-3 rounded-xs transition-all duration-300 ease-out cursor-help shadow-xs relative group/block ${colorClass} ${
                    isDimmed ? 'opacity-20 scale-90 blur-[0.2px]' : 'opacity-100 scale-100'
                  }`}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 hidden group-hover/block:flex flex-col items-center z-20 pointer-events-none transition-all animate-fade-in whitespace-nowrap">
                    <div className="bg-slate-900 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg border border-slate-800 flex items-center gap-1 font-mono">
                      <span className={`h-1 w-1 rounded-full ${colorClass.split(' ')[0]}`} />
                      {humanize(name)} (Bloque #{idx + 1})
                    </div>
                    <div className="w-1 h-1 bg-slate-900 rotate-45 -mt-0.5 border-r border-b border-slate-800" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
          {title}
        </h3>
        
        <div className="flex items-center gap-2">
          {/* View Selector Tabs */}
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-[9px] font-medium shrink-0">
            <button
              onClick={() => setView('list')}
              className={`rounded-md px-1.5 py-0.5 transition ${
                view === 'list'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Lista
            </button>
            <button
              onClick={() => setView('waffle')}
              className={`rounded-md px-1.5 py-0.5 transition ${
                view === 'waffle'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Waffle
            </button>
          </div>
          <Icon className="h-4 w-4 text-gray-400" />
        </div>
      </div>

      {view === 'waffle' ? (
        <div className="my-auto">
          {renderWaffle()}
        </div>
      ) : (
        <div className="space-y-4">
          {sortedEntries.map(([label, count]) => (
            <div key={label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="capitalize text-gray-600">
                  {humanize(label)}
                </span>
                <span className="font-medium text-gray-900">{count}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`${barClassName} h-2 rounded-full`}
                  style={{ width: `${percentage(count, total)}%` }}
                />
              </div>
            </div>
          ))}
          {sortedEntries.length === 0 && <EmptyLine text={emptyText} />}
        </div>
      )}
    </div>
  );
};

const PipelineStep: React.FC<{
  label: string;
  value: string | number;
  detail: string;
  active: boolean;
}> = ({ label, value, detail, active }) => (
  <div
    className={`rounded-xl border p-4 ${active ? "border-cyan-200 bg-cyan-50/70" : "border-gray-200 bg-gray-50"}`}
  >
    <div className="flex items-center gap-2">
      <span
        className={`h-2.5 w-2.5 rounded-full ${active ? "bg-cyan-600" : "bg-gray-300"}`}
      />
      <span className="text-sm font-semibold text-gray-700">{label}</span>
    </div>
    <div className="mt-4 text-2xl font-bold text-gray-950">{value}</div>
    <div className="mt-1 text-xs text-gray-500">{detail}</div>
  </div>
);

const MiniMetric: React.FC<{
  label: string;
  value: string | number;
  danger?: boolean;
}> = ({ label, value, danger = false }) => (
  <div
    className={`rounded-lg border p-3 ${danger ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}
  >
    <div
      className={`text-xl font-bold ${danger ? "text-red-700" : "text-gray-950"}`}
    >
      {value}
    </div>
    <div className="mt-1 text-xs text-gray-500">{label}</div>
  </div>
);

const EmptyLine: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">
    <Database className="mx-auto mb-2 h-4 w-4 text-gray-400" />
    {text}
  </div>
);

const dataHealthTone: Record<
  string,
  { box: string; badge: string; value: string }
> = {
  ok: {
    box: "border-emerald-200 bg-emerald-50/70",
    badge: "bg-emerald-100 text-emerald-700",
    value: "text-emerald-800",
  },
  warning: {
    box: "border-amber-200 bg-amber-50/80",
    badge: "bg-amber-100 text-amber-800",
    value: "text-amber-900",
  },
  danger: {
    box: "border-red-200 bg-red-50/80",
    badge: "bg-red-100 text-red-700",
    value: "text-red-800",
  },
};

const toneClasses = {
  cyan: { soft: "bg-cyan-50", text: "text-cyan-700", strong: "text-cyan-700" },
  slate: {
    soft: "bg-slate-100",
    text: "text-slate-700",
    strong: "text-gray-950",
  },
  amber: {
    soft: "bg-amber-50",
    text: "text-amber-700",
    strong: "text-amber-700",
  },
  emerald: {
    soft: "bg-emerald-50",
    text: "text-emerald-700",
    strong: "text-emerald-700",
  },
} as const;

function countBy<T>(
  items: T[],
  mapper: (item: T) => string,
): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = mapper(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function percentage(value: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

