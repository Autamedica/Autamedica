'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, ArrowLeft, MessageCircle, Mic, Check,
  ChevronRight, X, FileText, Calendar, Heart, Brain,
  Pause, Play, Square, Volume2, MicOff, Bot,
} from 'lucide-react'
import { useAnamnesisFlow } from '@/hooks/patients/useAnamnesisFlow'
import { anamnesisSteps } from '@/lib/patients/data/anamnesis-steps'
import { ConversationalAnamnesis } from '@/components/patients/anamnesis/ConversationalAnamnesis'
import { VoiceAnamnesis } from '@/components/patients/anamnesis/VoiceAnamnesis'
import { AnalysisResultOverlay } from '@/components/patients/anamnesis/AnalysisResultOverlay'
import { AnamnesisChatModal } from '@/components/patients/anamnesis/AnamnesisChatModal'
import { AnamnesisFlowTour } from '@/components/patients/tours/AnamnesisFlowTour'

const SECTION_SHORT_LABELS: Record<string, string> = {
  edad: 'Edad', ocupacion: 'Trabajo', motivo_consulta: 'Motivo',
  enfermedades_previas: 'Enfermedades', medicamentos: 'Medicamentos',
  alergias: 'Alergias', antecedentes_familiares: 'Familia',
  habitos: 'Hábitos', cardiovascular: 'Corazón', respiratorio: 'Pulmones',
  digestivo: 'Digestivo', genitourinario: 'Urinario', resumen_final: 'Resumen',
}

const CATEGORY_LABELS: Record<string, string> = {
  filiacion: 'Filiación', motivo_consulta: 'Motivo consulta',
  antecedentes: 'Antecedentes', habitos: 'Estilo de vida',
  sistemas: 'Aparatos/Sistemas', cierre: 'Cierre',
}

const UPDATE_PICKER_OPTIONS = [
  { id: 'motivo_consulta', label: 'Nuevo motivo de consulta' },
  { id: 'medicamentos', label: 'Medicamentos' },
  { id: 'alergias', label: 'Alergias' },
  { id: 'enfermedades_previas', label: 'Enfermedades' },
  { id: 'habitos', label: 'Hábitos' },
  { id: 'cardiovascular', label: 'Síntomas cardiovasculares' },
] as const

// ── Field Renderer ──

function FieldRenderer({ field, value, onChange }: {
  field: { id: string; label: string; type: string; placeholder?: string; options?: Array<{ value: string; label: string }> };
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const [selectedOptions, setSelectedOptions] = useState<string[]>(
    Array.isArray(value) ? value : []
  )

  if (field.type === 'date') {
    return (
      <div>
        <label className="block text-sm text-neutral-700 mb-2">{field.label}</label>
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-4 border border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900 transition-colors text-lg"
        />
      </div>
    )
  }

  if (field.type === 'text' || field.type === 'number') {
    return (
      <div>
        <label className="block text-sm text-neutral-700 mb-2">{field.label}</label>
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          placeholder={field.placeholder}
          value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
          onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
          className="w-full px-4 py-4 border border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900 transition-colors"
        />
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div>
        <label className="block text-sm text-neutral-700 mb-2">{field.label}</label>
        <textarea
          rows={4}
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-4 border border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900 transition-colors resize-none"
        />
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div>
        <label className="block text-sm text-neutral-700 mb-2">{field.label}</label>
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-4 border border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900 transition-colors"
        >
          <option value="">Seleccionar...</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
    )
  }

  if (field.type === 'multiselect') {
    const toggleOption = (optionValue: string) => {
      const newSelection = selectedOptions.includes(optionValue)
        ? selectedOptions.filter(o => o !== optionValue)
        : [...selectedOptions, optionValue]
      setSelectedOptions(newSelection)
      onChange(newSelection)
    }

    return (
      <div>
        <label className="block text-sm text-neutral-700 mb-4">{field.label}</label>
        <div className="space-y-2">
          {field.options?.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleOption(option.value)}
              className={`w-full p-4 rounded-xl text-left transition-all border-2 ${
                selectedOptions.includes(option.value)
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 hover:border-neutral-300'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (field.type === 'boolean') {
    return (
      <div>
        <label className="block text-sm text-neutral-700 mb-2">{field.label}</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`flex-1 py-4 border-2 rounded-xl transition-all ${
              value === true ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:border-neutral-900'
            }`}
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`flex-1 py-4 border-2 rounded-xl transition-all ${
              value === false ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:border-neutral-900'
            }`}
          >
            No
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ── Main Component ──

export default function AnamnesisPage() {
  const {
    user, guidance, currentStepIndex, currentStep, formData,
    visibleFields, pageView, completionPct, isFirstStep, isLastStep,
    isExtracting, isStepCarriedForward, editingCarriedStep, saving,
    saveError, showClarification, pendingCheckpoint, anamnesisMode,
    showAnalyzing, analysisResult, showUpdatePicker, showVoiceChat,
    editMode, anamnesisError, anamnesis, progress,
    updateSection, updateAnamnesis, setEditingCarriedStep,
    setShowClarification, setShowUpdatePicker, setShowVoiceChat,
    switchMode, handleFieldChange, handlePrev, handleNext,
    handleAcceptPrivacy, handleAnalysisContinue, handleGeneratePdf,
    handleClarificationComplete, handleVoiceDataExtracted,
    handleVoiceSwitchToText, selectUpdateSection, handleExitWizard,
  } = useAnamnesisFlow()

  // ── LOADING ──

  if (pageView === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="size-16 rounded-full bg-neutral-900 flex items-center justify-center mx-auto mb-6"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Heart className="size-8 text-white" />
          </motion.div>
          <p className="text-neutral-500">Cargando tu historia general...</p>
        </motion.div>
      </div>
    )
  }

  // ── LOCKED ──

  if (pageView === 'locked') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <motion.div
          className="max-w-md text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="size-20 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-8">
            <FileText className="size-10 text-neutral-400" />
          </div>
          <h1 className="text-3xl text-neutral-900 mb-4">Historia en revisión</h1>
          <p className="text-neutral-500 mb-8">Tu historia clínica está siendo revisada por tu equipo médico.</p>
          <a
            href="/patients/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 border border-neutral-200 rounded-full text-neutral-700 hover:border-neutral-900 transition-all"
          >
            <ArrowLeft className="size-4" /> Volver al panel
          </a>
        </motion.div>
      </div>
    )
  }

  // ── VOICE ──

  if (showVoiceChat) {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-50 bg-white border-b border-neutral-100">
          <div className="max-w-7xl mx-auto px-6 lg:px-12 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-lg font-medium text-neutral-900">AutaMedica</span>
              <button
                type="button"
                onClick={handleVoiceSwitchToText}
                className="p-2 hover:bg-neutral-50 rounded-lg transition-colors hidden sm:flex items-center gap-2 text-sm text-neutral-600"
              >
                <MessageCircle className="size-4" /> Modo formulario
              </button>
            </div>
            <button type="button" onClick={handleExitWizard} className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
              Guardar y salir
            </button>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-6 py-16 lg:py-24">
          <VoiceAnamnesis
            onDataExtracted={handleVoiceDataExtracted}
            onSwitchToText={handleVoiceSwitchToText}
            guidance={guidance}
            checkpoint={pendingCheckpoint ?? undefined}
            ledgerContext={{
              patientId: user?.id ?? '',
              caseId: anamnesis?.id ?? 'general',
              workflowType: 'general_anamnesis',
              segment: currentStep?.id
            }}
          />
        </main>
      </div>
    )
  }

  // ── COMPLETED ──

  if (pageView === 'completed') {
    const completedSections = progress?.completedSections ?? []

    return (
      <div className="min-h-screen bg-white">
        <section className="relative h-[50vh] overflow-hidden bg-neutral-900 flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
          <motion.div
            className="relative z-10 text-center px-6"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <motion.div
              className="size-24 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-8"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.2 }}
            >
              <Check className="size-12 text-white" />
            </motion.div>
            <motion.h1
              className="text-5xl lg:text-6xl text-white mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              Historia completada
            </motion.h1>
            <motion.p
              className="text-lg text-white/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Ya podés acceder a todos nuestros servicios
            </motion.p>
          </motion.div>
        </section>

        <section className="max-w-7xl mx-auto px-6 lg:px-12 -mt-12 pb-24">
          <motion.button
            type="button"
            onClick={() => handleGeneratePdf()}
            disabled={saving}
            className="group w-full max-w-2xl mx-auto mb-16 py-6 bg-sky-500 text-white rounded-2xl text-lg font-medium hover:bg-sky-600 transition-all flex items-center justify-center gap-3 shadow-xl shadow-sky-500/20 disabled:opacity-50"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <FileText className="size-6" />
            Descargar PDF
            <ArrowRight className="size-5 group-hover:translate-x-1 transition-transform" />
          </motion.button>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
            {[
              { icon: Brain, label: 'Actualizar', color: 'neutral' as const, onClick: () => setShowUpdatePicker(true) },
              { icon: Mic, label: 'Hablar', color: 'sky' as const, onClick: () => setShowVoiceChat(true) },
              { icon: Heart, label: 'Mi panel', color: 'neutral' as const, href: '/patients/dashboard' },
              { icon: Calendar, label: 'Consultar', color: 'sky' as const, href: '/patients/appointments?type=telemedicine' },
            ].map((action, i) => {
              const Component = action.href ? 'a' : 'button'
              return (
                <motion.div
                  key={action.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + i * 0.1 }}
                  whileHover={{ y: -4 }}
                >
                  <Component
                    {...(action.href ? { href: action.href } : { type: 'button' as const, onClick: action.onClick })}
                    className={`group block w-full p-8 rounded-2xl text-left transition-all border ${
                      action.color === 'sky'
                        ? 'bg-sky-500 border-sky-600 text-white hover:bg-sky-600'
                        : 'bg-white border-neutral-200 hover:border-neutral-900 hover:bg-neutral-50'
                    }`}
                  >
                    <action.icon className={`size-10 mb-6 ${
                      action.color === 'sky' ? 'text-white' : 'text-neutral-400 group-hover:text-neutral-900'
                    }`} />
                    <p className={`text-lg ${action.color === 'sky' ? 'text-white' : 'text-neutral-900'}`}>
                      {action.label}
                    </p>
                  </Component>
                </motion.div>
              )
            })}
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            <h2 className="text-2xl text-neutral-900 mb-6">Secciones completadas</h2>
            <div className="flex flex-wrap gap-3">
              {anamnesisSteps.map((step) => {
                const isComplete = completedSections.includes(step.id)
                return (
                  <span
                    key={step.id}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium ${
                      isComplete ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {isComplete && <Check className="size-3.5" />}
                    {SECTION_SHORT_LABELS[step.id] ?? step.id}
                  </span>
                )
              })}
            </div>
          </motion.div>

          {saveError && (
            <div className="mt-6 rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">{saveError}</div>
          )}
        </section>

        {/* Update Picker */}
        <AnimatePresence>
          {showUpdatePicker && (
            <>
              <motion.div
                className="fixed inset-0 bg-neutral-900/50 backdrop-blur-sm z-40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowUpdatePicker(false)}
              />
              <motion.div
                className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-h-[80vh] overflow-y-auto"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
              >
                <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
                  <h3 className="text-xl font-medium text-neutral-900">¿Qué querés actualizar?</h3>
                  <button type="button" onClick={() => setShowUpdatePicker(false)} className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
                    <X className="size-5 text-neutral-600" />
                  </button>
                </div>
                <div className="p-6 space-y-3">
                  {UPDATE_PICKER_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="group w-full p-4 border border-neutral-200 rounded-xl hover:border-neutral-900 transition-all text-left flex items-center justify-between"
                      onClick={() => selectUpdateSection(option.id)}
                    >
                      <span className="text-neutral-900">{option.label}</span>
                      <ChevronRight className="size-5 text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all" />
                    </button>
                  ))}
                  <button
                    type="button"
                    className="group w-full p-4 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-all text-center font-medium"
                    onClick={() => selectUpdateSection('edad')}
                  >
                    Revisar todo desde el inicio
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ── PRIVACY ──

  if (pageView === 'privacy') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <motion.div
          className="max-w-2xl w-full"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            className="size-20 rounded-full bg-neutral-900 flex items-center justify-center mx-auto mb-12"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.2, duration: 0.6 }}
          >
            <Heart className="size-10 text-white" />
          </motion.div>

          <motion.h1 className="text-5xl lg:text-6xl text-neutral-900 text-center mb-6 leading-tight" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            Tu historia clínica
          </motion.h1>

          <motion.p className="text-lg text-neutral-500 text-center mb-16 max-w-lg mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
            Necesitamos conocer tu historial médico para ofrecerte la mejor atención. Toda la información es confidencial y protegida.
          </motion.p>

          <motion.div className="space-y-6 mb-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            {[
              { title: 'Protección de datos', sub: 'Cumplimos con GDPR y normativas de salud' },
              { title: 'Acceso controlado', sub: 'Solo profesionales autorizados pueden ver tu historia' },
              { title: 'Control total', sub: 'Puedes actualizar o eliminar tus datos en cualquier momento' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4">
                <div className="size-6 rounded-full bg-neutral-900 flex items-center justify-center shrink-0 mt-1">
                  <Check className="size-4 text-white" />
                </div>
                <div>
                  <p className="text-neutral-900 mb-1">{item.title}</p>
                  <p className="text-sm text-neutral-500">{item.sub}</p>
                </div>
              </div>
            ))}
          </motion.div>

          <motion.button
            type="button"
            onClick={handleAcceptPrivacy}
            disabled={saving}
            className="group w-full py-5 bg-neutral-900 text-white rounded-full text-lg font-medium hover:bg-neutral-800 transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Aceptar y continuar
            <ArrowRight className="size-5 group-hover:translate-x-1 transition-transform" />
          </motion.button>

          <motion.p className="text-center text-sm text-neutral-400 mt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
            Al continuar, aceptas nuestra política de privacidad
          </motion.p>

          {anamnesisError && (
            <p className="mt-4 text-center text-sm text-red-600">{anamnesisError}</p>
          )}
        </motion.div>
      </div>
    )
  }

  // ── CONVERSATIONAL ──

  if (anamnesisMode === 'conversational' && !editMode) {
    return (
      <ConversationalAnamnesis
        initialData={formData}
        onComplete={() => { window.location.reload() }}
        onSwitchMode={() => switchMode('wizard')}
        updateSection={updateSection}
        updateAnamnesis={updateAnamnesis as (update: Record<string, unknown>) => Promise<boolean>}
      />
    )
  }

  // ── WIZARD ──

  if (!currentStep) return null

  const categoryLabel = CATEGORY_LABELS[currentStep.category] ?? currentStep.category

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-lg font-medium text-neutral-900">AutaMedica</span>
              <button
                type="button"
                onClick={() => switchMode('conversational')}
                className="p-2 hover:bg-neutral-50 rounded-lg transition-colors hidden sm:flex items-center gap-2 text-sm text-neutral-600"
              >
                <MessageCircle className="size-4" /> Modo conversacional
              </button>
              <button
                type="button"
                onClick={() => setShowVoiceChat(true)}
                className="p-2 hover:bg-neutral-50 rounded-lg transition-colors hidden sm:flex items-center gap-2 text-sm text-neutral-600"
              >
                <Mic className="size-4" /> Modo voz
              </button>
            </div>
            <button type="button" onClick={handleExitWizard} className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
              {editMode ? 'Volver al resumen' : 'Guardar y salir'}
            </button>
          </div>

          {/* Progress */}
          <div className="py-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-neutral-500">Paso {currentStepIndex + 1} de {anamnesisSteps.length}</span>
              <span className="text-sm text-neutral-900 tabular-nums font-medium">{Math.round(completionPct)}%</span>
            </div>
            <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-sky-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${completionPct}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-16 lg:py-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStepIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="inline-flex items-center px-3 py-1.5 bg-neutral-100 text-neutral-700 rounded-full text-xs font-medium mb-8"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
            >
              {categoryLabel}
            </motion.div>

            <motion.h1
              className="text-4xl lg:text-5xl text-neutral-900 mb-6 leading-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {currentStep.title}
            </motion.h1>

            <motion.p
              className="text-lg text-neutral-500 mb-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {currentStep.subtitle}
            </motion.p>

            {/* Carried forward preview */}
            {isStepCarriedForward && !editingCarriedStep ? (
              <motion.div
                className="space-y-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <div className="border border-neutral-200 rounded-2xl overflow-hidden">
                  <div className="border-b border-neutral-100 px-6 py-4">
                    <p className="text-sm font-medium text-neutral-800">
                      {currentStep.mutability === 'carry_forward_additive' ? 'Datos anteriores — ¿hay algo nuevo?' : 'Datos anteriores — ¿cambió algo?'}
                    </p>
                  </div>
                  <div className="divide-y divide-neutral-100 px-6">
                    {currentStep.fields.filter(f => formData[currentStep.id]?.[f.id] != null).map(f => {
                      const val = formData[currentStep.id]?.[f.id]
                      const display = val === true ? 'Sí' : val === false ? 'No'
                        : Array.isArray(val) ? (val as string[]).join(', ') || 'Ninguno'
                        : String(val ?? '')
                      return (
                        <div key={f.id} className="flex items-center justify-between py-4">
                          <span className="text-neutral-500">{f.label}</span>
                          <span className="max-w-[55%] truncate text-right font-medium text-neutral-900">{display}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="flex gap-3">
                  <motion.button
                    type="button"
                    onClick={() => setEditingCarriedStep(true)}
                    className="flex-1 px-6 py-4 border border-neutral-200 text-neutral-900 rounded-full font-medium hover:border-neutral-900 transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {currentStep.mutability === 'carry_forward_additive' ? 'Sí, agregar datos' : 'Sí, actualizar'}
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={handleNext}
                    className="flex-1 px-6 py-4 bg-neutral-900 text-white rounded-full font-medium hover:bg-neutral-800 transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    No cambió nada
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                className="space-y-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                {visibleFields.map((field) => (
                  <FieldRenderer
                    key={field.id}
                    field={field}
                    value={formData[currentStep.id]?.[field.id] ?? null}
                    onChange={(val) => handleFieldChange(field.id, val as never)}
                  />
                ))}
              </motion.div>
            )}

            {saveError && (
              <p className="mt-4 text-center text-sm text-red-600">{saveError}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer Navigation */}
      <footer className="sticky bottom-0 bg-white border-t border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-6 flex items-center justify-between gap-4">
          <motion.button
            type="button"
            onClick={handlePrev}
            disabled={isFirstStep || saving}
            className="px-6 py-3 border border-neutral-200 text-neutral-900 rounded-full font-medium hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            whileHover={{ scale: isFirstStep ? 1 : 1.02 }}
            whileTap={{ scale: isFirstStep ? 1 : 0.98 }}
          >
            <ArrowLeft className="size-4" /> Anterior
          </motion.button>

          <motion.button
            type="button"
            onClick={handleNext}
            disabled={saving}
            className="group px-8 py-3 bg-neutral-900 text-white rounded-full font-medium hover:bg-neutral-800 transition-all flex items-center gap-2 disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isLastStep ? 'Finalizar' : 'Siguiente'}
            {isLastStep ? <Check className="size-4" /> : <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" />}
          </motion.button>
        </div>
      </footer>

      {/* Overlays */}
      {showAnalyzing && (
        <AnalysisResultOverlay
          analysisResult={analysisResult}
          onContinue={handleAnalysisContinue}
          isFinal={pendingCheckpoint === 'final'}
          preferVoice={pendingCheckpoint === 'partial'}
        />
      )}

      {showClarification && guidance && (
        <AnamnesisChatModal
          checkpoint={pendingCheckpoint || 'partial'}
          guidance={guidance}
          onClose={() => setShowClarification(false)}
          onComplete={(turns) => { void handleClarificationComplete(turns) }}
        />
      )}

      {pageView === 'wizard' && user && (
        <AnamnesisFlowTour autoStart currentStep={currentStepIndex} />
      )}
    </div>
  )
}
