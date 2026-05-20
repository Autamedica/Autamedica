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

export function PatientPopulationDashboard() {
  const [data, setData] = useState<DemographicsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDemographics = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Dynamic bypass for local development if needed
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const url = `/api/admin/patient-demographics${isDev ? '?dev_admin=1' : ''}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('No se pudieron cargar los datos demográficos.');
        }
        
        const result = await response.json();
        if (result.error) {
          throw new Error(result.error);
        }
        
        setData(result);
      } catch (err) {
        console.error('[PatientPopulationDashboard] Error:', err);
        const errorMsg = err instanceof Error ? err.message : 'Error al conectar con la API de datos demográficos.';
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    void fetchDemographics();
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="h-64 bg-stone-50 rounded-lg border border-stone-150" />
          <div className="h-64 bg-stone-50 rounded-lg border border-stone-150" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-center">
          <div className="text-red-700 font-semibold mb-2">Error al cargar la información demográfica</div>
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

  const { total_patients, demographics } = data;

  // Helpers to render premium bar progress
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900">
            Población y Demografía de Pacientes
          </h2>
          <p className="text-sm text-stone-500">
            Análisis demográfico y de cobertura de salud en tiempo real de los pacientes registrados.
          </p>
        </div>
        
        {/* Total Patients Card */}
        <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-lg border border-stone-200 shadow-xs self-start">
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
      </div>

      {/* Grid of Key Visualizations */}
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

    </div>
  );
}
