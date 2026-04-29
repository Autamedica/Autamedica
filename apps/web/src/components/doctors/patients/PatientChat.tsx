'use client'

import { useState, useRef, useEffect } from 'react'
import { useChat } from '@/hooks/doctors/useChat'
import { Send, Loader2, User, Stethoscope } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

interface PatientChatProps {
  patientId: string
  doctorId: string
  caseId: string
  patientName: string
}

export function PatientChat({ patientId, doctorId, caseId, patientName }: PatientChatProps) {
  const [input, setInput] = useState('')
  const { messages, loading, sending, sendMessage } = useChat({
    patientId,
    doctorId,
    caseId,
    role: 'doctor'
  })
  
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || sending) return
    const text = input
    setInput('')
    await sendMessage(text)
  }

  return (
    <div className="flex flex-col h-[500px] border rounded-xl bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-stone-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold">{patientName}</p>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">En línea</p>
            </div>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px]">Chat Directo</Badge>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50/30">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="h-12 w-12 rounded-full bg-stone-100 flex items-center justify-center mb-3">
              <Send className="h-6 w-6 text-stone-300" />
            </div>
            <p className="text-sm text-muted-foreground">Inicia la conversación con {patientName}.</p>
            <p className="text-xs text-muted-foreground mt-1">Los mensajes son privados y seguros.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'doctor' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-2 max-w-[80%] ${msg.role === 'doctor' ? 'flex-row-reverse' : ''}`}>
                <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'doctor' ? 'bg-primary text-white' : 'bg-stone-200 text-stone-600'
                }`}>
                  {msg.role === 'doctor' ? <Stethoscope className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                </div>
                <div className={`rounded-2xl px-3 py-2 text-sm ${
                  msg.role === 'doctor' ? 'bg-primary text-white' : 'bg-white border shadow-sm'
                }`}>
                  <p>{msg.rawText}</p>
                  <p className={`text-[9px] mt-1 text-right ${msg.role === 'doctor' ? 'text-white/70' : 'text-stone-400'}`}>
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
            placeholder="Escribe un mensaje..."
            className="flex-1 px-4 py-2 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="h-9 w-9 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </div>
  )
}
