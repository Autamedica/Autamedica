'use client'

import type { FormEvent, KeyboardEvent, RefObject } from 'react'
import { MessageSquare, Send, X } from 'lucide-react'

interface UiChatMessage {
  id: string
  text: string
  senderId: string
  senderType: string
  senderName?: string
  senderLabel: string
  timestamp: number
  mine: boolean
}

export interface ChatPanelProps {
  isOpen: boolean
  messages: UiChatMessage[]
  chatInput: string
  onChatInputChange: (value: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  onClose: () => void
  chatReady: boolean
  accentColor: 'violet' | 'sky'
  isDesktopViewport: boolean
  chatMessagesRef: RefObject<HTMLDivElement | null>
}

export function ChatPanel({
  isOpen,
  messages,
  chatInput,
  onChatInputChange,
  onSubmit,
  onKeyDown,
  onClose,
  chatReady,
  accentColor,
  isDesktopViewport,
  chatMessagesRef,
}: ChatPanelProps) {
  return (
    <aside
      className={`absolute right-0 top-0 bottom-0 z-30 flex w-full flex-col border-l border-white/[0.06] bg-neutral-900/[0.97] backdrop-blur-2xl transition-transform duration-300 ease-out md:w-96 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{
        width: isDesktopViewport ? '24rem' : '100%',
        maxWidth: isDesktopViewport ? '24rem' : '100%',
      }}
    >
      {/* Chat header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
        <div>
          <h3 className="font-semibold text-white">Chat de consulta</h3>
          <p className="text-xs text-slate-400">
            {chatReady ? (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Canal activo
              </span>
            ) : (
              'Conectando canal...'
            )}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          title="Cerrar chat"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={chatMessagesRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${
              accentColor === 'violet' ? 'bg-violet-500/10' : 'bg-sky-500/10'
            }`}>
              <MessageSquare className={`h-7 w-7 ${
                accentColor === 'violet' ? 'text-violet-400' : 'text-sky-400'
              }`} />
            </div>
            <p className="text-sm font-medium text-slate-400">Sin mensajes aun</p>
            <p className="mt-1.5 max-w-[200px] text-xs text-slate-600">
              Coordina durante la consulta usando el chat
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                msg.mine
                  ? accentColor === 'violet'
                    ? 'bg-violet-600 text-white'
                    : 'bg-sky-600 text-white'
                  : 'bg-white/[0.06] text-slate-100'
              }`}
            >
              <p className="text-[11px] font-semibold opacity-80">{msg.senderLabel}</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
              <p className="mt-1 text-[10px] opacity-60">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={onSubmit} className="border-t border-white/[0.06] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={chatInput}
            onChange={(e) => onChatInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Escribe un mensaje..."
            className="flex-1 resize-none rounded-xl border border-white/[0.06] bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:bg-white/[0.07] focus:border-white/15 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!chatReady || chatInput.trim().length === 0}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              accentColor === 'violet'
                ? 'bg-violet-600 hover:bg-violet-500 text-white'
                : 'bg-sky-600 hover:bg-sky-500 text-white'
            }`}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </aside>
  )
}
