'use client'

import { useState, useRef, useEffect } from 'react'
import { useChat } from '@/hooks/doctors/useChat'
import { Send, Loader2, User, Stethoscope, MessageSquare, X, Minus } from 'lucide-react'
import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { motion, AnimatePresence } from 'framer-motion'

export function PatientDoctorChat() {
  const { patient } = usePatientSession()
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [input, setInput] = useState('')
  
  // For now, we assume the patient has a doctor assigned. 
  // In a real scenario, we would fetch the doctor_id from patient_care_team.
  // Using a placeholder or the first assigned doctor.
  const doctorId = "7bbdfe61-434a-4ed1-8dc5-663f48611f93" // Dr. Gabriel as default for test
  
  const { messages, loading, sending, sendMessage } = useChat({
    patientId: patient?.id || "",
    doctorId: doctorId,
    caseId: "general_followup",
    role: 'patient'
  })
  
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen, isMinimized])

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || sending) return
    const text = input
    setInput('')
    await sendMessage(text)
  }

  if (!patient) return null

  return (
    <>
      {/* Floating Button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={() => { setIsOpen(true); setIsMinimized(false) }}
        className={`fixed bottom-24 right-6 z-50 h-14 w-14 rounded-full bg-stone-900 text-white shadow-2xl flex items-center justify-center hover:bg-stone-800 transition-all ${isOpen ? 'hidden' : 'flex'}`}
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
            className={`fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col transition-all ${isMinimized ? 'h-14' : 'h-[500px]'}`}
          >
            {/* Header */}
            <div className="bg-stone-900 text-white px-4 py-3 flex items-center justify-between cursor-pointer" onClick={() => isMinimized && setIsMinimized(false)}>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
                  <Stethoscope className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold">Tu Médico</p>
                  <p className="text-[10px] text-white/60">Consulta directa</p>
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
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center p-6 space-y-4 mt-10">
                      <div className="h-16 w-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto">
                        <MessageSquare className="h-8 w-8 text-stone-300" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-stone-900">¿Tienes alguna duda?</p>
                        <p className="text-xs text-stone-500 mt-1">Escríbele a tu médico asignado. Te responderá lo antes posible.</p>
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
                      disabled={!input.trim() || sending}
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
