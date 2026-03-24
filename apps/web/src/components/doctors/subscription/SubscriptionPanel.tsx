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
    <div className="h-full rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
            <Crown className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Suscripción AutaMedica</h2>
            <p className="text-sm text-gray-500">Gestiona tu plan y funcionalidades</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50 mb-6">
          <Crown className="h-10 w-10 text-blue-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-3">
          Planes de suscripción en desarrollo
        </h3>
        <p className="max-w-md text-gray-500 leading-relaxed">
          Estamos preparando planes diseñados para médicos y clínicas.
          Por ahora, todas las funcionalidades de la plataforma están disponibles sin costo.
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-neutral-50 p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Uso del mes actual</h3>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="text-center">
            <Users className="mx-auto mb-2 h-6 w-6 text-gray-400" />
            <p className="text-2xl font-bold text-gray-500">&mdash;</p>
            <p className="text-sm text-gray-400">Consultas</p>
          </div>
          <div className="text-center">
            <Calendar className="mx-auto mb-2 h-6 w-6 text-gray-400" />
            <p className="text-2xl font-bold text-gray-500">&mdash;</p>
            <p className="text-sm text-gray-400">Tiempo total</p>
          </div>
          <div className="text-center">
            <BarChart3 className="mx-auto mb-2 h-6 w-6 text-gray-400" />
            <p className="text-2xl font-bold text-gray-500">&mdash;</p>
            <p className="text-sm text-gray-400">Satisfacción</p>
          </div>
          <div className="text-center">
            <Brain className="mx-auto mb-2 h-6 w-6 text-gray-400" />
            <p className="text-2xl font-bold text-gray-500">&mdash;</p>
            <p className="text-sm text-gray-400">Análisis IA</p>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-gray-400">Las estadísticas se mostrarán cuando tengas consultas registradas</p>
      </div>
    </div>
  )
}
