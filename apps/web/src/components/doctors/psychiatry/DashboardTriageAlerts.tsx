'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { 
  ArrowRight, 
  ShieldAlert, 
  Pill, 
  UserPlus, 
  Timer,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  UserCheck,
  Lock,
  Stethoscope,
  ChevronRight,
  Brain,
  Moon,
  Wind,
  Zap
} from 'lucide-react'
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import type { ClinicalVertical, CaseIntent } from '@/lib/patients/clinical-state/types'

interface TriageAlert {
  id: string
  patient_id: string
  triage_status: 'pending' | 'acknowledged' | 'in_progress' | 'resolved' | 'escalated'
  triage_priority_rank: number
  triage_mandate: string
  clinical_vertical: ClinicalVertical
  case_intent: CaseIntent
  updated_at: string
  resolution_deadline_at: string | null
  risk_of_interruption: 'low' | 'medium' | 'high'
  requires_same_day_action: boolean
  assigned_doctor_id?: string | null
  
  // Materialized snapshots
  medication_snapshot_name?: string | null
  medication_snapshot_dose?: string | null
  medication_snapshot_days_remaining?: number | null
  symptoms_snapshot_insomnia_severity?: number | null
  symptoms_snapshot_insomnia_impact?: string | null

  patient: {
    user_id: string
    profile?: {
      first_name: string
      last_name: string
    }
  }
}

const VERTICAL_CONFIG: Record<ClinicalVertical, { label: string, color: string, icon: React.ComponentType<{ className?: string }> }> = {
  tdah_continuity: { label: 'TDAH', color: 'bg-am-doctor-600', icon: Brain },
  insomnia_management: { label: 'INSOMNIO', color: 'bg-indigo-600', icon: Moon },
  anxiety_disorders: { label: 'ANSIEDAD', color: 'bg-teal-600', icon: Wind },
  depressive_disorders: { label: 'DEPRESIÓN', color: 'bg-blue-700', icon: ShieldAlert },
  psychiatry_general: { label: 'PSIQUIATRÍA', color: 'bg-am-surface-600', icon: Stethoscope }
}

export function DashboardTriageAlerts() {
  const { user: currentUser } = useAuthenticatedUser()
  const [alerts, setAlerts] = useState<TriageAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [actingOnId, setActingOnId] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    const supabase = getBrowserSupabaseClient()
    
    const { data, error, count } = await (supabase
      .from('clinical_case_states' as never) as unknown as { select: Function })
      .select(`
        id,
        patient_id,
        clinical_vertical,
        case_intent,
        triage_status,
        triage_priority_rank,
        triage_mandate,
        updated_at,
        resolution_deadline_at,
        risk_of_interruption,
        requires_same_day_action,
        assigned_doctor_id,
        medication_snapshot_name,
        medication_snapshot_dose,
        medication_snapshot_days_remaining,
        symptoms_snapshot_insomnia_severity,
        symptoms_snapshot_insomnia_impact,
        patient:patients (
          user_id,
          profile:profiles!profiles_user_id_fkey (
            first_name,
            last_name
          )
        )
      `, { count: 'exact' })
      .not('triage_status', 'eq', 'resolved')
      .neq('triage_priority_rank', 3) 
      .order('triage_priority_rank', { ascending: true })
      .order('resolution_deadline_at', { ascending: true, nullsFirst: false })
      .limit(10)

    if (!error && data) {
      setAlerts(data as unknown as TriageAlert[])
      setTotalCount(count || 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAlerts()
    const supabase = getBrowserSupabaseClient()
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const channel = supabase
      .channel('clinical_triage_queue_v4')
      .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'clinical_case_states' }, 
          () => {
            if (debounceTimer) clearTimeout(debounceTimer)
            debounceTimer = setTimeout(fetchAlerts, 1000)
          }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [fetchAlerts])

  const takeCase = async (alertId: string) => {
    setActingOnId(alertId)
    const supabase = getBrowserSupabaseClient()
    const { error } = await (supabase as unknown as { rpc: (n: string, a: { p_case_state_id: string }) => Promise<{ error: unknown }> }).rpc('take_triage_case', { p_case_state_id: alertId })
    if (!error) {
      setAlerts(prev => prev.map(a => 
        a.id === alertId ? { ...a, assigned_doctor_id: currentUser?.doctorProfileId, triage_status: 'acknowledged' } : a
      ))
      await fetchAlerts()
    }
    setActingOnId(null)
  }

  const navigateToPatient = (patientId: string) => {
    window.location.href = `/doctors/patients/${patientId}`
  }

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center p-8 text-center bg-am-surface-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-am-doctor-100 border-t-am-doctor-600 mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest text-am-surface-400">Escaneando Cola Clínica</p>
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[2.5rem] bg-emerald-50 text-emerald-600 shadow-inner ring-1 ring-emerald-100">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h3 className="text-sm font-black text-am-surface-900 uppercase">Sin Mandatos Activos</h3>
        <p className="mt-1 text-xs text-am-surface-500 max-w-[220px]">La cola de atención prioritaria está despejada.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white select-none">
      {/* Header Context */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-am-surface-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-am-doctor-600 text-white shadow-am-md ring-4 ring-am-doctor-50">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-am-doctor-600 leading-none mb-1">
              Cola de Atención
            </h3>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-am-surface-900 leading-none tracking-tight">Resolución Prioritaria</p>
              <span className="h-3 w-[1px] bg-am-surface-100" />
              <p className="text-[10px] font-bold text-am-surface-400 leading-none">{totalCount} PENDIENTES</p>
            </div>
          </div>
        </div>
      </div>

      {/* Virtual Queue */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-am-surface-100 custom-scrollbar">
        {alerts.map((alert) => {
          const deadlineStr = alert.resolution_deadline_at
          const deadline = deadlineStr ? new Date(deadlineStr) : null
          const isOverdue = deadline ? deadline < new Date() : false
          const isAssignedToMe = alert.assigned_doctor_id === currentUser?.doctorProfileId
          const isAssignedToOther = alert.assigned_doctor_id && !isAssignedToMe
          
          const vertical = VERTICAL_CONFIG[alert.clinical_vertical] || VERTICAL_CONFIG.psychiatry_general
          const VIcon = vertical.icon

          return (
            <div 
              key={alert.id} 
              className={`group relative p-5 transition-all hover:bg-am-doctor-50/10 ${
                alert.triage_priority_rank === 1 ? 'border-l-[6px] border-am-error-500' : 'border-l-[6px] border-am-warning-500'
              }`}
            >
              {isAssignedToOther && (
                <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5 px-2 py-1 bg-am-surface-50 rounded-lg border border-am-surface-200 shadow-sm">
                  <Lock className="h-3 w-3 text-am-surface-400" />
                  <span className="text-[9px] font-bold text-am-surface-500 uppercase">Trámite Externo</span>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {/* Taxonomy Row */}
                <div className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-white text-[9px] font-black uppercase shadow-sm ${vertical.color}`}>
                    <VIcon className="h-3.5 w-3.5" />
                    {vertical.label}
                  </div>
                  <div className="h-1 w-1 rounded-full bg-am-surface-200" />
                  <span className={`text-[10px] font-black uppercase tracking-tight ${
                    isAssignedToMe ? 'text-am-doctor-600' : 'text-am-surface-400'
                  }`}>
                    Motivo: {alert.case_intent}
                  </span>
                </div>

                {/* Header: Name & Priority */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="text-[16px] font-black text-am-surface-900 truncate tracking-tight uppercase leading-tight">
                        {alert.patient.profile?.first_name ? `${alert.patient.profile.first_name} ${alert.patient.profile.last_name || ''}` : 'Identidad Protegida'}
                      </h4>
                      {alert.requires_same_day_action && (
                        <div className="flex items-center gap-1 bg-am-error-600 text-white px-2 py-1 rounded-lg text-[9px] font-black uppercase shadow-am-sm">
                          <Timer className="h-3 w-3 animate-pulse" />
                          <span>PRIORITARIO</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5 text-[11px] font-black text-am-error-700 leading-none uppercase tracking-tighter">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {alert.triage_mandate}
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end gap-1 shrink-0">
                    {deadline ? (
                      <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-[9px] font-black uppercase ring-1 ring-inset ${
                        isOverdue ? 'bg-am-error-50 text-am-error-700 ring-am-error-200' : 'bg-am-doctor-50 text-am-doctor-700 ring-am-doctor-200'
                      }`}>
                        {isOverdue ? 'VENCIDO' : `VENCE ${deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-am-surface-400 uppercase">Sin SLA</span>
                    )}
                  </div>
                </div>

                {/* Clinical Snapshot: Context Sensitive */}
                <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-am-surface-50 border border-am-surface-100 shadow-inner">
                  {/* Snapshot Col 1: Medication */}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 mb-1.5">
                       <Pill className="h-3.5 w-3.5 text-am-surface-400" />
                       <span className="text-[9px] font-black text-am-surface-400 uppercase tracking-widest leading-none">Farmacología</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                       <span className="text-[11px] font-black text-am-surface-900 truncate uppercase leading-none mb-1">
                         {alert.medication_snapshot_name || 'Sin registro'}
                       </span>
                       <span className="text-[10px] font-bold text-am-surface-500 leading-none">
                         {alert.medication_snapshot_dose ? `${alert.medication_snapshot_dose} (Reportada)` : 'Pauta no detectada'}
                       </span>
                    </div>
                  </div>

                  {/* Snapshot Col 2: Contextual Metrics */}
                  <div className="flex flex-col items-end text-right border-l border-am-surface-200 pl-3">
                    {alert.clinical_vertical === 'insomnia_management' ? (
                      <>
                        <div className="flex items-center gap-1.5 mb-1.5">
                           <span className="text-[9px] font-black text-am-surface-400 uppercase tracking-widest leading-none">Frecuencia / Impacto</span>
                           <Moon className="h-3.5 w-3.5 text-am-surface-400" />
                        </div>
                        <div className="flex flex-col items-end">
                           <span className="text-[11px] font-black text-am-surface-900 leading-none mb-1">
                             {alert.symptoms_snapshot_insomnia_severity ? `${alert.symptoms_snapshot_insomnia_severity} noches/sem` : 'Datos ?'}
                           </span>
                           <span className={`text-[10px] font-black uppercase leading-none ${
                             alert.symptoms_snapshot_insomnia_impact === 'severe' ? 'text-am-error-600' : 'text-am-surface-500'
                           }`}>
                             Impacto {alert.symptoms_snapshot_insomnia_impact || '?'}
                           </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 mb-1.5">
                           <span className="text-[9px] font-black text-am-surface-400 uppercase tracking-widest leading-none">Suministro Crítico</span>
                           <Timer className="h-3.5 w-3.5 text-am-surface-400" />
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className={`text-xl font-black leading-none ${
                            alert.medication_snapshot_days_remaining !== null && alert.medication_snapshot_days_remaining <= 1 
                            ? 'text-am-error-600' : 'text-am-surface-900'
                          }`}>
                            {alert.medication_snapshot_days_remaining ?? '?'}
                          </span>
                          <span className="text-[10px] font-black text-am-surface-500 uppercase">Días</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Indicators & Alerts */}
                <div className="flex items-center gap-4 px-1">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${
                      alert.risk_of_interruption === 'high' ? 'bg-am-error-500 animate-pulse' : 
                      alert.risk_of_interruption === 'medium' ? 'bg-am-warning-500' : 'bg-emerald-500'
                    }`} />
                    <span className="text-[10px] font-black text-am-surface-500 uppercase tracking-tighter">
                      {alert.clinical_vertical === 'insomnia_management' ? 'Deterioro funcional' : 'Riesgo de interrupción'} {alert.risk_of_interruption}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`h-4.5 px-2 rounded-lg flex items-center text-[9px] font-black uppercase tracking-widest ring-1 ring-inset ${
                      alert.triage_status === 'pending' ? 'bg-am-surface-50 text-am-surface-500 ring-am-surface-200' :
                      alert.triage_status === 'acknowledged' ? 'bg-sky-50 text-sky-700 ring-sky-200' :
                      'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    }`}>
                      {alert.triage_status}
                    </div>
                  </div>
                </div>

                {/* Action System */}
                <div className="flex items-center gap-2 pt-1">
                  {!alert.assigned_doctor_id ? (
                    <button 
                      onClick={() => takeCase(alert.id)}
                      disabled={!!actingOnId}
                      className="flex-1 flex items-center justify-center gap-3 rounded-2xl bg-am-doctor-600 py-3.5 text-xs font-black text-white shadow-am-md transition-all hover:bg-am-doctor-700 active:scale-95 disabled:opacity-50"
                    >
                      {actingOnId === alert.id ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" />
                          TOMAR PARA RESOLUCIÓN
                        </>
                      )}
                    </button>
                  ) : isAssignedToMe ? (
                    <button 
                      onClick={() => navigateToPatient(alert.patient_id)}
                      className="flex-1 flex items-center justify-center gap-3 rounded-2xl bg-am-doctor-50 py-3.5 text-xs font-black text-am-doctor-700 ring-2 ring-am-doctor-100 transition-all hover:bg-am-doctor-100 active:scale-95"
                    >
                      <UserCheck className="h-4 w-4" />
                      GESTIONAR PACIENTE
                    </button>
                  ) : (
                    <button 
                      disabled
                      className="flex-1 flex items-center justify-center gap-3 rounded-2xl bg-am-surface-50 py-3.5 text-xs font-black text-am-surface-400 cursor-not-allowed border border-am-surface-200"
                    >
                      <Lock className="h-4 w-4" />
                      ASIGNADO A OTRO MÉDICO
                    </button>
                  )}
                  
                  <button 
                    onClick={() => navigateToPatient(alert.patient_id)}
                    className="h-12 w-12 flex items-center justify-center rounded-2xl bg-white border border-am-surface-200 text-am-surface-500 transition-all hover:border-am-doctor-400 hover:text-am-doctor-600 hover:bg-am-doctor-50 active:scale-90 shadow-am-sm"
                    title="Ver Ficha Clínica Completa"
                  >
                    <ExternalLink className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer System Nav */}
      <div className="p-5 bg-am-surface-50/50 border-t border-am-surface-100">
        <button 
          onClick={() => window.location.href = '/doctors/patients'}
          className="group flex items-center justify-between px-5 py-3.5 rounded-2xl bg-white border border-am-surface-200 text-[10px] font-black text-am-surface-700 transition-all hover:border-am-doctor-600 hover:text-am-doctor-600 shadow-am-sm uppercase tracking-widest"
        >
          <div className="flex items-center gap-3">
             <div className="h-7 w-7 rounded-xl bg-am-surface-100 flex items-center justify-center text-am-surface-500 group-hover:bg-am-doctor-100 group-hover:text-am-doctor-600 transition-all">
                <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
             </div>
             <span>Gestión Central de Pacientes</span>
          </div>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </div>
  )
}
