'use client'

import { useEffect, useState, useMemo } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase-browser';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export function EmailRealtimeDashboard() {
  const supabase = getBrowserSupabaseClient();
  const [events, setEvents] = useState<any[]>([]);
  const [stats, setStats] = useState({ delivered: 0, opened: 0, clicks: 0, bounced: 0 });

  useEffect(() => {
    const fetchInitialData = async () => {
      const unaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('email_events_log')
        .select('*')
        .gte('created_at', unaHoraAtras)
        .order('created_at', { ascending: true });
        
      if (data) {
        setEvents(data);
        updateStats(data);
      }
    };
    
    void fetchInitialData();

    const channel = supabase.channel('realtime_emails')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'email_events_log' },
        (payload) => {
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

  const updateStats = (data: any[]) => {
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
    const grouped: Record<string, any> = {};
    events.forEach(e => {
      const date = new Date(e.created_at);
      const min = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (!grouped[min]) grouped[min] = { time: min, Entregados: 0, Abiertos: 0, Clics: 0 };
      
      if (e.event_type === 'delivered') grouped[min].Entregados++;
      if (e.event_type === 'opened') grouped[min].Abiertos++;
      if (e.event_type === 'click') grouped[min].Clics++;
    });
    return Object.values(grouped);
  }, [events]);

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
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="time" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{fill: '#f8fafc'}} />
            <Legend />
            <Bar dataKey="Entregados" fill="#3b82f6" radius={[4,4,0,0]} />
            <Bar dataKey="Abiertos" fill="#10b981" radius={[4,4,0,0]} />
            <Bar dataKey="Clics" fill="#8b5cf6" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
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
