'use client'

import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { usePreventiveScreenings } from '@/hooks/patients/usePreventiveScreenings'
import { PreventiveScreenings } from './PreventiveScreenings'
import { Shield } from 'lucide-react'

export default function PreventiveHealthPage() {
  const { patient } = usePatientSession()
  const { myScreenings, recommendations, isLoading, error } = usePreventiveScreenings({
    patientId: patient?.id,
  })

  const screeningViews = myScreenings.map((s) => ({
    id: s.id,
    title: s.preventive_screening?.name ?? 'Control médico',
    description: s.preventive_screening?.description ?? '',
    recommended_frequency: s.preventive_screening?.recommended_frequency ?? '',
    status: (s.status === 'completed' ? 'up_to_date' : s.status === 'scheduled' ? 'due_soon' : 'overdue') as 'overdue' | 'due_soon' | 'up_to_date',
    priority: s.preventive_screening?.is_mandatory ? 'high' as const : 'medium' as const,
    last_done_date: s.completed_date ?? undefined,
    next_due_date: s.next_due_date ?? new Date().toISOString(),
  }))

  return (
    <div
      className="min-h-screen pb-4"
      style={{ background: 'var(--au-bg)', color: 'var(--au-text-primary)' }}
    >
      <div className="px-5 pt-8 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(14, 165, 233, 0.12)' }}
          >
            <Shield className="h-5 w-5" style={{ color: 'var(--au-accent)' }} />
          </div>
          <h1 className="text-xl font-bold">Salud Preventiva</h1>
        </div>
        <p className="mt-2 text-sm" style={{ color: 'var(--au-text-tertiary)' }}>
          Tus controles médicos recomendados y próximos estudios
        </p>
      </div>

      <div className="px-5">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: 'var(--au-accent)' }} />
            <span className="ml-3 text-sm" style={{ color: 'var(--au-text-tertiary)' }}>Cargando controles...</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {error}
          </div>
        )}

        {!isLoading && !error && screeningViews.length === 0 && (
          <div className="rounded-xl border p-8 text-center" style={{ borderColor: 'var(--au-border)' }}>
            <Shield className="mx-auto h-10 w-10 mb-3" style={{ color: 'var(--au-text-tertiary)' }} />
            <p className="font-medium" style={{ color: 'var(--au-text-secondary)' }}>
              No tenés controles preventivos asignados todavía
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--au-text-tertiary)' }}>
              {recommendations.length > 0
                ? `Tenés ${recommendations.length} recomendaciones disponibles`
                : 'Completá tu perfil para recibir recomendaciones personalizadas'}
            </p>
          </div>
        )}

        {!isLoading && !error && screeningViews.length > 0 && (
          <PreventiveScreenings screenings={screeningViews} />
        )}
      </div>
    </div>
  )
}
