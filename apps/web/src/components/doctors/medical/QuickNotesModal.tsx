"use client"

import { useState } from 'react'
import type { JSX } from 'react'
import { X, Save, Clock, FileText, AlertCircle, ChevronDown } from 'lucide-react'
import { useMedicalHistoryStore } from '@/lib/doctors/stores/medicalHistoryStore'

interface QuickNotesModalProps {
  patientName: string
  patientId: string
  doctorId?: string
  onClose: () => void
}

const NOTE_TEMPLATES = [
  { id: 'subjective', label: 'Subjetivo (S)', placeholder: 'Síntomas reportados por el paciente...' },
  { id: 'objective', label: 'Objetivo (O)', placeholder: 'Hallazgos del examen físico...' },
  { id: 'assessment', label: 'Evaluación (A)', placeholder: 'Diagnóstico diferencial y evaluación clínica...' },
  { id: 'plan', label: 'Plan (P)', placeholder: 'Plan de tratamiento y seguimiento...' }
]

const QUICK_NOTES = [
  'Signos vitales estables',
  'Sin cambios desde última consulta',
  'Mejoría sintomática',
  'Requiere seguimiento',
  'Exámenes pendientes'
]

export function QuickNotesModal({ patientName, patientId, doctorId, onClose }: QuickNotesModalProps): JSX.Element {
  const { addEntry } = useMedicalHistoryStore()
  const [notes, setNotes] = useState<Record<string, string>>({
    subjective: '',
    objective: '',
    assessment: '',
    plan: ''
  })
  const [priority, setPriority] = useState<'normal' | 'high'>('normal')
  const [expandedSection, setExpandedSection] = useState<string>('subjective')

  const saveSoapNoteAndClose = async () => {
    const soapNote = `
NOTA SOAP - ${new Date().toLocaleDateString('es-ES')}

SUBJETIVO: ${notes.subjective || 'Sin datos'}

OBJETIVO: ${notes.objective || 'Sin datos'}

EVALUACIÓN: ${notes.assessment || 'Sin datos'}

PLAN: ${notes.plan || 'Sin datos'}

Prioridad: ${priority === 'high' ? 'ALTA' : 'Normal'}
    `.trim()

    await addEntry({
      type: 'note',
      content: soapNote,
      doctorId: doctorId || '',
      patientId,
      metadata: {}
    })

    onClose()
  }

  const handleQuickNote = (note: string) => {
    setNotes(prev => ({
      ...prev,
      [expandedSection]: prev[expandedSection] ? `${prev[expandedSection]}\n• ${note}` : `• ${note}`
    }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-am-surface-200 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-am-doctor-50">
              <FileText className="h-5 w-5 text-am-doctor-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-am-surface-900">Nota Médica SOAP</h2>
              <p className="text-xs text-am-surface-500">Paciente: {patientName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-am-surface-500 transition hover:bg-am-surface-100 hover:text-am-surface-800"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {/* Priority selector */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs text-am-surface-500">Prioridad:</span>
            <button
              type="button"
              onClick={() => setPriority('normal')}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                priority === 'normal'
                  ? 'bg-am-doctor-600 text-white'
                  : 'bg-am-surface-100 text-am-surface-500 hover:bg-am-surface-200'
              }`}
            >
              Normal
            </button>
            <button
              type="button"
              onClick={() => setPriority('high')}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                priority === 'high'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-am-surface-100 text-am-surface-500 hover:bg-am-surface-200'
              }`}
            >
              <AlertCircle className="mr-1 inline-block h-3 w-3" />
              Alta
            </button>
          </div>

          {/* SOAP sections */}
          <div className="space-y-3">
            {NOTE_TEMPLATES.map((template) => (
              <div
                key={template.id}
                className={`rounded-lg border transition-colors ${
                  expandedSection === template.id
                    ? 'border-blue-300 bg-am-doctor-50'
                    : 'border-am-surface-200 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedSection(template.id)}
                  className="flex w-full items-center justify-between p-3 text-left"
                >
                  <span className="text-sm font-medium text-am-surface-800">{template.label}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-am-surface-500 transition-transform ${
                      expandedSection === template.id ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {expandedSection === template.id && (
                  <div className="border-t border-am-surface-200 p-3">
                    <textarea
                      value={notes[template.id]}
                      onChange={(e) => setNotes(prev => ({ ...prev, [template.id]: e.target.value }))}
                      placeholder={template.placeholder}
                      className="min-h-[100px] w-full resize-none rounded-lg border border-am-surface-300 bg-white p-3 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick notes */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-am-surface-500">Notas rápidas:</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_NOTES.map((note) => (
                <button
                  key={note}
                  type="button"
                  onClick={() => handleQuickNote(note)}
                  className="rounded-lg border border-am-surface-200 bg-am-surface-50 px-2 py-1 text-xs text-am-surface-700 transition hover:border-blue-300 hover:bg-am-doctor-50 hover:text-am-doctor-600"
                >
                  {note}
                </button>
              ))}
            </div>
          </div>

          {/* Timestamp */}
          <div className="mt-4 flex items-center gap-2 text-xs text-am-surface-400">
            <Clock className="h-3 w-3" />
            <span>{new Date().toLocaleString('es-ES')}</span>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-3 border-t border-am-surface-200 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-am-surface-200 bg-transparent px-4 py-2 text-sm text-am-surface-700 transition hover:bg-am-surface-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={saveSoapNoteAndClose}
            className="flex items-center gap-2 rounded-lg bg-am-doctor-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-am-doctor-700"
          >
            <Save className="h-4 w-4" />
            Guardar nota
          </button>
        </footer>
      </div>
    </div>
  )
}
