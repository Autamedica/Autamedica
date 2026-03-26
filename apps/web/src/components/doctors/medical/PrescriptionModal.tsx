"use client"

import { useState } from 'react'
import type { JSX } from 'react'
import { X, Save, Clock, Pill, AlertCircle, Plus, Trash2 } from 'lucide-react'
import { useMedicalHistoryStore } from '@/lib/doctors/stores/medicalHistoryStore'
import { usePrescriptions } from '@/hooks/doctors/usePrescriptions'

interface PrescriptionModalProps {
  patientName: string
  patientId: string
  onClose: () => void
}

interface Medication {
  id: string
  name: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
}

const FREQUENCY_OPTIONS = [
  'Cada 4 horas',
  'Cada 6 horas',
  'Cada 8 horas',
  'Cada 12 horas',
  'Cada 24 horas',
  'Antes de las comidas',
  'Después de las comidas',
  'Al acostarse'
]

const DURATION_OPTIONS = [
  '3 días',
  '5 días',
  '7 días',
  '10 días',
  '14 días',
  '21 días',
  '30 días',
  'Hasta nueva orden'
]

const COMMON_MEDICATIONS = [
  { name: 'Ibuprofeno', dosage: '400mg' },
  { name: 'Paracetamol', dosage: '500mg' },
  { name: 'Amoxicilina', dosage: '500mg' },
  { name: 'Omeprazol', dosage: '20mg' },
  { name: 'Loratadina', dosage: '10mg' },
  { name: 'Metformina', dosage: '850mg' }
]

export function PrescriptionModal({ patientName, patientId, onClose }: PrescriptionModalProps): JSX.Element {
  const { suggestPrescriptions } = useMedicalHistoryStore()
  const { addPrescription } = usePrescriptions(patientId as never)
  const [medications, setMedications] = useState<Medication[]>([
    {
      id: crypto.randomUUID(),
      name: '',
      dosage: '',
      frequency: 'Cada 8 horas',
      duration: '7 días',
      instructions: ''
    }
  ])
  const [diagnosis, setDiagnosis] = useState('')
  const [generalInstructions, setGeneralInstructions] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const addMedication = () => {
    setMedications(prev => [...prev, {
      id: crypto.randomUUID(),
      name: '',
      dosage: '',
      frequency: 'Cada 8 horas',
      duration: '7 días',
      instructions: ''
    }])
  }

  const removeMedication = (id: string) => {
    setMedications(prev => prev.filter(med => med.id !== id))
  }

  const updateMedication = (id: string, field: keyof Medication, value: string) => {
    setMedications(prev => prev.map(med =>
      med.id === id ? { ...med, [field]: value } : med
    ))
  }

  const handleQuickMedication = (medication: typeof COMMON_MEDICATIONS[0], medId: string) => {
    updateMedication(medId, 'name', medication.name)
    updateMedication(medId, 'dosage', medication.dosage)
  }

  const handleGetSuggestions = async () => {
    if (!diagnosis) return

    setShowSuggestions(true)
    const suggestions = await suggestPrescriptions(diagnosis)
    setAiSuggestions(suggestions)
  }

  const savePrescription = async () => {
    const normalizedMedications = medications.filter((med) => med.name.trim())

    if (normalizedMedications.length === 0) {
      setSaveError('Agregá al menos un medicamento antes de guardar.')
      return
    }

    setSaving(true)
    setSaveError(null)

    try {
      const primaryMedication = normalizedMedications[0] ?? { name: '', dosage: '', frequency: '', duration: '', instructions: '' }
      const now = new Date().toISOString()

      await addPrescription({
        patient_id: patientId as never,
        doctor_id: '' as never,
        medical_record_id: null,
        medication_name: primaryMedication.name,
        dosage: primaryMedication.dosage,
        frequency: primaryMedication.frequency,
        duration: primaryMedication.duration,
        instructions: [
          primaryMedication.instructions.trim(),
          generalInstructions.trim() ? `Indicaciones generales: ${generalInstructions.trim()}` : ''
        ].filter(Boolean).join('\n'),
        status: 'activa',
        prescribed_date: now,
        start_date: now,
        end_date: null,
        notes: diagnosis.trim() ? `Diagnóstico: ${diagnosis.trim()}` : null,
        side_effects_warning: null,
      })

      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la prescripción.'
      setSaveError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-am-surface-200 bg-white shadow-2xl">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-am-surface-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-am-doctor-50">
              <Pill className="h-5 w-5 text-am-doctor-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-am-surface-900">Prescripción Médica</h2>
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
        <div className="p-4 space-y-4">
          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {saveError}
            </div>
          )}

          {/* Diagnóstico */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-am-surface-500">Diagnóstico</label>
            <div className="flex gap-2">
              <input
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="Ingrese el diagnóstico del paciente"
                className="flex-1 rounded-lg border border-am-surface-300 bg-white p-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
              />
              <button
                type="button"
                onClick={handleGetSuggestions}
                className="rounded-lg bg-am-doctor-50 px-3 py-2 text-xs font-medium text-am-doctor-700 transition hover:bg-am-doctor-100"
              >
                Sugerir con IA
              </button>
            </div>
          </div>

          {/* Sugerencias IA */}
          {showSuggestions && aiSuggestions.length > 0 && (
            <div className="rounded-lg border border-am-doctor-200 bg-am-doctor-50 p-3">
              <p className="text-xs font-medium text-am-doctor-700 mb-2">Sugerencias de IA:</p>
              <div className="space-y-1">
                {aiSuggestions.map((suggestion, idx) => (
                  <p key={idx} className="text-xs text-am-doctor-600">• {suggestion}</p>
                ))}
              </div>
            </div>
          )}

          {/* Medicamentos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-am-surface-500">Medicamentos</label>
              <button
                type="button"
                onClick={addMedication}
                className="flex items-center gap-1 rounded-lg bg-am-doctor-50 px-2 py-1 text-xs font-medium text-am-doctor-700 transition hover:bg-am-doctor-100"
              >
                <Plus className="h-3 w-3" />
                Agregar
              </button>
            </div>

            {medications.map((med, index) => (
              <div key={med.id} className="rounded-lg border border-am-surface-200 bg-white p-3 space-y-3">
                {/* Header del medicamento */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-am-surface-700">Medicamento {index + 1}</span>
                  {medications.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMedication(med.id)}
                      className="rounded p-1 text-rose-600 transition hover:bg-rose-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Nombre y dosis */}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={med.name}
                    onChange={(e) => updateMedication(med.id, 'name', e.target.value)}
                    placeholder="Nombre del medicamento"
                    className="rounded-lg border border-am-surface-300 bg-white p-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
                  />
                  <input
                    value={med.dosage}
                    onChange={(e) => updateMedication(med.id, 'dosage', e.target.value)}
                    placeholder="Dosis (ej: 500mg)"
                    className="rounded-lg border border-am-surface-300 bg-white p-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
                  />
                </div>

                {/* Medicamentos rápidos */}
                <div className="flex flex-wrap gap-1">
                  {COMMON_MEDICATIONS.map((commonMed) => (
                    <button
                      key={commonMed.name}
                      type="button"
                      onClick={() => handleQuickMedication(commonMed, med.id)}
                      className="rounded-md border border-am-surface-200 bg-am-surface-50 px-2 py-1 text-xs text-am-surface-700 transition hover:border-blue-400 hover:bg-am-doctor-50 hover:text-am-doctor-700"
                    >
                      {commonMed.name}
                    </button>
                  ))}
                </div>

                {/* Frecuencia y duración */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={med.frequency}
                    onChange={(e) => updateMedication(med.id, 'frequency', e.target.value)}
                    className="rounded-lg border border-am-surface-300 bg-white p-2 text-sm text-am-surface-900 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
                  >
                    {FREQUENCY_OPTIONS.map(freq => (
                      <option key={freq} value={freq}>{freq}</option>
                    ))}
                  </select>
                  <select
                    value={med.duration}
                    onChange={(e) => updateMedication(med.id, 'duration', e.target.value)}
                    className="rounded-lg border border-am-surface-300 bg-white p-2 text-sm text-am-surface-900 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
                  >
                    {DURATION_OPTIONS.map(dur => (
                      <option key={dur} value={dur}>{dur}</option>
                    ))}
                  </select>
                </div>

                {/* Instrucciones específicas */}
                <textarea
                  value={med.instructions}
                  onChange={(e) => updateMedication(med.id, 'instructions', e.target.value)}
                  placeholder="Instrucciones específicas (opcional)"
                  className="min-h-[60px] w-full resize-none rounded-lg border border-am-surface-300 bg-white p-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
                />
              </div>
            ))}
          </div>

          {/* Instrucciones generales */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-am-surface-500">Instrucciones generales</label>
            <textarea
              value={generalInstructions}
              onChange={(e) => setGeneralInstructions(e.target.value)}
              placeholder="Reposo, hidratación, dieta, contraindicaciones..."
              className="min-h-[80px] w-full resize-none rounded-lg border border-am-surface-300 bg-white p-3 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
            />
          </div>

          {/* Timestamp */}
          <div className="flex items-center gap-2 text-xs text-am-surface-400">
            <Clock className="h-3 w-3" />
            <span>{new Date().toLocaleString('es-ES')}</span>
          </div>
        </div>

        {/* Footer */}
        <footer className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-am-surface-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-amber-700">
            <AlertCircle className="h-3 w-3" />
            <span>Verifique alergias y contraindicaciones</span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-am-surface-200 bg-transparent px-4 py-2 text-sm text-am-surface-700 transition hover:bg-am-surface-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={savePrescription}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-am-doctor-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-am-doctor-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Guardando...' : 'Guardar prescripción'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
