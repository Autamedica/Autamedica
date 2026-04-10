'use client'

import React, { useEffect, useState } from 'react'
import { 
  AlertCircle, 
  ArrowRight, 
  Clock, 
  ShieldAlert, 
  CheckCircle2, 
  MedicationIcon, 
  UserPlus, 
  Timer,
  AlertTriangle,
  ExternalLink
} from 'lucide-react'
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import type { ClinicalCaseState, CurrentMedicationEntry } from '@/lib/patients/clinical-state/types'

// Use the domain types for internal logic
interface TriageAlert {
  id: string
  patient_id: string
  triage_priority: 'urgent' | 'priority' | 'routine'
  triage_status: 'pending' | 'acknowledged' | 'in_progress' | 'resolved' | 'escalated'
  triage_mandate: string
  updated_at: string
  resolution_deadline_at: string
  risk_of_interruption: 'low' | 'medium' | 'high'
  requires_same_day_action: boolean
  assigned_doctor_id?: string | null
  state: ClinicalCaseState
  patient: {
    user_id: string
    profile?: {
      first_name: string
      last_name: string
    }
  }
}

export function DashboardTriageAlerts() {
  const [alerts, setAlerts] = useState<TriageAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    const supabase = getBrowserSupabaseClient()
    
    async function fetchAlerts() {
      // Fetch clinic case states with triage priority and operational status
      const { data, error, count } = await supabase
        .from('clinical_case_states' as any)
        .select(`
          id,
          patient_id,
          triage_priority,
          triage_status,
          triage_mandate,
          updated_at,
          resolution_deadline_at,
          risk_of_interruption,
          requires_same_day_action,
          assigned_doctor_id,
          state,
          patient:patients (
            user_id,
            profile:profiles!profiles_user_id_fkey (
              first_name,
              last_name
            )
          )
        `, { count: 'exact' })
        .neq('triage_priority', 'routine')
        .not('triage_status', 'eq', 'resolved')
        // Sort by priority (urgent first), then by deadline (asc), then by updatedAt
        .order('triage_priority', { ascending: false })
        .order('resolution_deadline_at', { ascending: true })
        .limit(10)

      if (!error && data) {
        setAlerts(data as any)
        setTotalCount(count || 0)
      } else if (error) {
        console.error('Error fetching triage alerts:', error)
      }
      setLoading(false)
    }

    fetchAlerts()
    
    // Subscribe to changes in clinical state or triage status
    const channel = supabase
      .channel('clinical_triage_queue')
      .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'clinical_case_states' }, 
          () => fetchAlerts()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const takeCase = async (alertId: string) => {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.rpc('take_triage_case', { p_case_state_id: alertId })
    if (error) {
      console.error('Failed to take case:', error)
      alert('Error al asignar el caso')
    }
  }

  const navigateToPatient = (patientId: string) => {
    // In a real SPA we would use a router
    window.location.href = `/doctors/patients/${patientId}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
           <div className="h-8 w-8 animate-spin rounded-full border-2 border-am-doctor-100 border-t-am-doctor-600" />
           <p className="text-[10px] font-bold uppercase tracking-widest text-am-surface-400">Sincronizando Cola Clínica</p>
        </div>
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 shadow-inner">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="text-sm font-bold text-am-surface-900">Cola Despejada</h3>
        <p className="mt-1 text-xs text-am-surface-500 max-w-[200px]">No hay triages críticos pendientes de resolución operativa hoy.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with real count */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-am-surface-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-am-doctor-600 text-white shadow-am-sm">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-am-surface-500 leading-none mb-1">
              Cola de Triaje
            </h3>
            <p className="text-sm font-bold text-am-surface-900 leading-none">
              Gestión de Resolución
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-black ring-1 ring-inset ${
             totalCount > 5 ? 'bg-am-error-50 text-am-error-700 ring-am-error-200' : 'bg-am-doctor-50 text-am-doctor-700 ring-am-doctor-200'
           }`}>
            {totalCount} CASOS
          </span>
        </div>
      </div>

      {/* Main Queue */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-am-surface-100 custom-scrollbar">
        {alerts.map((alert) => {
          const deadline = new Date(alert.resolution_deadline_at)
          const isOverdue = deadline < new Date()
          const ads = alert.state?.medications?.currentMedications?.value as CurrentMedicationEntry[] || []
          const firstMed = ads[0]

          return (
            <div 
              key={alert.id} 
              className={`group relative p-5 transition-all hover:bg-am-doctor-50/20 ${
                alert.triage_priority === 'urgent' ? 'border-l-4 border-am-error-500' : 'border-l-4 border-am-warning-500'
              }`}
            >
              <div className="flex flex-col gap-3">
                {/* Row 1: Badges & Patient */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-bold text-am-surface-900 truncate tracking-tight">
                        {alert.patient.profile?.first_name ? `${alert.patient.profile.first_name} ${alert.patient.profile.last_name || ''}` : 'Identidad Protegida'}
                      </h4>
                      {alert.requires_same_day_action && (
                        <span className="flex items-center gap-0.5 whitespace-nowrap rounded-md bg-am-error-600 px-1.5 py-0.5 text-[9px] font-black text-white uppercase shadow-sm">
                          <Timer className="h-2.5 w-2.5" />
                          Resolver HOY
                        </span>
                      )}
                    </div>
                    
                    {/* Operational Mandate */}
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-am-error-700 leading-none">
                       <AlertTriangle className="h-3 w-3" />
                       <span className="uppercase tracking-tight">{alert.triage_mandate}</span>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end gap-1">
                    <span className={`text-[10px] font-bold ${isOverdue ? 'text-am-error-600' : 'text-am-surface-500'}`}>
                      {isOverdue ? 'VENCIDO' : `Vence: ${deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    </span>
                    <div className="flex items-center gap-1">
                       {alert.assigned_doctor_id ? (
                         <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Asignado
                         </span>
                       ) : (
                         <span className="text-[10px] font-medium text-am-surface-400">Sin asignar</span>
                       )}
                    </div>
                  </div>
                </div>

                {/* Row 2: Clinical Data Snapshot */}
                <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-am-surface-50 border border-am-surface-100">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-am-surface-400 uppercase tracking-tighter">Medicación Reportada</span>
                    <span className="text-[11px] font-bold text-am-surface-800 truncate">
                      {firstMed?.medicationName?.value || 'No reportada'}
                    </span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[9px] font-bold text-am-surface-400 uppercase tracking-tighter">Días Restantes</span>
                    <span className={`text-[11px] font-black ${
                      (firstMed?.daysRemaining?.value ?? 7) <= 1 ? 'text-am-error-600' : 'text-am-surface-800'
                    }`}>
                      {firstMed?.daysRemaining?.value !== null && firstMed?.daysRemaining?.value !== undefined 
                        ? `${firstMed.daysRemaining.value} días` 
                        : 'Desconocido'}
                    </span>
                  </div>
                </div>

                {/* Row 3: Action Bar */}
                <div className="flex items-center gap-2 mt-1">
                  {!alert.assigned_doctor_id ? (
                    <button 
                      onClick={() => takeCase(alert.id)}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-white border border-am-doctor-200 py-2 text-[11px] font-bold text-am-doctor-700 shadow-sm transition-all hover:bg-am-doctor-600 hover:text-white hover:border-am-doctor-600 active:scale-95"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Tomar Caso
                    </button>
                  ) : (
                    <button 
                      onClick={() => navigateToPatient(alert.patient_id)}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-am-doctor-600 py-2 text-[11px] font-bold text-white shadow-sh-sm transition-all hover:bg-am-doctor-700 active:scale-95"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Tramitar Alerta
                    </button>
                  )}
                  <button 
                    onClick={() => navigateToPatient(alert.patient_id)}
                    className="h-9 w-9 flex items-center justify-center rounded-xl bg-am-surface-100 text-am-surface-500 hover:bg-am-surface-200 transition-colors"
                    title="Ver Ficha Completa"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Footer Actions */}
      <div className="p-4 bg-white border-t border-am-surface-100">
        <button 
          onClick={() => window.location.href = '/doctors/patients?filter=triage_alert'}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-am-surface-300 text-[11px] font-black uppercase tracking-widest text-am-surface-400 transition-all hover:border-am-doctor-400 hover:text-am-doctor-600"
        >
          Ver Cola de Derivación Completa
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
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
    </div>
  )
}
