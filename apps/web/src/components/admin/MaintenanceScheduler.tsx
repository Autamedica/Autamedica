'use client'
import React, { useState, useEffect } from 'react';
import { Calendar, Monitor as MonitorIcon, Layout, AlertTriangle, CheckCircle2, Loader2, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ButtonAM } from '../ui/ButtonAM';
import { InputAM } from '../ui/InputAM';
import { CardAM } from '../ui/CardAM';

interface UptimeMonitor {
  id: number;
  name: string;
}

interface StatusPage {
  id: number;
  title: string;
}

export const MaintenanceScheduler: React.FC = () => {
  const [monitors, setMonitors] = useState<UptimeMonitor[]>([]);
  const [statusPages, setStatusPages] = useState<StatusPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    monitorIds: [] as number[],
    statusPageIds: [] as number[],
    start: '',
    end: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    strategy: 'single'
  });

  useEffect(() => {
    fetch('/api/admin/maintenance')
      .then(res => res.json())
      .then(data => {
        setMonitors(data.monitors || []);
        setStatusPages(data.statusPages || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Error al cargar datos de Uptime Kuma');
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al programar mantenimiento');
      }
      
      setSuccess(true);
      setForm({
        ...form,
        title: '',
        description: '',
        monitorIds: [],
        statusPageIds: [],
        start: '',
        end: ''
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-24 space-y-4">
      <Loader2 className="animate-spin text-sky-500" size={40} />
      <p className="text-gray-500 font-medium">Conectando con Uptime Kuma...</p>
    </div>
  );

  return (
    <CardAM className="max-w-4xl mx-auto overflow-hidden shadow-2xl shadow-sky-900/5">
      <div className="bg-gradient-to-br from-sky-600 via-sky-700 to-indigo-800 p-10 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="relative z-10">
          <h2 className="text-4xl font-bold mb-3 tracking-tight">Programar Mantenimiento</h2>
          <p className="text-sky-100 text-lg opacity-90 max-w-xl">
            Configura ventanas de inactividad programada para evitar falsas alertas y mantener informados a tus usuarios.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-10 space-y-10">
        {/* Info Básica */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sky-700 mb-2">
            <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
              <MonitorIcon size={18} />
            </div>
            <h3 className="font-bold text-lg">Información General</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <InputAM
              label="Título del Mantenimiento"
              placeholder="Ej: Migración de Servidor de Base de Datos"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              required
              className="bg-gray-50/50"
              icon={<MonitorIcon size={18} />}
            />
            <div className="w-full">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Estrategia de Ventana</label>
              <select 
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 h-12 text-sm focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition-all cursor-pointer"
                value={form.strategy}
                onChange={e => setForm({ ...form, strategy: e.target.value })}
              >
                <option value="single">Ventana Única (Mantenimiento Puntual)</option>
                <option value="recurring" disabled>Recurrente (Próximamente)</option>
              </select>
            </div>
          </div>

          <div className="w-full">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción Detallada (Markdown)</label>
            <textarea
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 p-4 min-h-[140px] text-sm focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition-all resize-none"
              placeholder="Explica a los usuarios qué se está realizando..."
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>

        <div className="h-px bg-gray-100"></div>

        {/* Selección de Recursos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <div className="flex items-center gap-2 text-sky-700 mb-4">
              <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                <MonitorIcon size={18} />
              </div>
              <h3 className="font-bold">Monitores Afectados</h3>
            </div>
            <div className="max-h-[250px] overflow-y-auto border border-gray-100 rounded-2xl p-5 bg-gray-50/30 space-y-3 custom-scrollbar">
              {monitors.length > 0 ? monitors.map(m => (
                <label key={m.id} className="flex items-center gap-3 p-3 hover:bg-white hover:shadow-sm border border-transparent hover:border-sky-100 rounded-xl cursor-pointer transition-all group">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500 transition-all cursor-pointer"
                      checked={form.monitorIds.includes(m.id)}
                      onChange={e => {
                        const ids = e.target.checked 
                          ? [...form.monitorIds, m.id]
                          : form.monitorIds.filter(id => id !== m.id);
                        setForm({ ...form, monitorIds: ids });
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700 group-hover:text-sky-700 transition-colors">{m.name}</span>
                </label>
              )) : (
                <p className="text-gray-400 text-sm text-center py-8">No hay monitores configurados</p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-sky-700 mb-4">
              <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                <Layout size={18} />
              </div>
              <h3 className="font-bold">Páginas de Estado</h3>
            </div>
            <div className="max-h-[250px] overflow-y-auto border border-gray-100 rounded-2xl p-5 bg-gray-50/30 space-y-3 custom-scrollbar">
              {statusPages.length > 0 ? statusPages.map(s => (
                <label key={s.id} className="flex items-center gap-3 p-3 hover:bg-white hover:shadow-sm border border-transparent hover:border-sky-100 rounded-xl cursor-pointer transition-all group">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500 transition-all cursor-pointer"
                      checked={form.statusPageIds.includes(s.id)}
                      onChange={e => {
                        const ids = e.target.checked 
                          ? [...form.statusPageIds, s.id]
                          : form.statusPageIds.filter(id => id !== s.id);
                        setForm({ ...form, statusPageIds: ids });
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700 group-hover:text-sky-700 transition-colors">{s.title}</span>
                </label>
              )) : (
                <p className="text-gray-400 text-sm text-center py-8">No hay páginas de estado configuradas</p>
              )}
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-100"></div>

        {/* Fecha y Hora */}
        <div className="bg-gray-50/50 rounded-3xl p-8 border border-gray-100 relative overflow-hidden">
          <div className="flex items-center gap-2 text-sky-700 mb-8">
            <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
              <Calendar size={18} />
            </div>
            <h3 className="font-bold text-lg">Programación Temporal</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <InputAM
              type="datetime-local"
              label="Inicio de Mantenimiento"
              value={form.start}
              onChange={e => setForm({ ...form, start: e.target.value })}
              required
              className="bg-white"
            />
            <InputAM
              type="datetime-local"
              label="Fin de Mantenimiento"
              value={form.end}
              onChange={e => setForm({ ...form, end: e.target.value })}
              required
              className="bg-white"
            />
            <div className="w-full">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Zona Horaria</label>
              <div className="flex items-center gap-3 px-4 h-12 rounded-xl bg-white border border-gray-100 text-gray-500 text-sm font-medium shadow-sm">
                <Globe size={18} className="text-gray-400" />
                {form.timezone}
              </div>
            </div>
          </div>
        </div>

        {/* Mensajes de Feedback */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-5 bg-red-50 border border-red-100 text-red-700 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <p className="font-bold text-sm">Error al programar</p>
                  <p className="text-sm opacity-90">{error}</p>
                </div>
              </div>
            </motion.div>
          )}
          {success && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-5 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={22} className="text-emerald-600" />
                </div>
                <div>
                  <p className="font-bold text-sm">¡Operación exitosa!</p>
                  <p className="text-sm opacity-90">El mantenimiento ha sido programado y notificado en los servicios seleccionados.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex justify-end pt-6">
          <ButtonAM 
            type="submit" 
            loading={submitting}
            size="lg"
            className="px-12 h-14 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-2xl transition-all shadow-xl shadow-sky-600/25 active:scale-95"
          >
            Programar Mantenimiento
          </ButtonAM>
        </div>
      </form>
      
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </CardAM>
  );
};
