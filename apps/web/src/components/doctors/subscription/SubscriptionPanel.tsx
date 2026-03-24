"use client"

import {
    BarChart3,
    Brain,
    Calendar,
    Crown,
    Users,
} from 'lucide-react'
import type { JSX } from 'react'

export function SubscriptionPanel(): JSX.Element {
  return (
    <div className="h-full rounded-2xl border border-am-surface-200 bg-white p-6 shadow-am-sm">
      <div className="mb-8 rounded-xl bg-gradient-to-br from-am-doctor-500 via-am-doctor-600 to-am-primary-700 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
            <Crown className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Suscripción AutaMedica</h2>
            <p className="text-sm text-white/80">Gestiona tu plan y funcionalidades</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-am-doctor-500 to-am-primary-600 mb-6">
          <Crown className="h-10 w-10 text-white" />
        </div>
        <h3 className="text-xl font-bold text-am-surface-900 mb-3">
          Planes de suscripción en desarrollo
        </h3>
        <p className="max-w-md text-am-surface-500 leading-relaxed">
          Estamos preparando planes diseñados para médicos y clínicas.
          Por ahora, todas las funcionalidades de la plataforma están disponibles sin costo.
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-am-surface-200 bg-am-surface-50 p-6 shadow-am-sm">
        <h3 className="mb-4 text-lg font-semibold text-am-surface-900">Uso del mes actual</h3>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="text-center">
            <Users className="mx-auto mb-2 h-6 w-6 text-am-surface-400" />
            <p className="text-2xl font-bold text-am-surface-500">&mdash;</p>
            <p className="text-sm text-am-surface-400">Consultas</p>
          </div>
          <div className="text-center">
            <Calendar className="mx-auto mb-2 h-6 w-6 text-am-surface-400" />
            <p className="text-2xl font-bold text-am-surface-500">&mdash;</p>
            <p className="text-sm text-am-surface-400">Tiempo total</p>
          </div>
          <div className="text-center">
            <BarChart3 className="mx-auto mb-2 h-6 w-6 text-am-surface-400" />
            <p className="text-2xl font-bold text-am-surface-500">&mdash;</p>
            <p className="text-sm text-am-surface-400">Satisfacción</p>
          </div>
          <div className="text-center">
            <Brain className="mx-auto mb-2 h-6 w-6 text-am-surface-400" />
            <p className="text-2xl font-bold text-am-surface-500">&mdash;</p>
            <p className="text-sm text-am-surface-400">Análisis IA</p>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-am-surface-400">Las estadísticas se mostrarán cuando tengas consultas registradas</p>
      </div>
    </div>
  )
}
