'use client'

import { useEffect, useState, useMemo } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase-browser';

interface EmailEventLog {
  created_at: string;
  email: string;
  event_type: string;
}

interface ChartBucket {
  time: string;
  entregados: number;
  abiertos: number;
  clics: number;
}

interface EmailEventsClient {
  from(relation: 'email_events_log'): {
    select(columns: string): {
      gte(column: string, value: string): {
        order(column: string, options: { ascending: boolean }): Promise<{ data: EmailEventLog[] | null }>;
      };
    };
  };
}

export function EmailRealtimeDashboard() {
  const supabase = getBrowserSupabaseClient();
  const emailEventsClient = supabase as unknown as EmailEventsClient;
  const [events, setEvents] = useState<EmailEventLog[]>([]);
  const [stats, setStats] = useState({ delivered: 0, opened: 0, clicks: 0, bounced: 0 });

  useEffect(() => {
    const fetchInitialData = async () => {
      const unaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data } = await emailEventsClient
        .from('email_events_log')
        .select('created_at,email,event_type')
        .gte('created_at', unaHoraAtras)
        .order('created_at', { ascending: true });
        
      if (Array.isArray(data)) {
        setEvents(data);
        updateStats(data);
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
  }, [emailEventsClient, supabase]);

  const updateStats = (data: EmailEventLog[]) => {
    const s = { delivered: 0, opened: 0, clicks: 0, bounced: 0 };
    data.forEach(e => {
      if (e.event_type === 'delivered') s.delivered++;
      if (e.event_type === 'opened') s.opened++;
      if (e.event_type === 'click') s.clicks++;
      if (e.event_type === 'hard_bounce' || e.event_type === 'soft_bounce' || e.event_type === 'bounced') s.bounced++;
    });
    setStats(s);
  };

  const chartData = useMemo(() => {
    const grouped: Record<string, ChartBucket> = {};
    events.forEach(e => {
      const date = new Date(e.created_at);
      const min = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (!grouped[min]) grouped[min] = { time: min, entregados: 0, abiertos: 0, clics: 0 };
      
      if (e.event_type === 'delivered') grouped[min].entregados++;
      if (e.event_type === 'opened') grouped[min].abiertos++;
      if (e.event_type === 'click') grouped[min].clics++;
    });
    return Object.values(grouped);
  }, [events]);
  const chartMax = Math.max(
    1,
    ...chartData.map((bucket) => bucket.entregados + bucket.abiertos + bucket.clics),
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-800">Tiempo real (API Interna)</h2>
        <p className="text-sm text-stone-500">Datos sincronizados instantáneamente desde Brevo Webhooks</p>
      </div>

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
      
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-stone-800 mb-4">Últimos eventos</h3>
        <div className="space-y-2">
          {events.slice(-5).reverse().map((e, idx) => (
            <div key={idx} className="text-xs flex justify-between border-b pb-2">
               <span className="font-mono text-stone-500">{new Date(e.created_at).toLocaleTimeString()}</span>
               <span className="font-medium">{e.email}</span>
               <span className="uppercase tracking-wider text-[10px] bg-stone-100 px-2 py-1 rounded">{e.event_type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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
