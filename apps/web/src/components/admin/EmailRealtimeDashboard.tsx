'use client'

import { useEffect, useState, useMemo } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase-browser';

const MAX_EMAIL_EVENTS_ROWS = 50000;

interface EmailEventLog {
  created_at: string;
  email: string;
  event_type: string;
  subject: string | null;
}

interface ChartBucket {
  time: string;
  entregados: number;
  abiertos: number;
  clics: number;
}

interface TopLead {
  email: string;
  opens: number;
  clicks: number;
  delivered: number;
  bounced: number;
  total: number;
  score: number;
  lastEventAt: string;
  lastSubject: string | null;
}

interface EmailEventsClient {
  from(relation: 'email_events_log'): {
    select(columns: string): {
      gte(column: string, value: string): {
        order(column: string, options: { ascending: boolean }): Promise<{ data: EmailEventLog[] | null }>;
      };
      order(column: string, options: { ascending: boolean }): {
        range(from: number, to: number): Promise<{ data: EmailEventLog[] | null }>;
      };
    };
  };
}

export function EmailRealtimeDashboard() {
  const [supabase, setSupabase] = useState<ReturnType<typeof getBrowserSupabaseClient> | null>(null);
  const [events, setEvents] = useState<EmailEventLog[]>([]);
  const [stats, setStats] = useState({ delivered: 0, opened: 0, clicks: 0, bounced: 0 });
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const client = getBrowserSupabaseClient();
    setSupabase(client);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const emailEventsClient = supabase as unknown as EmailEventsClient;

    const fetchInitialData = async () => {
      try {
        setFetchError(null);
        const data = await fetchAllEmailEvents(emailEventsClient);
        
        setEvents(data);
        updateStats(data);
      } catch (error) {
        setFetchError('No se pudieron cargar los eventos históricos de email.');
        console.error('[EmailRealtimeDashboard] Failed to fetch email events', error);
      }
    };
    
    void fetchInitialData();

    const channel = supabase.channel('realtime_emails')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'email_events_log' },
        (payload: { new: EmailEventLog }) => {
          setEvents((current) => {
            const nuevos = [...current, payload.new];
            updateStats(nuevos);
            return nuevos;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const updateStats = (data: EmailEventLog[]) => {
    const s = { delivered: 0, opened: 0, clicks: 0, bounced: 0 };
    if (!Array.isArray(data)) return;
    data.forEach(e => {
      if (!e?.event_type) return;
      const eventType = normalizeEmailEventType(e.event_type);
      if (eventType === 'delivered') s.delivered++;
      if (eventType === 'opened') s.opened++;
      if (eventType === 'click') s.clicks++;
      if (eventType === 'bounced') s.bounced++;
    });
    setStats(s);
  };

  const recentEvents = useMemo(() => {
    const unaHoraAtras = Date.now() - 60 * 60 * 1000;
    if (!Array.isArray(events)) return [];
    return events.filter((event) => {
      if (!event?.created_at) return false;
      const t = new Date(event.created_at).getTime();
      return !isNaN(t) && t >= unaHoraAtras;
    });
  }, [events]);

  const chartData = useMemo(() => {
    const grouped: Record<string, ChartBucket> = {};
    if (!Array.isArray(recentEvents)) return [];
    recentEvents.forEach(e => {
      if (!e?.created_at || !e?.event_type) return;
      const date = new Date(e.created_at);
      if (isNaN(date.getTime())) return;
      const min = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (!grouped[min]) grouped[min] = { time: min, entregados: 0, abiertos: 0, clics: 0 };
      
      const eventType = normalizeEmailEventType(e.event_type);
      if (eventType === 'delivered') grouped[min].entregados++;
      if (eventType === 'opened') grouped[min].abiertos++;
      if (eventType === 'click') grouped[min].clics++;
    });
    return Object.values(grouped);
  }, [recentEvents]);
  const chartMax = Math.max(
    1,
    ...chartData.map((bucket) => bucket.entregados + bucket.abiertos + bucket.clics),
  );
  const topLeads = useMemo(() => calculateTopLeads(events), [events]);

  if (!supabase) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-6 space-y-6 animate-pulse">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <div className="h-5 bg-stone-200 rounded w-48 mb-2" />
            <div className="h-3 bg-stone-100 rounded w-96" />
          </div>
          <div className="h-8 bg-stone-200 rounded w-24" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="h-20 bg-stone-50 rounded-lg border border-stone-100" />
          <div className="h-20 bg-stone-50 rounded-lg border border-stone-100" />
          <div className="h-20 bg-stone-50 rounded-lg border border-stone-100" />
          <div className="h-20 bg-stone-50 rounded-lg border border-stone-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-800">Tiempo real (API Interna)</h2>
        <p className="text-sm text-stone-500">Histórico importado + eventos sincronizados instantáneamente desde Brevo Webhooks</p>
      </div>

      {fetchError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-4">
        <StatBox label="Entregado" value={stats.delivered} color="text-blue-600" />
        <StatBox label="Aperturas" value={stats.opened} color="text-green-500" />
        <StatBox label="Clics" value={stats.clicks} color="text-purple-600" />
        <StatBox label="Rebotados" value={stats.bounced} color="text-red-500" />
      </div>

      <div className="h-72 mt-8">
        <div className="flex h-full items-end gap-2 border-b border-l border-stone-200 px-3 pb-6">
          {chartData.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-stone-400">
              Sin eventos recientes
            </div>
          ) : chartData.map((bucket) => {
            const total = bucket.entregados + bucket.abiertos + bucket.clics;
            const height = Math.max(8, Math.round((total / chartMax) * 220));

            return (
              <div key={bucket.time} className="flex min-w-8 flex-1 flex-col items-center gap-2">
                <div className="flex w-full max-w-12 flex-col justify-end overflow-hidden rounded-t bg-stone-100" style={{ height }}>
                  <div className="bg-purple-600" style={{ height: `${(bucket.clics / Math.max(1, total)) * 100}%` }} />
                  <div className="bg-green-500" style={{ height: `${(bucket.abiertos / Math.max(1, total)) * 100}%` }} />
                  <div className="bg-blue-600" style={{ height: `${(bucket.entregados / Math.max(1, total)) * 100}%` }} />
                </div>
                <span className="text-[10px] text-stone-400">{bucket.time}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-stone-500">
          <LegendItem color="bg-blue-600" label="Entregados" />
          <LegendItem color="bg-green-500" label="Abiertos" />
          <LegendItem color="bg-purple-600" label="Clics" />
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-stone-200">
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 bg-stone-50 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-800">Top Leads / Mayor Interés</h3>
            <p className="text-xs text-stone-500">Ranking por aperturas y clics acumulados en todo el historial disponible.</p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-stone-600">
            Top 10
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-xs font-semibold uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3 text-right">Aperturas</th>
                <th className="px-4 py-3 text-right">Clics</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3">Última interacción</th>
                <th className="px-4 py-3">Último asunto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {topLeads.map((lead) => (
                <tr key={lead.email} className="hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-stone-900">{lead.email}</div>
                    <div className="text-xs text-stone-500">
                      {lead.delivered} entregados · {lead.bounced} rebotados · {lead.total} eventos
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600">{lead.opens}</td>
                  <td className="px-4 py-3 text-right font-semibold text-purple-600">{lead.clicks}</td>
                  <td className="px-4 py-3 text-right font-semibold text-stone-900">{lead.score}</td>
                  <td className="px-4 py-3 text-xs text-stone-500">{formatDateTime(lead.lastEventAt)}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-stone-600">{lead.lastSubject || '-'}</td>
                </tr>
              ))}
              {topLeads.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-stone-500">
                    Todavía no hay aperturas o clics para rankear.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-stone-800 mb-4">Últimos eventos</h3>
        <div className="space-y-2">
          {events.slice(-5).reverse().filter(e => e?.email && e?.created_at).map((e) => (
            <div key={`${e.created_at}-${e.event_type ?? ''}-${e.email}`} className="text-xs flex justify-between border-b pb-2">
               <span className="font-mono text-stone-500">{new Date(e.created_at).toLocaleTimeString()}</span>
               <span className="font-medium">{e.email}</span>
               <span className="uppercase tracking-wider text-[10px] bg-stone-100 px-2 py-1 rounded">{e.event_type ?? 'other'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function fetchAllEmailEvents(emailEventsClient: EmailEventsClient): Promise<EmailEventLog[]> {
  const pageSize = 1000;
  const allEvents: EmailEventLog[] = [];

  for (let from = 0; ; from += pageSize) {
    if (allEvents.length >= MAX_EMAIL_EVENTS_ROWS) break;
    const { data } = await emailEventsClient
      .from('email_events_log')
      .select('created_at,email,event_type,subject')
      .order('created_at', { ascending: true })
      .range(from, Math.min(from + pageSize - 1, MAX_EMAIL_EVENTS_ROWS - 1));

    if (!Array.isArray(data) || data.length === 0) break;
    allEvents.push(...data);
    if (data.length < pageSize) break;
  }

  return allEvents;
}

function calculateTopLeads(events: EmailEventLog[]): TopLead[] {
  const leads = new Map<string, TopLead>();
  if (!Array.isArray(events)) return [];

  events.forEach((event) => {
    if (!event?.email || !event?.event_type || !event?.created_at) return;
    const email = event.email.toLowerCase();
    const eventType = normalizeEmailEventType(event.event_type);
    const current = leads.get(email) ?? {
      email,
      opens: 0,
      clicks: 0,
      delivered: 0,
      bounced: 0,
      total: 0,
      score: 0,
      lastEventAt: event.created_at,
      lastSubject: event.subject,
    };

    current.total += 1;
    if (eventType === 'opened') current.opens += 1;
    if (eventType === 'click') current.clicks += 1;
    if (eventType === 'delivered') current.delivered += 1;
    if (eventType === 'bounced') current.bounced += 1;
    
    const eventTime = new Date(event.created_at).getTime();
    const currentTime = new Date(current.lastEventAt).getTime();
    if (!isNaN(eventTime) && (isNaN(currentTime) || eventTime >= currentTime)) {
      current.lastEventAt = event.created_at;
      current.lastSubject = event.subject;
    }
    current.score = current.opens + current.clicks * 3;
    leads.set(email, current);
  });

  return Array.from(leads.values())
    .filter((lead) => lead.opens > 0 || lead.clicks > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const rightTime = new Date(right.lastEventAt).getTime();
      const leftTime = new Date(left.lastEventAt).getTime();
      return (isNaN(rightTime) ? 0 : rightTime) - (isNaN(leftTime) ? 0 : leftTime);
    })
    .slice(0, 10);
}

function normalizeEmailEventType(eventType: string | null | undefined): 'delivered' | 'opened' | 'click' | 'bounced' | 'other' {
  if (!eventType) return 'other';
  if (eventType === 'delivered') return 'delivered';
  if (eventType === 'opened' || eventType === 'openings') return 'opened';
  if (eventType === 'click' || eventType === 'clicks') return 'click';
  if (['hard_bounce', 'soft_bounce', 'bounced', 'hardBounces', 'softBounces'].includes(eventType)) return 'bounced';
  return 'other';
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatBox({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="p-4 text-center border rounded-lg bg-stone-50">
      <div className={`text-3xl font-black ${color}`}>{value}</div>
      <div className="text-xs text-stone-500 uppercase tracking-widest mt-1">{label}</div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
