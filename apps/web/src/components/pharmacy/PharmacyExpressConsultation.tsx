'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Stethoscope,
  Heart,
  Brain,
  Baby,
  Sparkles,
  Bone,
  Flame,
  Eye,
  Wind,
  Smile,
  Droplets,
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Phone,
  ChevronLeft,
  AlertCircle,
  FileText,
  ShieldCheck,
} from 'lucide-react'
import { UnifiedVideoCall, createCallProvider } from '@autamedica/telemedicine'
import { useGuestCallSession } from '@/hooks/calls/useGuestCallSession'
import {
  DISPATCH_TIERS,
  createPharmacyDispatchRequest,
  subscribeToDispatchRequest,
  getPharmacyDispatchRequestWithDoctor,
  finishPharmacyDispatchRequest,
  fetchDutyDoctorsSummary,
  computeTierWaitTime,
  type DispatchTierCategory,
  type DispatchRequest,
  type DispatchDoctorInfo,
} from '@/lib/pharmacy/pharmacy-on-demand.service'

interface PharmacyExpressConsultationProps {
  pharmacyName?: string
  pharmacyId?: string
  kioskId?: string
}

type Step = 'catalog' | 'identity' | 'radar' | 'call' | 'complete'

export function PharmacyExpressConsultation({
  pharmacyName = 'Farmacia Adherida',
  pharmacyId,
  kioskId,
}: PharmacyExpressConsultationProps) {
  // Step State
  const [currentStep, setCurrentStep] = useState<Step>('catalog')

  // Selection (default to 'general' - 80% of demand preselected)
  const [selectedTier, setSelectedTier] = useState<DispatchTierCategory>('general')

  // Patient Identity
  const [patientDni, setPatientDni] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [patientName, setPatientName] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Dispatch Request State
  const [activeRequest, setActiveRequest] = useState<DispatchRequest | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [matchedDoctor, setMatchedDoctor] = useState<DispatchDoctorInfo | null>(null)

  // Duty ETA state (realtime availability by tier)
  const [dutySummary, setDutySummary] = useState<Record<string, { online_count: number; free_count: number }>>({})

  // Selected Tier Object
  const currentTierObj = DISPATCH_TIERS.find((t) => t.id === selectedTier) || DISPATCH_TIERS[0]

  // Poll duty summary for real time ETA (avoid static marketing times)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const summary = await fetchDutyDoctorsSummary()
      if (alive) setDutySummary(summary)
    }
    void load()
    const timer = setInterval(load, 20000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const computedWaitText = useMemo(() => {
    const perTier = dutySummary[selectedTier]
    // If we have no live signal yet, fall back to the catalog SLA as a provisional estimate
    if (!perTier) return currentTierObj.defaultWaitText
    return computeTierWaitTime(perTier.free_count ?? 0, perTier.online_count ?? 0).text
  }, [dutySummary, selectedTier, currentTierObj])

  // Realtime subscription when request is created
  useEffect(() => {
    if (!activeRequest || !accessToken) return

    const unsubscribe = subscribeToDispatchRequest(activeRequest.id, async (updatedReq) => {
      setActiveRequest(updatedReq)

      if (updatedReq.status === 'matched' && updatedReq.assigned_doctor_id && !matchedDoctor) {
        // Resolve the real assigned doctor server-side (full_name is not readable by anon)
        const { doctor } = await getPharmacyDispatchRequestWithDoctor(updatedReq.id)
        setMatchedDoctor(doctor)
        setTimeout(() => {
          setCurrentStep('call')
        }, 1200)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [activeRequest, accessToken, matchedDoctor])

  // Handle Dispatch Creation
  const handleConfirmRequest = async () => {
    if (!patientDni.trim() || patientDni.trim().length < 6) {
      setInputError('Ingresa un número de documento válido')
      return
    }
    if (!patientPhone.trim() || patientPhone.trim().length < 8) {
      setInputError('Ingresa un número de teléfono celular con código de área')
      return
    }

    setInputError(null)
    setIsSubmitting(true)

    const result = await createPharmacyDispatchRequest({
      patientDni: patientDni.trim(),
      patientPhone: patientPhone.trim(),
      patientName: patientName.trim() || undefined,
      tier: selectedTier,
      pharmacyId,
      kioskId,
    })

    setIsSubmitting(false)

    if (result.success && result.data && result.accessToken) {
      setActiveRequest(result.data)
      setAccessToken(result.accessToken)
      setCurrentStep('radar')
    } else {
      setInputError(result.error || 'No se pudo generar la solicitud. Intenta nuevamente.')
    }
  }

  // End call from kiosk: mark request completed with call_ended_at
  const endCall = async () => {
    if (activeRequest) {
      await finishPharmacyDispatchRequest(activeRequest.id, {
        call_ended_at: new Date().toISOString(),
      })
    }
    setCurrentStep('complete')
  }

  // Map icon component
  const renderTierIcon = (tierId: DispatchTierCategory) => {
    switch (tierId) {
      case 'general':
        return <Stethoscope className="w-7 h-7 text-cyan-400" />
      case 'cardiologia':
        return <Heart className="w-7 h-7 text-rose-400" />
      case 'salud_mental':
        return <Brain className="w-7 h-7 text-purple-400" />
      case 'pediatria':
        return <Baby className="w-7 h-7 text-sky-400" />
      case 'dermatologia':
        return <Sparkles className="w-7 h-7 text-emerald-400" />
      case 'traumatologia':
        return <Bone className="w-7 h-7 text-amber-400" />
      case 'salud_femenina':
        return <Flame className="w-7 h-7 text-pink-400" />
      case 'oftalmo_otorrino':
        return <Eye className="w-7 h-7 text-teal-400" />
      case 'neumonologia':
        return <Wind className="w-7 h-7 text-blue-400" />
      case 'gastroenterologia':
        return <Smile className="w-7 h-7 text-orange-400" />
      case 'urologia':
        return <Droplets className="w-7 h-7 text-cyan-400" />
      case 'endocrinologia':
        return <Activity className="w-7 h-7 text-emerald-400" />
      default:
        return <Stethoscope className="w-7 h-7 text-cyan-400" />
    }
  }

  return (
    <div className="min-h-screen bg-[#070D1E] text-white flex flex-col font-sans select-none antialiased">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-[#0B152E]/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center font-bold text-cyan-400">
            ✚
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold tracking-tight text-white text-base">AUTAMEDICA</span>
              <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-semibold border border-emerald-500/30">
                ON-DEMAND
              </span>
            </div>
            <p className="text-xs text-slate-400">{pharmacyName}</p>
          </div>
        </div>

        {currentStep === 'catalog' && (
          <div className="flex items-center space-x-1.5 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/60 text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium">Médicos en Línea</span>
          </div>
        )}
      </header>

      {/* Content Body */}
      <main className="flex-1 flex flex-col max-w-xl w-full mx-auto p-4 pb-32">
        <AnimatePresence mode="wait">
          {/* STEP 1: CATALOG (Uber Ride Selector - Single Focal Layer) */}
          {currentStep === 'catalog' && (
            <motion.div
              key="catalog"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col space-y-3"
            >
              {/* Context Banner */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  ¿Qué atención médica necesitas hoy?
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  Atención inmediata con médicos matriculados y emisión de receta electrónica legal.
                </p>
              </div>

              {/* Single Scroll Vertical List (Cards >= 76px) */}
              <div className="flex flex-col space-y-2.5">
                {DISPATCH_TIERS.map((tier) => {
                  const isSelected = selectedTier === tier.id
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setSelectedTier(tier.id)}
                      className={`w-full min-h-[78px] p-3.5 rounded-2xl text-left transition-all duration-150 flex items-center justify-between border ${
                        isSelected
                          ? 'bg-cyan-950/40 border-cyan-400 shadow-[0_0_20px_rgba(0,235,255,0.15)] ring-1 ring-cyan-400/50'
                          : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 active:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center space-x-3.5">
                        {/* Radio Icon Indicator */}
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${
                            isSelected
                              ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                              : 'border-slate-600 bg-slate-800'
                          }`}
                        >
                          {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-slate-950" />}
                        </div>

                        {/* Specialty Icon */}
                        <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/50">
                          {renderTierIcon(tier.id)}
                        </div>

                        {/* Labels */}
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-bold text-white text-base leading-tight">
                              {tier.name}
                            </h3>
                            {tier.isPopularDefault && (
                              <span className="bg-cyan-500/20 text-cyan-300 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-cyan-500/30">
                                80% DEMANDA
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{tier.subtitle}</p>
                        </div>
                      </div>

                      {/* Wait Time SLA Badge */}
                      <div className="flex flex-col items-end shrink-0 pl-2">
                        <div className="flex items-center space-x-1 text-emerald-400 font-semibold text-xs bg-emerald-950/40 border border-emerald-500/30 px-2 py-1 rounded-full">
                          <Clock className="w-3 h-3" />
                          <span>
                            {dutySummary[tier.id]
                              ? computeTierWaitTime(
                                  dutySummary[tier.id]?.free_count ?? 0,
                                  dutySummary[tier.id]?.online_count ?? 0,
                                ).text
                              : tier.defaultWaitText}
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* STEP 2: IDENTITY (10 Seconds Form) */}
          {currentStep === 'identity' && (
            <motion.div
              key="identity"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col space-y-4"
            >
              <button
                type="button"
                onClick={() => setCurrentStep('catalog')}
                className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white py-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Volver al selector</span>
              </button>

              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
                  <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-400/30">
                    {renderTierIcon(selectedTier)}
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-lg leading-tight">
                      {currentTierObj.name}
                    </h2>
                    <p className="text-xs text-emerald-400 font-medium mt-0.5">
                      Espera estimada: {computedWaitText}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Número de Documento (DNI / Pasaporte) *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={patientDni}
                      onChange={(e) => setPatientDni(e.target.value)}
                      placeholder="Ej: 34892110"
                      className="w-full h-14 bg-slate-950 border border-slate-700 rounded-xl px-4 text-lg text-white font-mono tracking-wider focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors placeholder:text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Celular con WhatsApp (para recibir la receta) *
                    </label>
                    <div className="relative">
                      <Phone className="w-5 h-5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        inputMode="tel"
                        value={patientPhone}
                        onChange={(e) => setPatientPhone(e.target.value)}
                        placeholder="Ej: 11 3200 8844"
                        className="w-full h-14 bg-slate-950 border border-slate-700 rounded-xl pl-12 pr-4 text-lg text-white font-mono tracking-wider focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors placeholder:text-slate-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Nombre y Apellido (opcional)
                    </label>
                    <input
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      placeholder="Ej: Juan Pérez"
                      className="w-full h-12 bg-slate-950 border border-slate-700 rounded-xl px-4 text-base text-white focus:outline-none focus:border-cyan-400 transition-colors placeholder:text-slate-600"
                    />
                  </div>

                  {inputError && (
                    <div className="flex items-center space-x-2 text-rose-400 text-xs bg-rose-950/40 border border-rose-800/60 p-3 rounded-xl">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{inputError}</span>
                    </div>
                  )}

                  <div className="flex items-start space-x-2.5 pt-2 text-xs text-slate-400">
                    <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <span>
                      Receta electrónica oficial homologada con código de barras Farmalink y SISA
                      WS020 válida para dispensar en este mostrador.
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: RADAR (Matching Dispatch Screen) */}
          {currentStep === 'radar' && (
            <motion.div
              key="radar"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-8"
            >
              {/* Animated Radar Pulse */}
              <div className="relative flex items-center justify-center w-48 h-48">
                <div className="absolute w-48 h-48 rounded-full border border-cyan-500/20 animate-ping opacity-30" />
                <div className="absolute w-36 h-36 rounded-full border border-cyan-400/40 animate-pulse" />
                <div className="absolute w-24 h-24 rounded-full bg-cyan-500/10 border border-cyan-400/60" />
                <div className="relative z-10 w-16 h-16 rounded-full bg-cyan-500 flex items-center justify-center shadow-[0_0_30px_rgba(0,235,255,0.4)]">
                  {renderTierIcon(selectedTier)}
                </div>
              </div>

              {/* Status Text */}
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white tracking-tight">
                  Notificando médicos de guardia...
                </h2>
                <p className="text-sm text-slate-300 max-w-sm">
                  Despachando solicitud prioritaria para{' '}
                  <span className="font-bold text-cyan-400">{currentTierObj.name}</span>
                </p>
                <div className="inline-flex items-center space-x-1.5 text-xs text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-3 py-1 rounded-full mt-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Respuesta media: &lt; 15 segundos</span>
                </div>
              </div>

              {/* Doctor Card if Matched */}
              {matchedDoctor && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-slate-900 border border-cyan-400/50 rounded-2xl p-4 w-full max-w-sm shadow-[0_0_25px_rgba(0,235,255,0.2)] text-left"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-400 font-bold text-lg">
                      👨‍⚕️
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                        MÉDICO ASIGNADO
                      </span>
                      <h4 className="font-bold text-white text-base">{matchedDoctor.full_name}</h4>
                      <p className="text-xs text-slate-400">
                        {matchedDoctor.specialty} • ML {matchedDoctor.license_number}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-cyan-300">
                    <span>Conectando sala Cloudflare Calls...</span>
                    <span className="animate-pulse">●</span>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* STEP 4: CALL (Full-Bleed Cloudflare Calls Video Room — real SFU) */}
          {currentStep === 'call' && activeRequest && accessToken && (
            <motion.div
              key="call"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-950"
            >
              <KioskCallRoom
                roomId={activeRequest.cloudflare_room_id}
                accessToken={accessToken}
                doctorName={matchedDoctor?.full_name}
                onEnd={endCall}
              />
            </motion.div>
          )}

          {/* STEP 5: COMPLETE (Post-Call Receipt & Prescription) */}
          {currentStep === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-6"
            >
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white">Consulta Médica Completada</h2>
                <p className="text-sm text-slate-300 max-w-sm">
                  Tu receta electrónica homologada fue enviada a tu WhatsApp (+54 {patientPhone}) y
                  registrada en el sistema de la farmacia.
                </p>
              </div>

              {/* Prescription Voucher Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-sm text-left space-y-3">
                <div className="flex items-center space-x-2 text-cyan-400 text-xs font-bold uppercase tracking-wider">
                  <FileText className="w-4 h-4" />
                  <span>Comprobante de Receta Electrónica</span>
                </div>
                <div className="font-mono text-xs text-slate-300 space-y-1">
                  <div>
                    Paciente DNI: <span className="text-white">{patientDni}</span>
                  </div>
                  <div>
                    Médico: <span className="text-white">{matchedDoctor?.full_name || 'Médico AutaMedica'}</span>
                  </div>
                  <div>
                    Homologación: <span className="text-emerald-400">Farmalink / SISA WS020 OK</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-800 text-xs text-slate-400">
                  Podés solicitar tu medicación directamente en el mostrador indicando tu DNI.
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCurrentStep('catalog')
                  setActiveRequest(null)
                  setAccessToken(null)
                  setMatchedDoctor(null)
                  setPatientDni('')
                  setPatientPhone('')
                }}
                className="w-full max-w-sm h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors"
              >
                Volver al Inicio
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* STICKY BOTTOM ACTION BAR (The ONE Layer That Matters on the Street) */}
      {currentStep === 'catalog' && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#070D1E]/95 backdrop-blur-xl border-t border-slate-800/80 p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
          <div className="max-w-xl mx-auto flex flex-col space-y-2">
            <button
              type="button"
              onClick={() => setCurrentStep('identity')}
              className="w-full h-16 rounded-2xl bg-cyan-400 hover:bg-cyan-300 active:scale-[0.99] text-slate-950 font-black text-lg sm:text-xl flex items-center justify-center space-x-3 shadow-[0_0_25px_rgba(0,235,255,0.35)] transition-all"
            >
              <span>⚡ SOLICITAR {currentTierObj.name.toUpperCase()}</span>
              <ArrowRight className="w-6 h-6 stroke-[2.5]" />
            </button>
            <div className="flex items-center justify-center space-x-2 text-xs text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Espera estimada: {computedWaitText} • 1 solo toque</span>
            </div>
          </div>
        </div>
      )}

      {currentStep === 'identity' && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#070D1E]/95 backdrop-blur-xl border-t border-slate-800/80 p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
          <div className="max-w-xl mx-auto flex flex-col space-y-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleConfirmRequest}
              className="w-full h-16 rounded-2xl bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 active:scale-[0.99] text-slate-950 font-black text-lg sm:text-xl flex items-center justify-center space-x-3 shadow-[0_0_25px_rgba(16,185,129,0.35)] transition-all"
            >
              {isSubmitting ? (
                <span>Conectando...</span>
              ) : (
                <>
                  <span>🚀 CONECTAR CON MÉDICO YA MISMO</span>
                  <ArrowRight className="w-6 h-6 stroke-[2.5]" />
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-slate-400">
              Al presionar aceptas la emisión de receta digital bajo Ley 27.553.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Sala real Cloudflare Calls para el kiosco (guest): usa el mismo plano de
 * medios que las invitaciones guest (bootstrap firmado + proxy /api/calls/guest).
 */
function KioskCallRoom({
  roomId,
  accessToken,
  doctorName,
  onEnd,
}: {
  roomId: string
  accessToken: string
  doctorName?: string
  onEnd: () => void
}) {
  const { session: callSession, loading, error } = useGuestCallSession(roomId, accessToken, null)

  const callProvider = useMemo(
    () =>
      callSession
        ? createCallProvider({
            bootstrap: callSession,
          })
        : null,
    [callSession],
  )

  if (error) {
    return (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-center p-6">
        <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500 flex items-center justify-center text-rose-400 mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-white">No se pudo conectar</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-xs">{error}</p>
        <button
          type="button"
          onClick={onEnd}
          className="mt-6 h-12 px-6 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold"
        >
          Finalizar
        </button>
      </div>
    )
  }

  if (loading || !callSession || !callProvider) {
    return (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-center p-6">
        <div className="w-20 h-20 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin mb-5" />
        <h3 className="text-lg font-bold text-white">
          {doctorName ? `Conectando con ${doctorName}...` : 'Conectando con el médico...'}
        </h3>
        <p className="text-sm text-slate-400 mt-1">Sala Cloudflare Calls segura</p>
      </div>
    )
  }

  return (
    <UnifiedVideoCall
      provider={callProvider}
      roomId={callSession.roomId}
      callId={callSession.callId}
      userId={callSession.user.id}
      userType={callSession.user.role}
      userName={callSession.user.displayName}
      iceServers={callSession.transport.iceServers}
      theme="patient"
      onCallEnd={onEnd}
      autoStart
      runtime={callSession.runtime}
      className="h-screen"
    />
  )
}
