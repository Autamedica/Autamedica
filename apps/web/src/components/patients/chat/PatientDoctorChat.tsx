'use client'

import { useState, useRef, useEffect } from 'react'
import { useChat } from '@/hooks/doctors/useChat'
import { Send, Loader2, User, Stethoscope, MessageSquare, X, Minus } from 'lucide-react'
import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { chatRepo, type AssignedChatDoctor } from '@/lib/doctors/lib/repos/chat'
import { motion, AnimatePresence } from 'framer-motion'

export function PatientDoctorChat() {
  const { patient } = usePatientSession()
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [input, setInput] = useState('')
  const [assignedDoctor, setAssignedDoctor] = useState<AssignedChatDoctor | null>(null)
  const [doctorLoading, setDoctorLoading] = useState(false)
  const [doctorError, setDoctorError] = useState<string | null>(null)
  const doctorId = assignedDoctor?.doctorId ?? ''
  
  const { messages, loading, sending, error, sendMessage } = useChat({
    patientId: patient?.id || "",
    doctorId: doctorId,
    caseId: "general_followup",
    role: 'patient'
  })
  
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!patient?.id) return

    let cancelled = false
    setDoctorLoading(true)
    setDoctorError(null)
    setAssignedDoctor(null)

    chatRepo.getAssignedDoctor(patient.id)
      .then((doctor) => {
        if (!cancelled) setAssignedDoctor(doctor)
      })
      .catch(() => {
        if (!cancelled) setDoctorError('No pudimos encontrar tu médico asignado.')
      })
      .finally(() => {
        if (!cancelled) setDoctorLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [patient?.id])

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen, isMinimized])

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || sending || !doctorId) return
    const text = input
    setInput('')
    try {
      await sendMessage(text)
    } catch {
      setInput(text)
    }
  }

  if (!patient) return null

  return (
    <>
      {/* Floating Button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={() => { setIsOpen(true); setIsMinimized(false) }}
        aria-label="Abrir chat con tu médico"
        className={`fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-stone-900 text-white shadow-2xl transition-all hover:bg-stone-800 sm:right-6 ${isOpen ? 'hidden' : 'flex'}`}
      >
        <MessageSquare className="h-6 w-6" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full border-2 border-white text-[10px] flex items-center justify-center font-bold">
            !
          </span>
        )}
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className={`fixed inset-x-3 bottom-20 z-50 flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl transition-all sm:inset-x-auto sm:right-6 sm:bottom-24 sm:w-96 ${isMinimized ? 'h-14' : 'h-[min(520px,calc(100vh-7rem))]'}`}
          >
            {/* Header */}
            <div className="bg-stone-900 text-white px-4 py-3 flex items-center justify-between cursor-pointer" onClick={() => isMinimized && setIsMinimized(false)}>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
                  <Stethoscope className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold">{assignedDoctor?.label ?? 'Tu médico'}</p>
                  <p className="text-[10px] text-white/60">{assignedDoctor?.specialty ?? 'Consulta directa'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized) }} className="p-1 hover:bg-white/10 rounded">
                  <Minus className="h-4 w-4" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setIsOpen(false) }} className="p-1 hover:bg-white/10 rounded">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50/50">
                  {doctorLoading || loading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
                    </div>
                  ) : doctorError || !assignedDoctor ? (
                    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                      <p className="text-sm font-bold text-stone-900">No hay médico asignado</p>
                      <p className="mt-1 text-xs text-stone-500">
                        Cuando tengas un profesional activo en tu equipo de atención, este canal se habilita automáticamente.
                      </p>
                    </div>
                  ) : error ? (
                    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                      <p className="text-sm font-bold text-red-700">{error}</p>
                      <p className="mt-1 text-xs text-stone-500">Intentá nuevamente en unos segundos.</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center p-6 space-y-4 mt-10">
                      <div className="h-16 w-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto">
                        <MessageSquare className="h-8 w-8 text-stone-300" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-stone-900">¿Tenés alguna duda?</p>
                        <p className="text-xs text-stone-500 mt-1">Escribile a {assignedDoctor.label}. Te responderá lo antes posible.</p>
                      </div>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.role === 'patient' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex gap-2 max-w-[85%] ${msg.role === 'patient' ? 'flex-row-reverse' : ''}`}>
                          <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                            msg.role === 'patient' ? 'bg-stone-200 text-stone-600' : 'bg-stone-900 text-white'
                          }`}>
                            {msg.role === 'patient' ? <User className="h-3.5 w-3.5" /> : <Stethoscope className="h-3.5 w-3.5" />}
                          </div>
                          <div className={`rounded-2xl px-3 py-2 text-sm ${
                            msg.role === 'patient' ? 'bg-stone-800 text-white' : 'bg-white border shadow-sm'
                          }`}>
                            <p>{msg.rawText}</p>
                            <p className={`text-[9px] mt-1 text-right ${msg.role === 'patient' ? 'text-white/50' : 'text-stone-400'}`}>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={scrollRef} />
                </div>

                {/* Input */}
                <form onSubmit={handleSend} className="p-3 border-t bg-white">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Escribe tu consulta..."
                      className="flex-1 px-4 py-2 bg-stone-50 border border-stone-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || sending || !doctorId}
                      className="h-9 w-9 rounded-full bg-stone-900 text-white flex items-center justify-center hover:bg-stone-800 transition-colors disabled:opacity-50"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
