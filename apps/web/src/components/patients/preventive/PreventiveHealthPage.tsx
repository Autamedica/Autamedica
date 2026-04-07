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
    title: s.screening?.name ?? 'Control médico',
    description: s.screening?.description ?? '',
    recommended_frequency: s.screening?.recommended_frequency ?? '',
    status: (s.status === 'completed' ? 'up_to_date' : s.status === 'scheduled' ? 'due_soon' : 'overdue') as 'overdue' | 'due_soon' | 'up_to_date',
    priority: s.screening?.is_mandatory ? 'high' as const : 'medium' as const,
    last_done_date: s.completed_date ?? undefined,
    next_due_date: s.next_due_date ?? new Date().toISOString(),
  }))

  return (
    <div className="min-h-screen bg-white pb-20 pt-4 md:pt-10">
      <div className="mx-auto max-w-5xl px-6">
        {/* Header Minimalista */}
        <header className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 border border-gray-100">
                <Shield className="h-4 w-4 text-gray-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
                Salud Preventiva
              </h1>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-500 max-w-md">
              Gestiona tus chequeos recomendados y mantén un seguimiento profesional de tu bienestar.
            </p>
          </div>
        </header>

        <main>
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-800" />
              <span className="mt-4 text-xs font-semibold uppercase tracking-widest text-gray-400">Actualizando datos</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="rounded-2xl border border-red-100 bg-red-50/50 p-6 text-center">
              <p className="text-sm font-semibold text-red-800">{error}</p>
            </div>
          )}

          {!isLoading && !error && screeningViews.length === 0 && recommendations.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-200 py-24 text-center">
              <div className="rounded-2xl bg-gray-50 p-4 mb-6">
                <Shield className="h-8 w-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Sin controles asignados</h3>
              <p className="mt-2 text-sm text-gray-500 max-w-xs mx-auto">
                Completa la información de tu perfil para generar un plan de prevención personalizado.
              </p>
            </div>
          )}

          {!isLoading && !error && (screeningViews.length > 0 || recommendations.length > 0) && (
            <div className="space-y-16">
              {screeningViews.length > 0 && (
                <section>
                  <div className="mb-6 flex items-center gap-4">
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                      Controles Activos
                    </h2>
                    <div className="h-px flex-1 bg-gray-50" />
                  </div>
                  <PreventiveScreenings screenings={screeningViews} />
                </section>
              )}

              {recommendations.length > 0 && (
                <section>
                  <div className="mb-6 flex items-center gap-4">
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                      Sugerencias Profesionales
                    </h2>
                    <div className="h-px flex-1 bg-gray-50" />
                  </div>
                  <PreventiveScreenings
                    screenings={recommendations.map((r) => ({
                      id: r.screening.id,
                      title: r.screening.name,
                      description: r.screening.description,
                      recommended_frequency: r.screening.recommended_frequency,
                      status: 'due_soon' as const,
                      priority: r.urgency,
                      next_due_date: r.next_due_date ?? new Date().toISOString(),
                    }))}
                  />
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
