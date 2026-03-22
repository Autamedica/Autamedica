'use client'

import { Bot, FileText } from 'lucide-react'

export function AIHistoryPanel() {
  return (
    <div className="h-full bg-[#101d32] text-slate-100">
      <div className="p-6 border-b border-slate-800/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Bot className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-100">Historial IA</h1>
              <p className="text-sm text-slate-400">Análisis y recomendaciones de inteligencia artificial</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100%-100px)] items-center justify-center">
        <div className="text-center max-w-md px-6">
          <FileText className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">Sin análisis de IA</h3>
          <p className="text-slate-400">
            Los análisis realizados con inteligencia artificial aparecerán aquí cuando se generen durante las consultas.
          </p>
        </div>
      </div>
    </div>
  )
}
