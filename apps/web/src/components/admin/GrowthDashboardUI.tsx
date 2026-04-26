import React, { useEffect, useState } from 'react';

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
    status: string;
    created_at: string;
  }>;
  email_jobs: Array<{
    id: string;
    job_type: string;
    recipient_email: string;
    status: string;
    sent_at: string | null;
  }>;
}

export const GrowthDashboardUI: React.FC = () => {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/growth-dashboard?days=${days}`);
        if (!response.ok) throw new Error('Failed to fetch growth data');
        const json = await response.json();
        setData(json);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [days]);

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando métricas de crecimiento...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  if (!data) return null;

  const { summary, recent_leads, email_jobs: _email_jobs } = data;

  return (
    <div className="space-y-8 pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Growth OS</h2>
          <p className="text-sm text-gray-500">Monitoreo de leads, embudo y atribución.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Periodo:</label>
          <select 
            className="bg-white border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </div>
      </div>

      {/* High Level Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Leads" value={summary.total_leads} subValue={`En ${days} días`} icon="📈" />
        <StatCard title="Emails Enviados" value={summary.emails_sent} subValue="Nurturing + Welcome" icon="✉️" />
        <StatCard title="Turnos Agendados" value={summary.conversions.lead_to_appointment} subValue={`${((summary.conversions.lead_to_appointment / (summary.total_leads || 1)) * 100).toFixed(1)}% conversión`} icon="📅" />
        <StatCard title="Revenue Atribuido" value={`$${summary.conversions.total_revenue.toLocaleString()}`} subValue="Pagos aprobados" icon="💰" color="text-green-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Leads by Vertical */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-6">Leads por Vertical</h3>
          <div className="space-y-4">
            {Object.entries(summary.leads_by_vertical || {}).map(([vertical, count]) => (
              <div key={vertical}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="capitalize text-gray-600">{vertical}</span>
                  <span className="font-medium text-gray-900">{count}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ width: `${(count / summary.total_leads) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Leads by UTM Source */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-6">Canales de Adquisición</h3>
          <div className="space-y-4">
            {Object.entries(summary.leads_by_utm_source || {}).map(([source, count]) => (
              <div key={source}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{source}</span>
                  <span className="font-medium text-gray-900">{count}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className="bg-indigo-500 h-2 rounded-full" 
                    style={{ width: `${(count / summary.total_leads) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Emails by Type */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-6">Actividad de Email</h3>
          <div className="space-y-4">
            {Object.entries(summary.emails_by_type || {}).map(([type, count]) => (
              <div key={type}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="capitalize text-gray-600">{type.replace('_', ' ')}</span>
                  <span className="font-medium text-gray-900">{count}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className="bg-purple-500 h-2 rounded-full" 
                    style={{ width: `${(count / summary.emails_sent) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Leads Table */}
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
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      lead.status === 'new' ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'
                    }`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-xs">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string | number; subValue: string; icon: string; color?: string }> = ({ title, value, subValue, icon, color = 'text-gray-900' }) => (
  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
    <div className="flex justify-between items-start mb-4">
      <span className="text-gray-500 text-sm font-medium">{title}</span>
      <span className="text-xl">{icon}</span>
    </div>
    <div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{subValue}</div>
    </div>
  </div>
);
