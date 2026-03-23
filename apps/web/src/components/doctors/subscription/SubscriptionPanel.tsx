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
    <div className="h-full rounded-xl border border-slate-800/60 bg-[#101d32] p-6 shadow-xl">
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
            <Crown className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-100">Suscripción AutaMedica</h2>
            <p className="text-sm text-slate-400">Gestiona tu plan y funcionalidades</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-500/10 mb-6">
          <Crown className="h-10 w-10 text-emerald-400" />
        </div>
        <h3 className="text-xl font-bold text-slate-100 mb-3">
          Planes de suscripción en desarrollo
        </h3>
        <p className="max-w-md text-slate-400 leading-relaxed">
          Estamos preparando planes diseñados para médicos y clínicas.
          Por ahora, todas las funcionalidades de la plataforma están disponibles sin costo.
        </p>
      </div>

      <div className="mt-8 rounded-lg border border-slate-700/60 bg-slate-900/20 p-6">
        <h3 className="mb-4 text-lg font-semibold text-slate-100">Uso del mes actual</h3>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="text-center">
            <Users className="mx-auto mb-2 h-6 w-6 text-slate-500" />
            <p className="text-2xl font-bold text-slate-400">&mdash;</p>
            <p className="text-sm text-slate-500">Consultas</p>
          </div>
          <div className="text-center">
            <Calendar className="mx-auto mb-2 h-6 w-6 text-slate-500" />
            <p className="text-2xl font-bold text-slate-400">&mdash;</p>
            <p className="text-sm text-slate-500">Tiempo total</p>
          </div>
          <div className="text-center">
            <BarChart3 className="mx-auto mb-2 h-6 w-6 text-slate-500" />
            <p className="text-2xl font-bold text-slate-400">&mdash;</p>
            <p className="text-sm text-slate-500">Satisfacción</p>
          </div>
          <div className="text-center">
            <Brain className="mx-auto mb-2 h-6 w-6 text-slate-500" />
            <p className="text-2xl font-bold text-slate-400">&mdash;</p>
            <p className="text-sm text-slate-500">Análisis IA</p>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">Las estadísticas se mostrarán cuando tengas consultas registradas</p>
      </div>
    </div>
  )
}
