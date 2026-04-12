'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, FileText, Download, Mail, Printer, QrCode,
  ChevronDown, ChevronRight, Check, Shield,
} from 'lucide-react'
import type { AnamnesisStep } from '@/lib/patients/types/anamnesis'

interface PdfPreviewModalProps {
  open: boolean
  onClose: () => void
  onDownloadFull: () => void
  onDownloadSummary?: () => void
  saving: boolean
  patientName: string
  completedDate: string | null
  sections: AnamnesisStep[]
  formData: Record<string, Record<string, unknown>>
  completedSections: string[]
}

function SectionPreview({ section, data, defaultOpen }: {
  section: AnamnesisStep
  data: Record<string, unknown> | undefined
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const hasData = data && Object.values(data).some(v => v != null && v !== '')

  return (
    <div className="border-b border-neutral-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {hasData ? (
            <div className="size-5 rounded-full bg-neutral-900 flex items-center justify-center">
              <Check className="size-3 text-white" />
            </div>
          ) : (
            <div className="size-5 rounded-full border-2 border-neutral-200" />
          )}
          <span className="text-sm font-medium text-neutral-900">{section.title}</span>
        </div>
        {open ? <ChevronDown className="size-4 text-neutral-400" /> : <ChevronRight className="size-4 text-neutral-400" />}
      </button>

      <AnimatePresence>
        {open && data && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-4 space-y-2">
              {section.fields.map((field) => {
                const val = data[field.id]
                if (val == null || val === '') return null
                const display = val === true ? 'Sí' : val === false ? 'No'
                  : Array.isArray(val) ? (val as string[]).join(', ') || '—'
                  : String(val)
                return (
                  <div key={field.id} className="flex justify-between text-sm">
                    <span className="text-neutral-500">{field.label}</span>
                    <span className="text-neutral-900 font-medium text-right max-w-[60%] truncate">{display}</span>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function PdfPreviewModal({
  open, onClose, onDownloadFull, onDownloadSummary, saving,
  patientName, completedDate, sections, formData, completedSections,
}: PdfPreviewModalProps) {
  const completedCount = completedSections.length
  const totalCount = sections.length

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-4 lg:inset-12 bg-white rounded-3xl z-50 flex flex-col overflow-hidden shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-neutral-900 flex items-center justify-center">
                  <FileText className="size-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">Historia Clínica General</h2>
                  <p className="text-xs text-neutral-500">Vista previa del documento</p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-xl transition-colors">
                <X className="size-5 text-neutral-600" />
              </button>
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Document Header Preview */}
              <div className="bg-gradient-to-br from-neutral-900 to-neutral-800 px-8 py-10 text-white">
                <div className="flex items-center gap-2 mb-6">
                  <Shield className="size-4 text-sky-400" />
                  <span className="text-xs text-sky-300 uppercase tracking-wider">Documento Médico Confidencial</span>
                </div>
                <h1 className="text-3xl font-bold mb-2">Historia Clínica General</h1>
                <p className="text-white/70 mb-6">AutaMedica — Plataforma de Telemedicina</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-white/50 text-xs mb-1">Paciente</p>
                    <p className="font-medium">{patientName}</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-xs mb-1">Fecha</p>
                    <p className="font-medium">{completedDate ?? new Date().toLocaleDateString('es-AR')}</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-xs mb-1">Secciones</p>
                    <p className="font-medium">{completedCount}/{totalCount}</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-xs mb-1">Verificación</p>
                    <div className="flex items-center gap-1.5">
                      <QrCode className="size-3.5" />
                      <span className="font-medium text-xs">Digital</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Collapsible Sections */}
              <div className="divide-y divide-neutral-100">
                {sections.map((section, i) => (
                  <SectionPreview
                    key={section.id}
                    section={section}
                    data={formData[section.id]}
                    defaultOpen={i < 3}
                  />
                ))}
              </div>

              {/* Footer Preview */}
              <div className="px-8 py-6 bg-neutral-50 border-t border-neutral-100">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>AutaMedica Precision Systems — {new Date().getFullYear()}</span>
                  <span>Documento con firma digital pendiente</span>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="border-t border-neutral-100 px-6 py-4 bg-white">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <motion.button
                  type="button"
                  onClick={onDownloadFull}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-neutral-900 text-white rounded-full font-medium hover:bg-neutral-800 transition-all disabled:opacity-50"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Download className="size-4" />
                  {saving ? 'Generando...' : 'Descargar PDF completo'}
                </motion.button>

                {onDownloadSummary && (
                  <motion.button
                    type="button"
                    onClick={onDownloadSummary}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 px-6 py-3.5 border border-neutral-200 text-neutral-700 rounded-full font-medium hover:border-neutral-900 transition-all disabled:opacity-50"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <FileText className="size-4" />
                    Resumen
                  </motion.button>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="p-3 border border-neutral-200 rounded-full hover:border-neutral-900 transition-all"
                    title="Enviar por email"
                  >
                    <Mail className="size-4 text-neutral-600" />
                  </button>
                  <button
                    type="button"
                    className="p-3 border border-neutral-200 rounded-full hover:border-neutral-900 transition-all"
                    title="Imprimir"
                    onClick={() => window.print()}
                  >
                    <Printer className="size-4 text-neutral-600" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
