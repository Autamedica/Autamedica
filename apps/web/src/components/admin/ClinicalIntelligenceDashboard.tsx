import { useEffect, useState, useMemo } from 'react';
import { ApiError, fetchApi } from '@/lib/api-client';
import {
  ShieldAlert,
  Activity,
  Sparkles,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  Thermometer,
  Eye,
  Hash
} from 'lucide-react';

interface SeasonalSymptom {
  name: string;
  count: number;
  snomed: string | null;
  icd11: string | null;
}

interface AnomalyDetectionRow {
  symptom: string;
  snomed: string | null;
  last_week_count: number;
  historical_weekly_avg: number;
  percent_increase: number;
  is_outbreak_warning: boolean;
}

interface RedFlagRanking {
  name: string;
  count: number;
}

interface ClinicalIntelligenceData {
  success: boolean;
  seasonal_symptoms: Record<string, SeasonalSymptom[]>;
  red_flags_ranking: RedFlagRanking[];
  early_warning_alerts: AnomalyDetectionRow[];
  historical_anomalies: AnomalyDetectionRow[];
}

export function ClinicalIntelligenceDashboard() {
  const [data, setData] = useState<ClinicalIntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeason, setSelectedSeason] = useState<'Verano' | 'Otoño' | 'Invierno' | 'Primavera'>('Invierno');
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyDetectionRow | null>(null);
  const [redFlagsView, setRedFlagsView] = useState<'list' | 'waffle'>('waffle');
  const [hoveredRedFlag, setHoveredRedFlag] = useState<string | null>(null);

  async function fetchClinicalData() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<ClinicalIntelligenceData>('/api/admin/clinical-intelligence');
      if (!result?.success) {
        throw new Error('No se pudo procesar la respuesta de la API.');
      }
      setData(result);
      // Auto select current season based on current date if data is available
      const month = new Date().getMonth(); // 0-11
      if (month >= 11 || month <= 1) setSelectedSeason('Verano');
      else if (month >= 2 && month <= 4) setSelectedSeason('Otoño');
      else if (month >= 5 && month <= 7) setSelectedSeason('Invierno');
      else setSelectedSeason('Primavera');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Acceso denegado. Debes poseer rol de administrador médico para visualizar este módulo.'
          : err instanceof ApiError && err.status === 503
            ? 'Los datos clínicos no están disponibles. El panel no mostrará alertas hasta que la consulta real funcione.'
            : err instanceof Error
              ? err.message
              : 'Error inesperado al conectar con el servidor analítico.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchClinicalData();
  }, []);

  // Filter anomalies based on search
  const filteredAnomalies = useMemo(() => {
    if (!data?.historical_anomalies) return [];
    return data.historical_anomalies.filter((anomaly) => {
      const name = (anomaly.symptom || '').toLowerCase();
      const code = (anomaly.snomed || '').toLowerCase();
      const query = searchQuery.toLowerCase();
      return name.includes(query) || code.includes(query);
    });
  }, [data, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-6">
              <div className="h-4 w-1/3 rounded bg-slate-200"></div>
              <div className="mt-4 h-8 w-2/3 rounded bg-slate-200"></div>
              <div className="mt-2 h-4 w-1/2 rounded bg-slate-200"></div>
            </div>
          ))}
        </div>
        <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-8 h-96">
          <div className="h-6 w-1/4 rounded bg-slate-200 mb-6"></div>
          <div className="space-y-4">
            <div className="h-10 rounded bg-slate-200"></div>
            <div className="h-10 rounded bg-slate-200"></div>
            <div className="h-10 rounded bg-slate-200"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-rose-600" />
          <h3 className="font-semibold text-rose-900">Error de Acceso Analítico</h3>
        </div>
        <p className="mt-2 text-sm text-rose-700">{error}</p>
        <button
          onClick={() => void fetchClinicalData()}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition"
        >
          <RefreshCw className="h-3 w-3" /> Reintentar conexión
        </button>
      </div>
    );
  }

  const renderRedFlagsWaffle = () => {
    const items = data?.red_flags_ranking || [];
    const total = items.reduce((acc, curr) => acc + curr.count, 0);

    if (total === 0) {
      return (
        <div className="text-xs text-slate-400 py-12 text-center w-full">
          No hay datos de banderas rojas disponibles
        </div>
      );
    }

    // Calcular proporciones aproximadas
    let remainingBlocks = 100;
    const itemsWithPercents = items.map((item) => {
      const pct = Math.floor((item.count / total) * 100);
      remainingBlocks -= pct;
      return { ...item, pct };
    });

    // Distribuir el residuo a los elementos con mayor residuo de redondeo
    if (remainingBlocks > 0) {
      const itemsWithResidues = items.map((item, idx) => {
        const exact = (item.count / total) * 100;
        const diff = exact - Math.floor(exact);
        return { idx, diff };
      });
      itemsWithResidues.sort((a, b) => b.diff - a.diff);
      for (let i = 0; i < remainingBlocks; i++) {
        const itemIdx = itemsWithResidues[i % itemsWithResidues.length].idx;
        itemsWithPercents[itemIdx].pct += 1;
      }
    }

    // Construir la matriz de 100 bloques
    const blocks: string[] = [];
    itemsWithPercents.forEach((item) => {
      for (let i = 0; i < item.pct; i++) {
        blocks.push(item.name);
      }
    });

    // Mapeo de colores estéticos premium para hasta 6 categorías
    const colors = [
      'bg-rose-500 shadow-rose-500/20 text-rose-500',
      'bg-amber-500 shadow-amber-500/20 text-amber-500',
      'bg-indigo-500 shadow-indigo-500/20 text-indigo-500',
      'bg-emerald-500 shadow-emerald-500/20 text-emerald-500',
      'bg-sky-500 shadow-sky-500/20 text-sky-500',
      'bg-purple-500 shadow-purple-500/20 text-purple-500',
    ];

    const colorMap: Record<string, string> = {};
    items.forEach((item, idx) => {
      colorMap[item.name] = colors[idx % colors.length];
    });

    return (
      <div className="space-y-4 select-none">
        <div className="flex flex-wrap gap-2 justify-center py-1.5 border-b border-slate-100 pb-3">
          {items.map((item, idx) => {
            const pct = Math.round((item.count / total) * 100);
            const colorClass = colorMap[item.name].split(' ')[0];
            return (
              <div
                key={idx}
                onMouseEnter={() => setHoveredRedFlag(item.name)}
                onMouseLeave={() => setHoveredRedFlag(null)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium transition cursor-default ${
                  hoveredRedFlag === item.name ? 'bg-slate-100 scale-105 shadow-xs' : 'bg-slate-50'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${colorClass}`} />
                <span className="text-slate-600 font-semibold">{item.name}</span>
                <span className="text-slate-400 font-mono">({pct}%)</span>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center">
          <div className="grid grid-cols-10 gap-1 p-1.5 bg-slate-50 rounded-xl border border-slate-200/60 shadow-inner w-fit">
            {blocks.map((name, idx) => {
              const isDimmed = hoveredRedFlag !== null && hoveredRedFlag !== name;
              const colorClass = colorMap[name];
              
              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredRedFlag(name)}
                  onMouseLeave={() => setHoveredRedFlag(null)}
                  className={`h-4.5 w-4.5 rounded-xs transition-all duration-300 ease-out cursor-help shadow-xs relative group/block ${colorClass} ${
                    isDimmed ? 'opacity-20 scale-90 blur-[0.2px]' : 'opacity-100 scale-100'
                  }`}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 hidden group-hover/block:flex flex-col items-center z-20 pointer-events-none transition-all animate-fade-in whitespace-nowrap">
                    <div className="bg-slate-900 text-white text-[10px] font-black px-2 py-1 rounded shadow-lg border border-slate-800 flex items-center gap-1.5 font-mono">
                      <span className={`h-1.5 w-1.5 rounded-full ${colorClass.split(' ')[0]}`} />
                      {name} (Bloque #{idx + 1})
                    </div>
                    <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-1 border-r border-b border-slate-800" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  if (!data) return null;

  const seasonalRows = Object.values(data.seasonal_symptoms ?? {}).flat();
  const snomedRows = seasonalRows.filter((item) => Boolean(item.snomed));
  const snomedCoverage = seasonalRows.length > 0
    ? Math.round((snomedRows.length / seasonalRows.length) * 100)
    : null;

  return (
    <div className="space-y-8">
      {/* Metrics / KPI Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Alertas de Brote</span>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${(data?.early_warning_alerts || []).length > 0 ? 'bg-rose-50 text-rose-700 animate-pulse' : 'bg-emerald-50 text-emerald-700'}`}>
              {(data?.early_warning_alerts || []).length > 0 ? 'Alerta Activa' : 'Estable'}
            </span>
          </div>
          <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
            {(data?.early_warning_alerts || []).length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Detecciones anormales de síntomas esta semana</p>
          <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5">
            <ShieldAlert className="h-24 w-24" />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Banderas Rojas Live</span>
            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">En Proceso</span>
          </div>
          <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
            {(data?.red_flags_ranking || []).reduce((acc, curr) => acc + curr.count, 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Total de observaciones críticas reportadas</p>
          <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5">
            <Activity className="h-24 w-24" />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Cobertura SNOMED CT</span>
            <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">Cálculo real</span>
          </div>
          <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
            {snomedCoverage === null ? '—' : `${snomedCoverage}%`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {snomedRows.length} de {seasonalRows.length} síntomas listados con código SNOMED CT
          </p>
          <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5">
            <Sparkles className="h-24 w-24" />
          </div>
        </div>
      </div>

      {/* Outbreak Early Warning System */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/50 px-6 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-950 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-600" />
                Outbreak Early Warning System (Alertas Epidemiológicas)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Alertas automáticas cuando el conteo supera significativamente el promedio móvil histórico semanal.</p>
            </div>
            <button
              onClick={() => void fetchClinicalData()}
              className="inline-flex items-center gap-1.5 self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </button>
          </div>
        </div>

        <div className="p-6">
          {(data?.early_warning_alerts || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="rounded-full bg-emerald-50 p-3 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900">Estado Sanitario Normal</h4>
              <p className="mt-1 max-w-sm text-xs text-slate-500">No se detectaron desviaciones estadísticas ni brotes activos en las consultas de esta semana.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.early_warning_alerts || []).map((alert, idx) => (
                <div
                  key={idx}
                  className={`group relative overflow-hidden rounded-xl border p-5 shadow-sm transition hover:shadow-md ${
                    alert.is_outbreak_warning
                      ? 'border-rose-200 bg-rose-50/20'
                      : 'border-amber-200 bg-amber-50/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        alert.is_outbreak_warning
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {alert.is_outbreak_warning ? '⚠️ Alerta de Brote' : '⚠️ Desviación'}
                      </span>
                      <h4 className="mt-3 text-lg font-semibold text-slate-900">{alert.symptom}</h4>
                    </div>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm text-xs font-mono font-bold text-rose-600">
                      +{Math.round(alert.percent_increase)}%
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-slate-200/60 pt-3 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Semana Actual:</span>
                      <span className="font-mono font-bold text-slate-900">{alert.last_week_count} casos</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Promedio Histórico:</span>
                      <span className="font-mono text-slate-500">{alert.historical_weekly_avg} casos/sem</span>
                    </div>
                    {alert.snomed && (
                      <div className="flex justify-between items-center bg-slate-100 px-2 py-1 rounded mt-2">
                        <span className="text-[10px] text-slate-500 font-mono">SNOMED CT:</span>
                        <span className="font-mono text-[10px] font-semibold text-slate-800">{alert.snomed}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Seasonal Symptom OLAP Forecast & Red Flags */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Seasonal Symptom OLAP Forecast */}
        <section className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-950 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-600" />
                Seasonal Symptom Forecast (Proyección Estacional)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Tendencia de síntomas y prevalencia según agregación histórica de la Capa de Oro.</p>
            </div>
            
            {/* Season Selector Tabs */}
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
              {(['Verano', 'Otoño', 'Invierno', 'Primavera'] as const).map((season) => (
                <button
                  key={season}
                  onClick={() => setSelectedSeason(season)}
                  className={`rounded-md px-2.5 py-1.5 transition ${
                    selectedSeason === season
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {season}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {(data?.seasonal_symptoms?.[selectedSeason] || []).map((item, idx) => (
                <div key={idx} className="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/30 p-4 hover:border-slate-200 transition">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-slate-900 text-sm">{item.name}</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Casos Proyectados</p>
                    </div>
                    <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-mono font-bold text-indigo-700">
                      {item.count}
                    </span>
                  </div>
                  
                  <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                    {item.snomed && (
                      <div className="flex justify-between">
                        <span>SNOMED CT:</span>
                        <span className="font-mono text-slate-700">{item.snomed}</span>
                      </div>
                    )}
                    {item.icd11 && (
                      <div className="flex justify-between">
                        <span>CIE-11:</span>
                        <span className="font-mono text-slate-700">{item.icd11}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {(!data?.seasonal_symptoms?.[selectedSeason] || data.seasonal_symptoms[selectedSeason].length === 0) && (
                <p className="text-center text-sm text-slate-400 py-6 sm:col-span-2">Sin datos disponibles para esta estación.</p>
              )}
            </div>
          </div>
        </section>

        {/* Live Red Flags Tracker */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="border-b border-slate-200 bg-slate-50/50 px-6 py-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-950 flex items-center gap-2">
                <Thermometer className="h-5 w-5 text-rose-500" />
                Live Red Flags Tracker
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Síntomas marcados con bandera roja de atención prioritaria.</p>
            </div>
            
            {/* View Selector Tabs */}
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-[10px] font-medium shrink-0">
              <button
                onClick={() => setRedFlagsView('waffle')}
                className={`rounded-md px-2 py-1 transition ${
                  redFlagsView === 'waffle'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Waffle
              </button>
              <button
                onClick={() => setRedFlagsView('list')}
                className={`rounded-md px-2 py-1 transition ${
                  redFlagsView === 'list'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Lista
              </button>
            </div>
          </div>

          <div className="p-6 flex-1 flex flex-col justify-between">
            {(data?.red_flags_ranking || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center my-auto">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                <h4 className="mt-2 text-xs font-semibold text-slate-900">Ningún caso crítico reportado</h4>
              </div>
            ) : redFlagsView === 'waffle' ? (
              <div className="my-auto">
                {renderRedFlagsWaffle()}
              </div>
            ) : (
              <div className="space-y-4 my-auto">
                {(data?.red_flags_ranking || []).map((item, idx) => {
                  const maxCount = Math.max(...(data?.red_flags_ranking || []).map(r => r.count), 1);
                  const percentage = (item.count / maxCount) * 100;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-900">{item.name}</span>
                        <span className="font-mono font-bold text-rose-600">{item.count} registros</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-600"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            <div className="mt-6 border-t border-slate-100 pt-4 text-center">
              <span className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-[10px] font-semibold text-rose-700">
                🚨 Monitoreo Automatizado Triaje 24/7
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Historical Anomaly Search */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/50 px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-950 flex items-center gap-2">
              <Layers className="h-5 w-5 text-slate-600" />
              Historial de Desviaciones de Síntomas
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Listado completo de todas las anomalías y alertas computadas.</p>
          </div>

          <div className="relative rounded-md shadow-sm max-w-xs w-full">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar síntoma o código..."
              className="block w-full rounded-md border border-slate-300 bg-white py-1.5 pl-10 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-left font-semibold uppercase tracking-wider">
                <th className="px-6 py-3">Síntoma</th>
                <th className="px-6 py-3">Código SNOMED CT</th>
                <th className="px-6 py-3 text-center">Conteo Semanal</th>
                <th className="px-6 py-3 text-center">Media Histórica</th>
                <th className="px-6 py-3 text-center">Desviación</th>
                <th className="px-6 py-3 text-center">Estado</th>
                <th className="px-6 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredAnomalies.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3 font-semibold text-slate-950">{item.symptom}</td>
                  <td className="px-6 py-3 font-mono text-slate-500">{item.snomed || '-'}</td>
                  <td className="px-6 py-3 text-center font-mono font-bold text-slate-900">{item.last_week_count}</td>
                  <td className="px-6 py-3 text-center font-mono text-slate-500">{item.historical_weekly_avg}</td>
                  <td className="px-6 py-3 text-center font-mono font-bold text-rose-600">
                    +{Math.round(item.percent_increase)}%
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      item.is_outbreak_warning
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {item.is_outbreak_warning ? 'Alerta Brote' : 'Desviación'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <button
                      onClick={() => setSelectedAnomaly(item)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-900"
                    >
                      <Eye className="h-3.5 w-3.5" /> Detalle
                    </button>
                  </td>
                </tr>
              ))}
              {filteredAnomalies.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400 font-medium">
                    Sin anomalías coincidentes con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detail Slide-Over / Modal */}
      {selectedAnomaly && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-sm">
          <div className="h-full w-full max-w-md border-l border-slate-200 bg-white p-6 shadow-2xl flex flex-col justify-between animate-slide-in">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  selectedAnomaly.is_outbreak_warning
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {selectedAnomaly.is_outbreak_warning ? '⚠️ Alerta de Brote Sanitario' : '⚠️ Alerta de Desviación'}
                </span>
                <button
                  onClick={() => setSelectedAnomaly(null)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div>
                <h4 className="text-2xl font-bold tracking-tight text-slate-900">{selectedAnomaly.symptom}</h4>
                <p className="text-xs text-slate-500 mt-1">Detalle del registro y contexto de alerta epidemiológica.</p>
              </div>

              <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-xs">
                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-slate-500 font-medium">Concepto Clínico:</span>
                  <span className="font-semibold text-slate-900">{selectedAnomaly.symptom}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-slate-500 font-medium">Código SNOMED CT:</span>
                  <span className="font-mono font-semibold text-indigo-700 flex items-center gap-1">
                    <Hash className="h-3 w-3" /> {selectedAnomaly.snomed || 'No catalogado'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-slate-500 font-medium">Incremento de Casos:</span>
                  <span className="font-bold text-rose-600 font-mono">+{Math.round(selectedAnomaly.percent_increase)}%</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-slate-500 font-medium">Casos reportados esta semana:</span>
                  <span className="font-bold text-slate-900 font-mono">{selectedAnomaly.last_week_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Promedio histórico:</span>
                  <span className="font-semibold text-slate-900 font-mono">{selectedAnomaly.historical_weekly_avg} casos/semana</span>
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 text-xs text-blue-800 space-y-2">
                <h5 className="font-bold text-blue-900 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-blue-700" />
                  Protocolo de Alerta Sanitaria
                </h5>
                <p className="leading-relaxed">
                  Esta desviación estadística sugiere una aceleración atípica del síntoma en las consultas. Se recomienda informar al departamento médico, intensificar el triaje epidemiológico y validar el correcto registro de datos clínicos de videoconsultas de telemedicina.
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedAnomaly(null)}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
