import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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

export const GrowthDashboardUI: React.FC = () => {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [dashRes, cacRes] = await Promise.all([
          fetch(`/api/admin/growth-dashboard?days=${days}`),
          fetch(`/api/admin/growth-cac?days=${days}`)
        ]);

        if (!dashRes.ok) throw new Error('No se pudieron cargar las metricas de growth');
        
        const dashJson = await dashRes.json();
        let cacJson: GrowthData['cac'];
        if (cacRes.ok) {
          cacJson = await cacRes.json();
        }

        setData({ ...dashJson, ...(cacJson ? { cac: cacJson } : {}) });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [days, refreshTick]);

  if (loading && !data) return <div className="p-8 text-center text-gray-500">Cargando métricas de crecimiento...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  if (!data) return null;

  const { summary, recent_leads, email_jobs, nurturing_sequences, attribution, cac } = data;
  const totalLeads = summary.total_leads || 0;
  const emailStatusCounts = countBy(email_jobs, (job) => job.status || 'unknown');
  const pendingEmailJobs = (emailStatusCounts.pending || 0) + (emailStatusCounts.queued || 0);
  const failedEmailJobs = emailStatusCounts.failed || 0;
  const activeSequences = nurturing_sequences.filter((sequence) => sequence.enabled);
  const attributionAppointments = attribution.filter((item) => item.converted_to_appointment).length;
  const attributionRevenue = attribution
    .filter((item) => item.converted_to_revenue)
    .reduce((total, item) => total + (Number(item.payment_amount) || 0), 0);
  const appointmentRate = rate(summary.conversions.lead_to_appointment, totalLeads);
  const revenueRate = rate(summary.conversions.lead_to_revenue, totalLeads);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">AutaMedica Growth OS</p>
          <h2 className="mt-1 text-2xl font-bold text-gray-950">Captacion, CRM y revenue</h2>
          <p className="text-sm text-gray-500">Estado operativo del embudo: leads, nurturing, conversion y atribucion.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshTick((tick) => tick + 1)}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-cyan-500 hover:text-cyan-700 disabled:opacity-60"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Leads captados" value={summary.total_leads} subValue={`Ultimos ${days} dias`} icon={Users} tone="cyan" />
        <StatCard title="Emails enviados" value={summary.emails_sent} subValue={`${pendingEmailJobs} pendientes en cola`} icon={Mail} tone="slate" />
        <StatCard title="Turnos atribuidos" value={summary.conversions.lead_to_appointment} subValue={`${appointmentRate}% conversion lead -> turno`} icon={CalendarCheck} tone="amber" />
        <StatCard title="Revenue atribuido" value={money(summary.conversions.total_revenue)} subValue={`${revenueRate}% conversion lead -> pago`} icon={TrendingUp} tone="emerald" />
      </div>

      {cac && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">Inversión registrada</span>
              <DollarSign className="h-5 w-5 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-white">{money(cac.total_spend)}</div>
            <div className="text-xs text-slate-500 mt-1">
              {cac.spend_rows > 0 ? `${cac.spend_rows} registros en ${cac.spend_source}` : 'Sin spend cargado en ad_spend'}
            </div>
          </div>
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">Margen Operativo</span>
              <BarChart3 className="h-5 w-5 text-emerald-500" />
            </div>
            <div className={`text-2xl font-bold ${cac.total_margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {money(cac.total_margin)}
            </div>
            <div className="text-xs text-slate-500 mt-1">Revenue - Inversión</div>
          </div>
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">CAC Promedio</span>
              <Target className="h-5 w-5 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {money(cac.total_spend / (summary.total_leads || 1))}
            </div>
            <div className="text-xs text-slate-500 mt-1">Costo por lead adquirido</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <DistributionCard title="Leads por vertical" icon={Target} entries={summary.leads_by_vertical} total={totalLeads} barClassName="bg-cyan-600" emptyText="Todavia no hay verticales con leads." />
        <DistributionCard title="Canales de adquisicion" icon={Route} entries={summary.leads_by_utm_source} total={totalLeads} barClassName="bg-slate-800" emptyText="Falta trafico con UTM o capturas directas." />
        <DistributionCard title="Emails por tipo" icon={Send} entries={summary.emails_by_type} total={summary.emails_sent || 0} barClassName="bg-amber-500" emptyText="Todavia no hay emails enviados por nurturing." />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-6">
            <h3 className="font-bold text-gray-950">Embudo comprobado</h3>
            <p className="mt-1 text-sm text-gray-500">Lo que ya podemos medir desde lead hasta pago atribuido.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-4">
            <PipelineStep label="Lead" value={totalLeads} detail="captura + consentimiento" active />
            <PipelineStep label="Email" value={summary.emails_sent} detail={`${failedEmailJobs} fallidos`} active={summary.emails_sent > 0} />
            <PipelineStep label="Turno" value={summary.conversions.lead_to_appointment} detail={`${attributionAppointments} via vista atribucion`} active={summary.conversions.lead_to_appointment > 0} />
            <PipelineStep label="Pago" value={money(summary.conversions.total_revenue)} detail={`${money(attributionRevenue)} vista atribucion`} active={summary.conversions.total_revenue > 0} />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-950">Nurturing</h3>
              <p className="text-sm text-gray-500">Secuencias y cola de envios.</p>
            </div>
            <Activity className="h-5 w-5 text-cyan-700" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label="Secuencias activas" value={activeSequences.length} />
            <MiniMetric label="Secuencias totales" value={nurturing_sequences.length} />
            <MiniMetric label="Emails pendientes" value={pendingEmailJobs} />
            <MiniMetric label="Emails fallidos" value={failedEmailJobs} danger={failedEmailJobs > 0} />
          </div>
          <div className="mt-5 space-y-2">
            {nurturing_sequences.slice(0, 5).map((sequence) => (
              <div key={sequence.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="truncate text-gray-700">{sequence.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sequence.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                  {sequence.enabled ? 'activa' : 'pausada'}
                </span>
              </div>
            ))}
            {nurturing_sequences.length === 0 && <EmptyLine text="No hay secuencias configuradas." />}
          </div>
        </div>
      </div>

      {cac && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">Atribución CAC y ROAS por Canal</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium">
                <tr>
                  <th className="px-6 py-3">Canal</th>
                  <th className="px-6 py-3">Leads</th>
                  <th className="px-6 py-3">Inversión</th>
                  <th className="px-6 py-3">CAC (Lead)</th>
                  <th className="px-6 py-3">Turnos</th>
                  <th className="px-6 py-3">Revenue</th>
                  <th className="px-6 py-3">ROAS</th>
                  <th className="px-6 py-3">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cac.stats.sort((a,b) => b.revenue - a.revenue).map((s) => (
                  <tr key={s.source} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900 capitalize">{s.source}</td>
                    <td className="px-6 py-4">{s.leads}</td>
                    <td className="px-6 py-4 text-gray-500">{money(s.spend)}</td>
                    <td className="px-6 py-4 font-medium text-cyan-700">{money(s.cac)}</td>
                    <td className="px-6 py-4">{s.appointments}</td>
                    <td className="px-6 py-4 text-emerald-700 font-medium">{money(s.revenue)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${s.roas > 2 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                        {s.roas.toFixed(2)}x
                      </span>
                    </td>
                    <td className={`px-6 py-4 font-bold ${s.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {money(s.margin)}
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
          <span className="text-xs font-medium bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full">Top 50</span>
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
                <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{lead.name || 'Sin nombre'}</div>
                    <div className="text-xs text-gray-500">{lead.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="capitalize px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">{lead.vertical}</span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-xs">
                    {lead.first_utm_source || 'direct'}
                    {lead.first_utm_medium ? <span className="text-gray-400"> / {lead.first_utm_medium}</span> : null}
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-xs">
                    {lead.first_utm_campaign || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${lead.status === 'new' ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-xs">
                    {new Date(lead.created_at).toLocaleDateString('es-AR')}
                  </td>
                </tr>
              ))}
              {recent_leads.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">
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

const StatCard: React.FC<{ title: string; value: string | number; subValue: string; icon: LucideIcon; tone: 'cyan' | 'slate' | 'amber' | 'emerald' }> = ({ title, value, subValue, icon: Icon, tone }) => (
  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
    <div className="flex justify-between items-start mb-4">
      <span className="text-gray-500 text-sm font-medium">{title}</span>
      <span className={`rounded-lg p-2 ${toneClasses[tone].soft}`}>
        <Icon className={`h-5 w-5 ${toneClasses[tone].text}`} />
      </span>
    </div>
    <div>
      <div className={`text-2xl font-bold ${toneClasses[tone].strong}`}>{value}</div>
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
  const sortedEntries = Object.entries(entries || {}).sort(([, a], [, b]) => b - a);

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{title}</h3>
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <div className="space-y-4">
        {sortedEntries.map(([label, count]) => (
          <div key={label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="capitalize text-gray-600">{humanize(label)}</span>
              <span className="font-medium text-gray-900">{count}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`${barClassName} h-2 rounded-full`} style={{ width: `${percentage(count, total)}%` }} />
            </div>
          </div>
        ))}
        {sortedEntries.length === 0 && <EmptyLine text={emptyText} />}
      </div>
    </div>
  );
};

const PipelineStep: React.FC<{ label: string; value: string | number; detail: string; active: boolean }> = ({ label, value, detail, active }) => (
  <div className={`rounded-xl border p-4 ${active ? 'border-cyan-200 bg-cyan-50/70' : 'border-gray-200 bg-gray-50'}`}>
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-cyan-600' : 'bg-gray-300'}`} />
      <span className="text-sm font-semibold text-gray-700">{label}</span>
    </div>
    <div className="mt-4 text-2xl font-bold text-gray-950">{value}</div>
    <div className="mt-1 text-xs text-gray-500">{detail}</div>
  </div>
);

const MiniMetric: React.FC<{ label: string; value: string | number; danger?: boolean }> = ({ label, value, danger = false }) => (
  <div className={`rounded-lg border p-3 ${danger ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
    <div className={`text-xl font-bold ${danger ? 'text-red-700' : 'text-gray-950'}`}>{value}</div>
    <div className="mt-1 text-xs text-gray-500">{label}</div>
  </div>
);

const EmptyLine: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">
    <Database className="mx-auto mb-2 h-4 w-4 text-gray-400" />
    {text}
  </div>
);

const toneClasses = {
  cyan: { soft: 'bg-cyan-50', text: 'text-cyan-700', strong: 'text-cyan-700' },
  slate: { soft: 'bg-slate-100', text: 'text-slate-700', strong: 'text-gray-950' },
  amber: { soft: 'bg-amber-50', text: 'text-amber-700', strong: 'text-amber-700' },
  emerald: { soft: 'bg-emerald-50', text: 'text-emerald-700', strong: 'text-emerald-700' },
} as const;

function countBy<T>(items: T[], mapper: (item: T) => string): Record<string, number> {
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

function rate(value: number, total: number): string {
  if (!total) return '0.0';
  return ((value / total) * 100).toFixed(1);
}

function money(value: number): string {
  return `$${Number(value || 0).toLocaleString('es-AR')}`;
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ');
}
