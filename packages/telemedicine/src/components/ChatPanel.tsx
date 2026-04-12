'use client'

import type { FormEvent, KeyboardEvent, RefObject } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Send, X } from 'lucide-react'
import { slideRight, slideFromBottom, modalOverlay, messageBubble, scaleIn, buttonGentleHover, buttonGentleTap } from './animation-presets'

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
  isOpen, messages, chatInput, onChatInputChange, onSubmit, onKeyDown,
  onClose, chatReady, accentColor, isDesktopViewport, chatMessagesRef,
}: ChatPanelProps) {
  const panelVariants = isDesktopViewport ? slideRight : slideFromBottom

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {!isDesktopViewport && isOpen && (
          <motion.button
            type="button"
            aria-label="Cerrar chat"
            onClick={onClose}
            className="absolute inset-0 z-20 bg-black/45 backdrop-blur-[2px]"
            variants={modalOverlay}
            initial="hidden"
            animate="visible"
            exit="exit"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            className={`absolute z-30 flex min-h-0 flex-col overflow-hidden border border-white/[0.08] bg-neutral-950/[0.96] backdrop-blur-2xl ${
              isDesktopViewport
                ? 'bottom-4 right-4 top-4 w-[23rem] rounded-[30px] shadow-[0_36px_90px_rgba(0,0,0,0.42)]'
                : 'inset-x-0 bottom-0 h-[min(78dvh,42rem)] max-h-[calc(100dvh-0.75rem)] rounded-t-[30px] border-b-0 shadow-[0_-24px_60px_rgba(0,0,0,0.45)]'
            }`}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {!isDesktopViewport && (
              <div className="flex justify-center pt-3">
                <div className="h-1.5 w-16 rounded-full bg-white/10" />
              </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Consulta</p>
                <h3 className="mt-1 font-semibold text-white">Chat de consulta</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {chatReady ? (
                    <span className="flex items-center gap-1.5">
                      <motion.span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      Canal activo
                    </span>
                  ) : (
                    'Conectando canal...'
                  )}
                </p>
              </div>
              <motion.button
                onClick={onClose}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                title="Cerrar chat"
                whileHover={buttonGentleHover}
                whileTap={buttonGentleTap}
              >
                <X className="h-5 w-5" />
              </motion.button>
            </div>

            {/* Messages */}
            <div
              ref={chatMessagesRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 md:px-4"
            >
              {messages.length === 0 && (
                <motion.div
                  className="flex min-h-full flex-col items-center justify-center px-4 py-10 text-center"
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                >
                  <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] ${
                    accentColor === 'violet' ? 'bg-violet-500/12' : 'bg-cyan-500/12'
                  }`}>
                    <MessageSquare className={`h-7 w-7 ${
                      accentColor === 'violet' ? 'text-violet-400' : 'text-cyan-400'
                    }`} />
                  </div>
                  <p className="text-sm font-semibold text-slate-200">Aún no hay mensajes</p>
                  <p className="mt-1.5 max-w-[18rem] text-sm leading-relaxed text-slate-400">
                    Usa el chat para coordinar indicaciones, archivos o mensajes breves durante la consulta.
                  </p>
                </motion.div>
              )}

              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  className={`flex ${msg.mine ? 'justify-end' : 'justify-start'}`}
                  variants={messageBubble}
                  initial="hidden"
                  animate="visible"
                  layout
                >
                  <div
                    className={`max-w-[86%] rounded-[22px] px-4 py-3 shadow-lg ${
                      msg.mine
                        ? accentColor === 'violet' ? 'bg-violet-600 text-white' : 'bg-cyan-600 text-white'
                        : 'border border-white/8 bg-white/[0.06] text-slate-100'
                    }`}
                  >
                    <p className="text-[11px] font-semibold opacity-80">{msg.senderLabel}</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                    <p className="mt-1.5 text-[10px] opacity-60">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Input */}
            <form
              onSubmit={onSubmit}
              className="shrink-0 border-t border-white/[0.06] bg-neutral-950/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 backdrop-blur-xl"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={chatInput}
                  onChange={(e) => onChatInputChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder="Escribe un mensaje..."
                  className="min-h-[3rem] flex-1 resize-none rounded-2xl border border-white/[0.08] bg-white/6 px-4 py-3 text-sm leading-6 text-white placeholder:text-slate-500 focus:border-white/16 focus:bg-white/[0.08] focus:outline-none transition-colors"
                />
                <motion.button
                  type="submit"
                  disabled={!chatReady || chatInput.trim().length === 0}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
                    accentColor === 'violet'
                      ? 'bg-violet-600 text-white hover:bg-violet-500'
                      : 'bg-cyan-600 text-white hover:bg-cyan-500'
                  }`}
                  whileHover={buttonGentleHover}
                  whileTap={buttonGentleTap}
                >
                  <Send className="h-4 w-4" />
                </motion.button>
              </div>
              {!chatReady && (
                <p className="mt-2 text-xs text-slate-500">
                  Conectando canal de chat... Esperando conexión directa con el otro participante.
                </p>
              )}
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
