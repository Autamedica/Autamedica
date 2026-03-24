'use client'

import { AlertTriangle } from 'lucide-react'

export function GracePeriodBanner() {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
      <p className="min-w-0 text-sm text-red-800">
        Tu perfil profesional no está completo. Completa tus datos para seguir operando.
      </p>
      <a
        href="/doctors/perfil"
        className="ml-auto shrink-0 rounded-lg bg-red-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
      >
        Completar perfil
      </a>
    </div>
  )
}
