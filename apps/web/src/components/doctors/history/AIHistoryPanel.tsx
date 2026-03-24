'use client'

import { Bot, FileText } from 'lucide-react'

export function AIHistoryPanel() {
  return (
    <div className="h-full bg-white text-am-surface-900">
      <div className="p-6 border-b border-am-surface-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Bot className="w-6 h-6 text-purple-700" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-am-surface-900">Historial IA</h1>
              <p className="text-sm text-am-surface-500">Análisis y recomendaciones de inteligencia artificial</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100%-100px)] items-center justify-center">
        <div className="text-center max-w-md px-6">
          <FileText className="w-12 h-12 text-am-surface-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-am-surface-700 mb-2">Sin análisis de IA</h3>
          <p className="text-am-surface-500">
            Los análisis realizados con inteligencia artificial aparecerán aquí cuando se generen durante las consultas.
          </p>
        </div>
      </div>
    </div>
  )
}
