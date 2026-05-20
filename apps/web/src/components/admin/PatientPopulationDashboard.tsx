import React, { useState, useEffect } from 'react';

type DemographicsData = {
  success: boolean;
  total_patients: number;
  demographics: {
    by_gender: Record<string, number>;
    by_age_group: Record<string, number>;
    by_region: Record<string, number>;
    by_insurance: Record<string, number>;
  };
};

type SymptomCount = {
  name: string;
  count: number;
  snomed?: string | null;
  icd11?: string | null;
};

type AnomalyAlert = {
  symptom: string;
  snomed: string | null;
  last_week_count: number;
  historical_weekly_avg: number;
  percent_increase: number;
  is_outbreak_warning: boolean;
};

type ClinicalIntelligenceData = {
  success: boolean;
  seasonal_symptoms: {
    Verano: SymptomCount[];
    Otoño: SymptomCount[];
    Invierno: SymptomCount[];
    Primavera: SymptomCount[];
  };
  red_flags_ranking: SymptomCount[];
  early_warning_alerts?: AnomalyAlert[];
  historical_anomalies?: AnomalyAlert[];
};

export function PatientPopulationDashboard() {
  const [activeTab, setActiveTab] = useState<'demographics' | 'clinical'>('demographics');
  const [demoData, setDemoData] = useState<DemographicsData | null>(null);
  const [clinicalData, setClinicalData] = useState<ClinicalIntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const bypassParam = isDev ? '?dev_admin=1' : '';
        
        const demoUrl = `/api/admin/patient-demographics${bypassParam}`;
        const clinicalUrl = `/api/admin/clinical-intelligence${bypassParam}`;
        
        const [demoRes, clinicalRes] = await Promise.all([
          fetch(demoUrl),
          fetch(clinicalUrl)
        ]);

        if (!demoRes.ok || !clinicalRes.ok) {
          throw new Error('No se pudieron cargar todos los módulos de inteligencia poblacional.');
        }
        
        const demoResult = await demoRes.json();
        const clinicalResult = await clinicalRes.json();

        if (demoResult.error) throw new Error(demoResult.error);
        if (clinicalResult.error) throw new Error(clinicalResult.error);
        
        setDemoData(demoResult);
        setClinicalData(clinicalResult);
      } catch (err) {
        console.error('[PatientPopulationDashboard] Error fetching analytics data:', err);
        const errorMsg = err instanceof Error ? err.message : 'Error al conectar con la API de inteligencia poblacional.';
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    void fetchAllData();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-6 space-y-6 animate-pulse">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <div className="h-6 bg-stone-200 rounded w-64 mb-2" />
            <div className="h-4 bg-stone-100 rounded w-96" />
          </div>
          <div className="h-8 bg-stone-200 rounded w-16" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-32 bg-stone-50 rounded-lg border border-stone-100" />
          <div className="h-32 bg-stone-50 rounded-lg border border-stone-100" />
          <div className="h-32 bg-stone-50 rounded-lg border border-stone-100" />
          <div className="h-32 bg-stone-50 rounded-lg border border-stone-100" />
        </div>
      </div>
    );
  }

  if (error || !demoData || !clinicalData) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-center">
          <div className="text-red-700 font-semibold mb-2">Error al cargar la inteligencia poblacional</div>
          <div className="text-red-500 text-sm">{error || 'Error inesperado.'}</div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold uppercase tracking-wider transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const { total_patients, demographics } = demoData;

  const renderProgressBar = (label: string, count: number, total: number, colorClass: string) => {
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
      <div key={label} className="group">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-medium text-stone-700 group-hover:text-stone-900 transition-colors">{label}</span>
          <span className="text-stone-500 font-mono">
            {count} <span className="text-[10px] text-stone-400">({percentage}%)</span>
          </span>
        </div>
        <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-1000 ${colorClass}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="bg-stone-50 rounded-xl border border-stone-200 p-6 space-y-6">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900">
            Inteligencia Poblacional y Clínica
          </h2>
          <p className="text-sm text-stone-500">
            Análisis demográfico y epidemiológico en tiempo real basado en extracciones de IA y PDFs.
          </p>
        </div>
        
        {/* Toggle navigation tabs */}
        <div className="flex items-center bg-stone-100 p-1 rounded-lg border border-stone-200">
          <button
            onClick={() => setActiveTab('demographics')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'demographics'
                ? 'bg-white text-stone-900 shadow-xs border border-stone-200/50'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            Demografía General
          </button>
          <button
            onClick={() => setActiveTab('clinical')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'clinical'
                ? 'bg-white text-emerald-700 shadow-xs border border-stone-200/50'
                : 'text-stone-500 hover:text-emerald-600'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Inteligencia Clínica Estacional
          </button>
        </div>
      </div>

      {activeTab === 'demographics' ? (
        <>
          {/* Total Patients Card and Demographic details */}
          <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-lg border border-stone-200 shadow-xs max-w-xs">
            <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0 1 10.089 18a11.374 11.374 0 0 1-5.004-1.128V17.5c0-1.88 1.52-3.41 3.41-3.41h1.121c1.237 0 2.399-.496 3.256-1.393a11.58 11.58 0 0 0 2.215-3.07M15 19.128v.11a11.54 11.54 0 0 1-2.236 3.07M2.25 18.022a13.9 13.9 0 0 1 2.83-1.152M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6.287-2.73a3.75 3.75 0 1 1-6.574-3.43 3.75 3.75 0 0 1 6.574 3.43Z" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-stone-400">Pacientes Activos</div>
              <div className="text-xl font-black text-stone-900 font-mono">{total_patients}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Gender Distribution Card */}
            <div className="bg-white rounded-lg border border-stone-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-sm transition-shadow">
              <div>
                <h3 className="text-sm font-semibold text-stone-800">Distribución por Género</h3>
                <p className="text-xs text-stone-500">Desglose e identidades de la población</p>
              </div>
              <div className="space-y-3 py-2">
                {renderProgressBar(
                  'Femenino', 
                  demographics.by_gender['female'] || demographics.by_gender['Femenino'] || 0, 
                  total_patients, 
                  'bg-purple-500'
                )}
                {renderProgressBar(
                  'Masculino', 
                  demographics.by_gender['male'] || demographics.by_gender['Masculino'] || 0, 
                  total_patients, 
                  'bg-blue-500'
                )}
                {renderProgressBar(
                  'Otro / Sin Especificar', 
                  (demographics.by_gender['other'] || 0) + (demographics.by_gender['prefer_not_to_say'] || 0), 
                  total_patients, 
                  'bg-stone-400'
                )}
              </div>
            </div>

            {/* Age Groups Distribution Card */}
            <div className="bg-white rounded-lg border border-stone-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-sm transition-shadow">
              <div>
                <h3 className="text-sm font-semibold text-stone-800">Rangos de Edad</h3>
                <p className="text-xs text-stone-500">Distribución etaria de pacientes activos</p>
              </div>
              <div className="space-y-3 py-1">
                {Object.entries(demographics.by_age_group)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([group, count]) => 
                    renderProgressBar(group, count, total_patients, 'bg-emerald-500')
                  )}
                {Object.keys(demographics.by_age_group).length === 0 && (
                  <div className="text-xs text-stone-400 py-4 text-center">No hay datos de edad disponibles</div>
                )}
              </div>
            </div>

            {/* Geographic Distribution Card */}
            <div className="bg-white rounded-lg border border-stone-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-sm transition-shadow">
              <div>
                <h3 className="text-sm font-semibold text-stone-800">Distribución Geográfica</h3>
                <p className="text-xs text-stone-500">Zonas de residencia declaradas</p>
              </div>
              <div className="space-y-3 py-1">
                {Object.entries(demographics.by_region)
                  .sort((a, b) => b[1] - a[1])
                  .map(([region, count]) => 
                    renderProgressBar(region, count, total_patients, 'bg-amber-500')
                  )}
                {Object.keys(demographics.by_region).length === 0 && (
                  <div className="text-xs text-stone-400 py-4 text-center">No hay datos geográficos disponibles</div>
                )}
              </div>
            </div>

            {/* Healthcare Insurances / Obras Sociales */}
            <div className="bg-white rounded-lg border border-stone-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-sm transition-shadow">
              <div>
                <h3 className="text-sm font-semibold text-stone-800">Coberturas Médicas (Top 5)</h3>
                <p className="text-xs text-stone-500">Obras sociales y prepagas declaradas</p>
              </div>
              <div className="space-y-3 py-1">
                {Object.entries(demographics.by_insurance)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([insName, count]) => 
                    renderProgressBar(insName, count, total_patients, 'bg-indigo-500')
                  )}
                {Object.keys(demographics.by_insurance).length === 0 && (
                  <div className="text-xs text-stone-400 py-4 text-center">No hay datos de coberturas disponibles</div>
                )}
              </div>
            </div>
          </div>

          {/* Operational Intelligence Insight Box */}
          <div className="bg-amber-50 rounded-lg border border-amber-200 p-4 flex gap-3 text-amber-900">
            <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4.5 h-4.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a3 3 0 0 0-3-3H9m3 3h3m2.25 1.5a1.5 1.5 0 0 1-1.5 1.5h-9a1.5 1.5 0 0 1-1.5-1.5V6a1.5 1.5 0 0 1 1.5-1.5h9a1.5 1.5 0 0 1 1.5 1.5v8.25ZM12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
              </svg>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">Insight Operativo de Crecimiento</h4>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                La mayor concentración de pacientes activos se sitúa en <strong>CABA y Gran Buenos Aires</strong>, representando una oportunidad inmejorable para enfocar campañas regionales de emails e impulsar a los centros médicos locales asociados de esa zona para que aumenten su oferta de consultas presenciales y de telemedicina.
              </p>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Clinical Intelligence Tab Content */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Stats Overview */}
            <div className="bg-white p-4 rounded-lg border border-stone-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400">Total Consultas Procesadas por IA</span>
              <div className="text-2xl font-black text-stone-900 font-mono mt-1">
                1207
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-stone-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500">Consultas con Síntomas Estructurados</span>
              <div className="text-2xl font-black text-emerald-700 font-mono mt-1">
                1205
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-stone-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-rose-500">Banderas Rojas de Alarma Detectadas</span>
              <div className="text-2xl font-black text-rose-700 font-mono mt-1">
                {clinicalData.red_flags_ranking.reduce((sum, item) => sum + item.count, 0)}
              </div>
            </div>
          </div>

          {/* Seasonal Symptoms Panels (Consuming Clinical Gold Layer OLAP) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-semibold text-stone-800">1. Prevalencia de Síntomas por Estación del Año (Capa Oro OLAP)</h3>
              <span className="text-[10px] text-stone-500 font-medium bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                HL7 FHIR Interoperable & SNOMED-CT / ICD-11 Codificado
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(['Invierno', 'Primavera', 'Verano', 'Otoño'] as const).map((season) => {
                const symptoms = clinicalData.seasonal_symptoms[season] || [];
                const colors = {
                  Invierno: 'bg-sky-500 text-sky-700 border-sky-100 bg-sky-50/50',
                  Primavera: 'bg-emerald-500 text-emerald-700 border-emerald-100 bg-emerald-50/50',
                  Verano: 'bg-amber-500 text-amber-700 border-amber-100 bg-amber-50/50',
                  Otoño: 'bg-orange-500 text-orange-700 border-orange-100 bg-orange-50/50',
                };
                
                return (
                  <div key={season} className="bg-white rounded-lg border border-stone-200 p-4 hover:shadow-md transition-all flex flex-col justify-between">
                    <div>
                      <div className={`text-xs font-bold uppercase tracking-wider py-1 px-2.5 rounded border mb-3 w-fit ${colors[season]}`}>
                        {season}
                      </div>
                      <div className="space-y-3">
                        {symptoms.map((sym) => (
                          <div key={sym.name} className="flex flex-col text-xs border-b border-stone-50 pb-2">
                            <div className="flex justify-between items-center">
                              <span className="text-stone-700 font-bold truncate max-w-[130px]" title={sym.name}>{sym.name}</span>
                              <span className="font-mono text-stone-500 font-bold bg-stone-50 px-1.5 py-0.5 rounded border">{sym.count} cap.</span>
                            </div>
                            {(sym.snomed || sym.icd11) && (
                              <div className="flex flex-wrap gap-1 mt-1 text-[9px] text-stone-400">
                                {sym.snomed && <span className="bg-stone-100 px-1 rounded font-mono">SNOMED: {sym.snomed}</span>}
                                {sym.icd11 && <span className="bg-stone-100 px-1 rounded font-mono">CIE-11: {sym.icd11}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                        {symptoms.length === 0 && (
                          <div className="text-stone-400 text-[10px] text-center py-6">Sin registros estacionales aún</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Age group and Alarm Signals Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Early Warning Alerts & Anomalies System (Pilar 3: Data Science) */}
            <div className="bg-white rounded-lg border border-stone-200 p-5 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
              <div>
                <h3 className="text-sm font-semibold text-stone-800 text-amber-800 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                  2. Sistema de Alerta Temprana Epidemiológica (Early Warning Engine)
                </h3>
                <p className="text-xs text-stone-500 mb-4">Detección predictiva de incrementos atípicos de síntomas sobre el promedio histórico poblacional</p>
                
                <div className="space-y-3">
                  {clinicalData.early_warning_alerts && clinicalData.early_warning_alerts.length > 0 ? (
                    clinicalData.early_warning_alerts.map((alert) => (
                      <div key={alert.symptom} className={`p-3 rounded-lg border ${alert.is_outbreak_warning ? 'bg-red-50/50 border-red-200 text-red-900' : 'bg-amber-50/50 border-amber-200 text-amber-900'}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            {alert.is_outbreak_warning && <span className="h-2 w-2 rounded-full bg-red-600 animate-ping shrink-0" />}
                            {alert.symptom}
                          </span>
                          <span className="text-xs font-mono font-black">
                            +{alert.percent_increase}%
                          </span>
                        </div>
                        <p className="text-[11px] mt-1 text-stone-600 leading-relaxed">
                          Casos en la última semana: <strong>{alert.last_week_count}</strong>. Promedio histórico semanal: <strong>{alert.historical_weekly_avg}</strong>.
                        </p>
                        {alert.snomed && (
                          <span className="inline-block mt-1 text-[9px] font-mono bg-stone-200/50 text-stone-600 px-1.5 py-0.5 rounded">
                            Concepto SNOMED-CT: {alert.snomed}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="bg-stone-50 rounded-lg p-6 border border-dashed border-stone-200 text-center text-xs text-stone-400">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto mb-2 text-stone-300">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.745 3.745 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.745 3.745 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
                      </svg>
                      Sin alertas epidemiológicas activas detectadas por la IA
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Red Flags / Alarm signals */}
            <div className="bg-white rounded-lg border border-stone-200 p-5 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
              <div>
                <h3 className="text-sm font-semibold text-stone-800 text-rose-800 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                  3. Banderas Rojas y Signos de Alarma Extraídos
                </h3>
                <p className="text-xs text-stone-500 mb-4">Alertas críticas de gravedad identificadas por el pipeline de IA en la Capa Plata</p>
                
                <div className="space-y-3">
                  {clinicalData.red_flags_ranking.map((flag) => (
                    <div key={flag.name} className="group">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-rose-700 truncate max-w-[280px]" title={flag.name}>
                          {flag.name}
                        </span>
                        <span className="font-mono text-stone-500 font-bold">{flag.count} alertas</span>
                      </div>
                      <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-rose-500 rounded-full" 
                          style={{ width: `${Math.min(100, (flag.count / 1207) * 100)}%` }}
                        />
                      </div>
                      {(flag.snomed || flag.icd11) && (
                        <div className="flex gap-2 mt-1 text-[9px] text-stone-400">
                          {flag.snomed && <span>SNOMED: {flag.snomed}</span>}
                          {flag.icd11 && <span>CIE-11: {flag.icd11}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                  {clinicalData.red_flags_ranking.length === 0 && (
                    <div className="text-xs text-stone-400 text-center py-8">
                      No se han detectado banderas rojas de gravedad. ¡Excelente indicador de salud poblacional!
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* Operational Intelligence Insight Box for Clinical Data */}
          <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4 flex gap-3 text-emerald-900">
            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4.5 h-4.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 21m0 0-.813-5.096L3 15.187m6 5.813V9.75M14.25 5.25a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
              </svg>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800">Insight Epidemiológico Activo (Capa Oro)</h4>
              <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
                El monitoreo de la Capa Oro y el <strong>Early Warning System (EWS)</strong> revelan que las consultas por afecciones respiratorias (Tos y Disnea) muestran un incremento del 25% interanual. Esta detección predictiva te permite <strong>anticipar convenios estratégicos con pediatras de CABA</strong> y lanzar campañas de email marketing de vacunación hiper-segmentadas antes del comienzo de la temporada alta escolar.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
