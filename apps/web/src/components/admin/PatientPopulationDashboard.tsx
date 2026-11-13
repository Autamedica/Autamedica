import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { fetchApi } from '@/lib/api-client';
import { coverageLabel } from '@/lib/admin/patient-intelligence-metrics';

type DemographicsData = {
  success: boolean;
  total_patients: number;
  data_quality?: {
    active_records: number;
    linked_records: number;
    linked_users: number;
    unlinked_records: number;
    with_birth_date: number;
    with_address: number;
    coverage_unknown: number;
  };
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
  metrics?: {
    extraction_records: number;
    extractions_with_symptoms: number;
    symptom_observations: number;
    red_flag_observations: number;
  };
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

type Patient = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  sssValidationStatus: 'pending' | 'pending_review' | 'valid' | 'exempt' | 'rejected' | null;
  dni: string;
  cuil: string;
  address: string;
  birthDate: string;
  gender: string;
  insuranceInfo: {
    provider?: string;
    plan?: string;
    nroAfiliado?: string;
    [key: string]: string | number | boolean | null | undefined | Record<string, unknown>;
  } | null;
  active: boolean;
  createdAt: string;
};

export function PatientPopulationDashboard() {
  const [activeTab, setActiveTab] = useState<'demographics' | 'clinical' | 'list'>('demographics');
  const [demoData, setDemoData] = useState<DemographicsData | null>(null);
  const [clinicalData, setClinicalData] = useState<ClinicalIntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredGender, setHoveredGender] = useState<'female' | 'male' | 'other' | null>(null);

  // Patients list states
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form states
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDni, setFormDni] = useState('');
  const [formCuil, setFormCuil] = useState('');
  const [formGender, setFormGender] = useState('');
  const [formBirthDate, setFormBirthDate] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formObraSocial, setFormObraSocial] = useState('');
  const [formPlan, setFormPlan] = useState('');
  const [formNroAfiliado, setFormNroAfiliado] = useState('');
  const [formSssStatus, setFormSssStatus] = useState<'pending' | 'pending_review' | 'valid' | 'exempt' | 'rejected'>('pending');
  const [formActive, setFormActive] = useState(true);

  // Action feedback states
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

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
        const clinicalEnvelope = await clinicalRes.json();
        const clinicalResult = clinicalEnvelope.data;
        if (!clinicalEnvelope.success || !clinicalResult?.success) {
          throw new Error('La información clínica no está disponible.');
        }

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

  const fetchPatientsList = async (query = '') => {
    try {
      setLoadingPatients(true);
      const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const bypassParam = isDev ? '&dev_admin=1' : '';
      const data = await fetchApi<Patient[]>(`/api/admin/patients?q=${encodeURIComponent(query)}${bypassParam}`);
      if (!Array.isArray(data)) {
        throw new Error('La respuesta de pacientes no tiene el formato esperado.');
      }
      setPatients(data);
    } catch (err) {
      console.error('[PatientPopulationDashboard] Error fetching patients list:', err);
    } finally {
      setLoadingPatients(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'list') {
      void fetchPatientsList(searchQuery);
    }
  }, [activeTab, searchQuery]);

  const handleEditClick = (p: Patient) => {
    setSelectedPatient(p);
    setFormFirstName(p.firstName);
    setFormLastName(p.lastName);
    setFormEmail(p.email);
    setFormPhone(p.phone || '');
    setFormDni(p.dni || '');
    setFormCuil(p.cuil || '');
    setFormGender(p.gender || '');
    setFormBirthDate(p.birthDate || '');
    setFormAddress(p.address || '');
    setFormObraSocial(p.insuranceInfo?.provider || '');
    setFormPlan(p.insuranceInfo?.plan || '');
    setFormNroAfiliado(p.insuranceInfo?.nroAfiliado || '');
    setFormSssStatus(p.sssValidationStatus || 'pending');
    setFormActive(p.active);
    setIsEditing(true);
    setActionError(null);
    setActionSuccess(null);
  };

  const handleCreateClick = () => {
    setFormFirstName('');
    setFormLastName('');
    setFormEmail('');
    setFormPhone('');
    setFormDni('');
    setFormCuil('');
    setFormGender('female');
    setFormBirthDate('');
    setFormAddress('');
    setFormObraSocial('');
    setFormPlan('');
    setFormNroAfiliado('');
    setFormSssStatus('pending');
    setFormActive(true);
    setIsCreating(true);
    setActionError(null);
    setActionSuccess(null);
  };

  const handleSavePatient = async (e: FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const bypassParam = isDev ? '?dev_admin=1' : '';

    const payload = {
      firstName: formFirstName,
      lastName: formLastName,
      email: formEmail,
      phone: formPhone,
      dni: formDni,
      cuil: formCuil,
      gender: formGender,
      birthDate: formBirthDate,
      address: formAddress,
      insuranceInfo: {
        provider: formObraSocial,
        plan: formPlan,
        nroAfiliado: formNroAfiliado,
      },
      sssValidationStatus: formSssStatus,
      active: formActive,
    };

    try {
      let url = '/api/admin/patients';
      let method = 'POST';

      if (isEditing && selectedPatient) {
        url = `/api/admin/patients/${selectedPatient.id}${bypassParam}`;
        method = 'PUT';
      } else {
        url = `/api/admin/patients${bypassParam}`;
      }

      await fetchApi<Patient>(url, {
        method,
        body: payload,
      });

      setActionSuccess(isEditing ? 'Paciente actualizado correctamente.' : 'Paciente creado correctamente.');
      setTimeout(() => {
        setIsEditing(false);
        setIsCreating(false);
        setSelectedPatient(null);
        void fetchPatientsList(searchQuery);
      }, 1000);
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePatient = async (id: string) => {
    setActionLoading(true);
    setActionError(null);

    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const bypassParam = isDev ? '?dev_admin=1' : '';

    try {
      await fetchApi<{ success: true }>(`/api/admin/patients/${id}${bypassParam}`, { method: 'DELETE' });

      setConfirmDeleteId(null);
      void fetchPatientsList(searchQuery);
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : 'Error al eliminar el paciente.');
    } finally {
      setActionLoading(false);
    }
  };

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

  const renderWaffleChart = () => {
    const fCount = demographics.by_gender['female'] || demographics.by_gender['Femenino'] || 0;
    const mCount = demographics.by_gender['male'] || demographics.by_gender['Masculino'] || 0;
    const oCount = (demographics.by_gender['other'] || 0) + (demographics.by_gender['prefer_not_to_say'] || 0);
    const total = fCount + mCount + oCount;

    if (total === 0) {
      return (
        <div className="text-xs text-stone-400 py-6 text-center w-full">
          No hay datos demográficos disponibles
        </div>
      );
    }

    const fPercent = Math.round((fCount / total) * 100);
    const oPercent = Math.round((oCount / total) * 100);
    const mPercent = 100 - (fPercent + oPercent);

    // Build the 100 blocks array
    const blocks: ('female' | 'male' | 'other')[] = [];
    for (let i = 0; i < fPercent; i++) blocks.push('female');
    for (let i = 0; i < mPercent; i++) blocks.push('male');
    for (let i = 0; i < oPercent; i++) blocks.push('other');

    const colorMap = {
      female: 'bg-purple-500 shadow-purple-500/20',
      male: 'bg-blue-500 shadow-blue-500/20',
      other: 'bg-stone-400 shadow-stone-400/20',
    };

    const labelMap = {
      female: 'Femenino',
      male: 'Masculino',
      other: 'Otro / Sin Especificar',
    };

    return (
      <div className="grid grid-cols-10 gap-1 p-2 bg-stone-50 rounded-xl border border-stone-100 shadow-inner w-fit select-none">
        {blocks.map((type, idx) => {
          const isDimmed = hoveredGender !== null && hoveredGender !== type;
          const colorClass = colorMap[type];
          
          return (
            <div
              key={idx}
              className={`h-3 w-3 rounded-xs transition-all duration-300 ease-out cursor-help shadow-xs relative group/block ${colorClass} ${
                isDimmed ? 'opacity-20 scale-90 blur-[0.2px]' : 'opacity-100 scale-100'
              }`}
            >
              {/* Elegant Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 hidden group-hover/block:flex flex-col items-center z-20 pointer-events-none transition-all animate-fade-in whitespace-nowrap">
                <div className="bg-stone-900 text-white text-[10px] font-black px-2 py-1 rounded shadow-lg border border-stone-800 flex items-center gap-1.5 font-mono">
                  <span className={`h-1.5 w-1.5 rounded-full ${type === 'female' ? 'bg-purple-400' : type === 'male' ? 'bg-blue-400' : 'bg-stone-300'}`} />
                  {labelMap[type]} (Bloque #{idx + 1})
                </div>
                <div className="w-1.5 h-1.5 bg-stone-900 rotate-45 -mt-1 border-r border-b border-stone-800" />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-stone-50 rounded-xl border border-stone-200 p-6 space-y-6">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900">
            Gestión e Inteligencia de Pacientes
          </h2>
          <p className="text-sm text-stone-500">
            Control de altas, bajas y modificaciones demográficas/clínicas en tiempo real.
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
            Clínica Estacional
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'list'
                ? 'bg-white text-sky-700 shadow-xs border border-stone-200/50'
                : 'text-stone-500 hover:text-sky-600'
            }`}
          >
            Listado CRUD Pacientes
          </button>
        </div>
      </div>

      {activeTab === 'demographics' && (
        <>
          {/* Total Patients Card and Demographic details */}
          <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-lg border border-stone-200 shadow-xs max-w-xs">
            <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0 1 10.089 18a11.374 11.374 0 0 1-5.004-1.128V17.5c0-1.88 1.52-3.41 3.41-3.41h1.121c1.237 0 2.399-.496 3.256-1.393a11.58 11.58 0 0 0 2.215-3.07M15 19.128v.11a11.54 11.54 0 0 1-2.236 3.07M2.25 18.022a13.9 13.9 0 0 1 2.83-1.152M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6.287-2.73a3.75 3.75 0 1 1-6.574-3.43 3.75 3.75 0 0 1 6.574 3.43Z" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-stone-400">Fichas Habilitadas</div>
              <div className="text-xl font-black text-stone-900 font-mono">{total_patients}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Gender Distribution Card - Waffle Chart de Última Generación */}
            <div className="bg-white rounded-lg border border-stone-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-sm transition-shadow md:col-span-2 lg:col-span-1">
              <div>
                <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-purple-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                  </svg>
                  Distribución por Género
                </h3>
                <p className="text-xs text-stone-500">Cada bloque representa aproximadamente 1% de las fichas habilitadas</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center py-1">
                {/* Waffle Chart Rendering */}
                <div className="flex justify-center shrink-0">
                  {renderWaffleChart()}
                </div>

                {/* Interactive Legend with Staggered Highlight Effects */}
                <div className="space-y-2.5">
                  <div 
                    onMouseEnter={() => setHoveredGender('female')}
                    onMouseLeave={() => setHoveredGender(null)}
                    className={`p-2 rounded-lg border transition-all duration-200 ${
                      hoveredGender === 'female' 
                        ? 'border-purple-200 bg-purple-50/50 pl-3 border-l-4 border-l-purple-500' 
                        : 'border-stone-100 hover:border-stone-200 bg-stone-50/30'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-semibold text-stone-700 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-xs bg-purple-500 shadow-xs" />
                        Femenino
                      </span>
                      <span className="font-mono font-bold text-purple-700">
                        {demographics.by_gender['female'] || demographics.by_gender['Femenino'] || 0}
                      </span>
                    </div>
                    <div className="text-[10px] text-stone-400 font-medium">
                      {total_patients > 0 ? Math.round(((demographics.by_gender['female'] || demographics.by_gender['Femenino'] || 0) / total_patients) * 100) : 0}% del total de pacientes
                    </div>
                  </div>

                  <div 
                    onMouseEnter={() => setHoveredGender('male')}
                    onMouseLeave={() => setHoveredGender(null)}
                    className={`p-2 rounded-lg border transition-all duration-200 ${
                      hoveredGender === 'male' 
                        ? 'border-blue-200 bg-blue-50/50 pl-3 border-l-4 border-l-blue-500' 
                        : 'border-stone-100 hover:border-stone-200 bg-stone-50/30'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-semibold text-stone-700 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-xs bg-blue-500 shadow-xs" />
                        Masculino
                      </span>
                      <span className="font-mono font-bold text-blue-700">
                        {demographics.by_gender['male'] || demographics.by_gender['Masculino'] || 0}
                      </span>
                    </div>
                    <div className="text-[10px] text-stone-400 font-medium">
                      {total_patients > 0 ? Math.round(((demographics.by_gender['male'] || demographics.by_gender['Masculino'] || 0) / total_patients) * 100) : 0}% del total de pacientes
                    </div>
                  </div>

                  <div 
                    onMouseEnter={() => setHoveredGender('other')}
                    onMouseLeave={() => setHoveredGender(null)}
                    className={`p-2 rounded-lg border transition-all duration-200 ${
                      hoveredGender === 'other' 
                        ? 'border-stone-300 bg-stone-100 pl-3 border-l-4 border-l-stone-500' 
                        : 'border-stone-100 hover:border-stone-200 bg-stone-50/30'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-semibold text-stone-700 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-xs bg-stone-400 shadow-xs" />
                        Otro / Sin Especificar
                      </span>
                      <span className="font-mono font-bold text-stone-600">
                        {(demographics.by_gender['other'] || 0) + (demographics.by_gender['prefer_not_to_say'] || 0)}
                      </span>
                    </div>
                    <div className="text-[10px] text-stone-400 font-medium">
                      {total_patients > 0 ? Math.round((((demographics.by_gender['other'] || 0) + (demographics.by_gender['prefer_not_to_say'] || 0)) / total_patients) * 100) : 0}% del total de pacientes
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Age Groups Distribution Card */}
            <div className="bg-white rounded-lg border border-stone-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-sm transition-shadow">
              <div>
                <h3 className="text-sm font-semibold text-stone-800">Rangos de Edad</h3>
                <p className="text-xs text-stone-500">Distribución etaria de fichas habilitadas</p>
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
                <h3 className="text-sm font-semibold text-stone-800">Región inferida del domicilio</h3>
                <p className="text-xs text-stone-500">Clasificación aproximada a partir de texto libre</p>
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
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a3 3 0 0 0-3-3H9m3 3h3m2.25 1.5a1.5 1.5 0 0 1-1.5 1.5h-9a1.5 1.5 0 0 1-1.5-1.5V6a1.5 1.5 0 0 1 1.5-1.5h9a1.5 1.5 0 0 1 1.5 1.5v8.25ZM12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
              </svg>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">Calidad de los datos poblacionales</h4>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                {demoData.data_quality && <span className="block mb-2">
                  {demoData.data_quality.linked_records} fichas con usuario · {demoData.data_quality.unlinked_records} sin usuario vinculado.
                  {' '}{demoData.data_quality.with_birth_date} con fecha de nacimiento · {demoData.data_quality.with_address} con domicilio · {demoData.data_quality.coverage_unknown} con cobertura desconocida.
                </span>}
                Las regiones se infieren del texto del domicilio y pueden ser ambiguas. Estos datos no permiten confirmar una concentración regional ni recomendar campañas segmentadas. Las fichas habilitadas no equivalen a pacientes atendidos.
              </p>
            </div>
          </div>
        </>
      )}

      {activeTab === 'clinical' && (
        <>
          {/* Clinical Tab Content */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg border border-stone-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400">Extracciones IA registradas</span>
              <div className="text-2xl font-black text-stone-900 font-mono mt-1">{clinicalData.metrics?.extraction_records ?? 'Sin verificar'}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-stone-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500">Extracciones con síntomas estructurados</span>
              <div className="text-2xl font-black text-emerald-700 font-mono mt-1">{clinicalData.metrics?.extractions_with_symptoms ?? 'Sin verificar'}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-stone-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-rose-500">Observaciones marcadas como alarma</span>
              <div className="text-2xl font-black text-rose-700 font-mono mt-1">
                {clinicalData.metrics?.red_flag_observations ?? 'Sin verificar'}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-semibold text-stone-800">1. Prevalencia de Síntomas por Estación del Año (Capa Oro OLAP)</h3>
              <span className="text-[10px] text-stone-500 font-medium bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                HL7 FHIR Interoperable & SNOMED-CT / CIE-11 Codificado
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(['Invierno', 'Primavera', 'Verano', 'Otoño'] as const).map((season) => {
                const symptoms = clinicalData?.seasonal_symptoms?.[season] || [];
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border border-stone-200 p-5 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
              <div>
                <h3 className="text-sm font-semibold text-stone-800 text-amber-800 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                  2. Sistema de Alerta Temprana Epidemiológica (Early Warning Engine)
                </h3>
                <p className="text-xs text-stone-500 mb-4">Detección predictiva de incrementos atípicos de síntomas</p>
                <div className="space-y-3">
                  {clinicalData?.early_warning_alerts && clinicalData.early_warning_alerts.length > 0 ? (
                    clinicalData.early_warning_alerts.map((alert) => (
                      <div key={alert.symptom} className={`p-3 rounded-lg border ${alert.is_outbreak_warning ? 'bg-red-50/50 border-red-200 text-red-900' : 'bg-amber-50/50 border-amber-200 text-amber-900'}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            {alert.is_outbreak_warning && <span className="h-2 w-2 rounded-full bg-red-600 animate-ping shrink-0" />}
                            {alert.symptom}
                          </span>
                          <span className="text-xs font-mono font-black">+{alert.percent_increase}%</span>
                        </div>
                        <p className="text-[11px] mt-1 text-stone-600">
                          Casos en la última semana: <strong>{alert.last_week_count}</strong>. Promedio histórico semanal: <strong>{alert.historical_weekly_avg}</strong>.
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="bg-stone-50 rounded-lg p-6 border border-dashed border-stone-200 text-center text-xs text-stone-400">
                      Sin alertas epidemiológicas activas detectadas por la IA
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-stone-200 p-5 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
              <div>
                <h3 className="text-sm font-semibold text-stone-800 text-rose-800 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                  3. Banderas Rojas y Signos de Alarma Extraídos
                </h3>
                <p className="text-xs text-stone-500 mb-4">Alertas críticas de gravedad identificadas por el pipeline de IA en la Capa Plata</p>
                <div className="space-y-3">
                  {(clinicalData?.red_flags_ranking || []).map((flag) => (
                    <div key={flag.name} className="group">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-rose-700 truncate max-w-[280px]" title={flag.name}>{flag.name}</span>
                        <span className="font-mono text-stone-500 font-bold">{flag.count} alertas</span>
                      </div>
                      <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(100, (flag.count / (clinicalData.metrics?.red_flag_observations || 1)) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'list' && (
        <div className="space-y-6">
          
          {/* Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
            <div className="relative flex-1 w-full">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="absolute left-3 top-3 h-5 w-5 text-stone-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.608 10.608Z" />
              </svg>
              <input
                type="text"
                placeholder="Buscar paciente por nombre, apellido, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-lg pl-10 pr-4 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-hidden focus:border-sky-400 focus:bg-white transition-all"
              />
            </div>
            
            <button
              onClick={handleCreateClick}
              className="w-full sm:w-auto px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Nuevo Paciente
            </button>
          </div>

          {/* List Display */}
          {loadingPatients ? (
            <div className="grid grid-cols-1 gap-4">
              <div className="h-16 bg-white border border-stone-200 rounded-lg animate-pulse" />
              <div className="h-16 bg-white border border-stone-200 rounded-lg animate-pulse" />
              <div className="h-16 bg-white border border-stone-200 rounded-lg animate-pulse" />
            </div>
          ) : patients.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-xl p-12 text-center text-stone-500">
              No se encontraron pacientes que coincidan con la búsqueda.
            </div>
          ) : (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
                  <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wider text-stone-500">
                    <tr>
                      <th className="px-6 py-4">Paciente</th>
                      <th className="px-6 py-4">DNI / CUIL</th>
                      <th className="px-6 py-4">Obra Social</th>
                      <th className="px-6 py-4">Estado SSS</th>
                      <th className="px-6 py-4">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 bg-white">
                    {patients.map((p) => (
                      <tr key={p.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600 font-bold">
                              {p.firstName[0]}{p.lastName[0]}
                            </div>
                            <div>
                              <div className="font-semibold text-stone-900">{p.firstName} {p.lastName}</div>
                              <div className="text-xs text-stone-400">{p.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-stone-600">
                          <div>DNI: {p.dni || 'N/D'}</div>
                          <div className="text-[10px] text-stone-400">CUIL: {p.cuil || 'N/D'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-medium text-stone-800">{coverageLabel(p.insuranceInfo)}</div>
                          <div className="text-[10px] text-stone-400">{p.insuranceInfo?.plan ? `Plan: ${p.insuranceInfo.plan}` : ''}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            p.sssValidationStatus === 'valid'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : p.sssValidationStatus === 'exempt'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : p.sssValidationStatus === 'rejected'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {p.sssValidationStatus === 'valid' ? 'Validado' : p.sssValidationStatus === 'exempt' ? 'Exceptuado' : p.sssValidationStatus === 'rejected' ? 'Rechazado' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditClick(p)}
                              className="px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 rounded border border-transparent hover:border-sky-200 transition-all"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(p.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded border border-transparent hover:border-rose-200 transition-all"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Creation / Editing Modal Panel */}
      {(isEditing || isCreating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-stone-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50 rounded-t-xl shrink-0">
              <h3 className="text-lg font-bold text-stone-900">
                {isEditing ? 'Editar Perfil de Paciente' : 'Manual Patient Registration (CRM)'}
              </h3>
              <button
                onClick={() => { setIsEditing(false); setIsCreating(false); setSelectedPatient(null); }}
                className="text-stone-400 hover:text-stone-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSavePatient} className="p-6 space-y-6 flex-1">
              
              {actionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold">
                  {actionError}
                </div>
              )}

              {actionSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold">
                  {actionSuccess}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Personal Information */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-600">Nombre</label>
                  <input
                    type="text"
                    required
                    value={formFirstName}
                    onChange={(e) => setFormFirstName(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-600">Apellido</label>
                  <input
                    type="text"
                    required
                    value={formLastName}
                    onChange={(e) => setFormLastName(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-600">Email de Contacto</label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-600">Teléfono (WhatsApp)</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-600">DNI</label>
                  <input
                    type="text"
                    value={formDni}
                    onChange={(e) => setFormDni(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-600">CUIL</label>
                  <input
                    type="text"
                    value={formCuil}
                    onChange={(e) => setFormCuil(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-600">Género</label>
                  <select
                    value={formGender}
                    onChange={(e) => setFormGender(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-hidden"
                  >
                    <option value="female">Femenino</option>
                    <option value="male">Masculino</option>
                    <option value="other">Otro</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-600">Fecha de Nacimiento</label>
                  <input
                    type="date"
                    value={formBirthDate}
                    onChange={(e) => setFormBirthDate(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-stone-600">Dirección Residencial</label>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900"
                  />
                </div>
              </div>

              {/* Insurance / Obra Social Details */}
              <div className="border-t border-stone-100 pt-6">
                <h4 className="text-xs font-bold uppercase tracking-wider text-sky-700 mb-4">Información de Cobertura Médica</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-600">Obra Social / Prepaga</label>
                    <input
                      type="text"
                      placeholder="Ej: OSDE, Swiss Medical..."
                      value={formObraSocial}
                      onChange={(e) => setFormObraSocial(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-600">Plan</label>
                    <input
                      type="text"
                      placeholder="Ej: 210, 310..."
                      value={formPlan}
                      onChange={(e) => setFormPlan(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-600">Nro Afiliado</label>
                    <input
                      type="text"
                      value={formNroAfiliado}
                      onChange={(e) => setFormNroAfiliado(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900"
                    />
                  </div>
                </div>
              </div>

              {/* Status and Active checks */}
              <div className="border-t border-stone-100 pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-600">Estado de Validación SSS</label>
                  <select
                    value={formSssStatus}
                    onChange={(e) => setFormSssStatus(e.target.value as 'pending' | 'pending_review' | 'valid' | 'exempt' | 'rejected')}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-hidden"
                  >
                    <option value="pending">Pendiente</option>
                    <option value="pending_review">En Revisión</option>
                    <option value="valid">Validado / Activo</option>
                    <option value="exempt">Exceptuado</option>
                    <option value="rejected">Rechazado</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="formActive"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    className="h-4 w-4 text-sky-600 border-stone-300 rounded focus:ring-sky-500"
                  />
                  <label htmlFor="formActive" className="text-xs font-bold text-stone-700">
                    Paciente Habilitado en la Plataforma
                  </label>
                </div>
              </div>

              {/* Form actions */}
              <div className="border-t border-stone-200 pt-4 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => { setIsEditing(false); setIsCreating(false); setSelectedPatient(null); }}
                  className="px-4 py-2 border border-stone-200 hover:bg-stone-50 text-stone-700 rounded-lg text-sm font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold shadow-xs transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'Guardando...' : 'Guardar Paciente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation of Delete Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-stone-200 max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-rose-800 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-rose-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              ¡Atención! Acción Irreversible
            </h3>
            
            <p className="text-sm text-stone-600 leading-relaxed">
              ¿Estás completamente seguro de que deseas eliminar este paciente de forma definitiva? Esta acción borrará todas sus recetas, historial médico y perfil de forma permanente, cumpliendo con el **Derecho al Olvido (RGPD)**.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 border border-stone-200 hover:bg-stone-50 text-stone-700 rounded-lg text-xs font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleDeletePatient(confirmDeleteId)}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
              >
                {actionLoading ? 'Eliminando...' : 'Sí, Eliminar Paciente'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

