'use client'

import React, { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, User, Clock, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'

interface TriageAlert {
  id: string
  patient_id: string
  triage_priority: 'urgent' | 'priority' | 'routine'
  triage_mandate: string
  updated_at: string
  state: any
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

  useEffect(() => {
    const supabase = getBrowserSupabaseClient()
    
    async function fetchAlerts() {
      // Fetch clinic case states with triage priority
      const { data, error } = await supabase
        .from('clinical_case_states' as any)
        .select(`
          id,
          patient_id,
          triage_priority,
          triage_mandate,
          updated_at,
          state,
          patient:patients (
            user_id,
            profile:profiles!profiles_user_id_fkey (
              first_name,
              last_name
            )
          )
        `)
        .neq('triage_priority', 'routine')
        .order('updated_at', { ascending: false })
        .limit(10)

      if (!error && data) {
        setAlerts(data as any)
      } else if (error) {
        console.error('Error fetching triage alerts:', error)
      }
      setLoading(false)
    }

    fetchAlerts()
    
    // Subscribe to changes
    const channel = supabase
      .channel('clinical_triage_alerts')
      .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'clinical_case_states' }, 
          () => fetchAlerts()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-am-doctor-200 border-t-am-doctor-500" />
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold text-am-surface-900">Sin alertas pendientes</h3>
        <p className="mt-1 text-xs text-am-surface-500">Todos los triages psiquiátricos están en orden.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-am-surface-100 bg-am-surface-50/50">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-am-doctor-600" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-am-surface-700">
            Alertas de Triage Psiquiátrico
          </h3>
        </div>
        <span className="inline-flex items-center rounded-full bg-am-doctor-100 px-2.5 py-0.5 text-xs font-medium text-am-doctor-800">
          {alerts.length} Pendientes
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-am-surface-100">
        {alerts.map((alert) => (
          <div 
            key={alert.id} 
            className={`group p-4 transition-all hover:bg-am-doctor-50/30 ${
              alert.triage_priority === 'urgent' ? 'border-l-4 border-am-error-500' : 'border-l-4 border-am-warning-500'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-2 w-2 rounded-full ${
                    alert.triage_priority === 'urgent' ? 'bg-am-error-500 animate-pulse' : 'bg-am-warning-500'
                  }`} />
                  <h4 className="text-sm font-bold text-am-surface-900 truncate">
                    {alert.patient.profile?.first_name} {alert.patient.profile?.last_name || 'Paciente'}
                  </h4>
                  <span className="text-[10px] text-am-surface-400 font-medium">
                    {new Date(alert.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                
                <p className="text-xs text-am-surface-600 line-clamp-2 italic mb-2">
                  "{alert.triage_mandate || 'Requiere revisión manual de anamnesis'}"
                </p>

                <div className="flex items-center gap-3">
                   <div className="flex items-center gap-1 text-[10px] font-medium text-am-surface-500">
                    <Clock className="h-3 w-3" />
                    <span>Triage: {alert.triage_priority.toUpperCase()}</span>
                  </div>
                </div>
              </div>

              <button 
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-am-surface-100 text-am-surface-500 transition-colors group-hover:bg-am-doctor-600 group-hover:text-white"
                onClick={() => window.location.href = `/doctors/patients/${alert.patient_id}`}
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <div className="p-3 bg-am-surface-50 border-t border-am-surface-100 text-center">
        <button className="text-[11px] font-bold text-am-doctor-600 hover:text-am-doctor-700 uppercase tracking-tight">
          Ver todas las derivaciones críticas
        </button>
      </div>
    </div>
  )
}
