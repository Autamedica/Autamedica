'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { 
  Video, VideoOff, Mic, MicOff, 
  Monitor, MessageSquare, 
  Maximize, PhoneOff,
  CircleDot
} from 'lucide-react'

export interface CallControlsBarProps {
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  isScreenSharing: boolean
  isRecording: boolean
  isChatPanelOpen: boolean
  unreadMessages: number
  showControls: boolean
  userType: string
  accentColor: 'violet' | 'sky'
  onToggleVideo: () => void
  onToggleAudio: () => void
  onToggleScreenShare: () => void
  onToggleRecording: () => void
  onToggleChat: () => void
  onTogglePiP: () => void
  onEndCall: () => void
  auxiliaryActions?: ReactNode
}

export function CallControlsBar({
  isVideoEnabled,
  isAudioEnabled,
  isScreenSharing,
  isRecording,
  isChatPanelOpen,
  unreadMessages,
  showControls,
  onToggleVideo,
  onToggleAudio,
  onToggleScreenShare,
  onToggleRecording,
  onToggleChat,
  onTogglePiP,
  onEndCall,
  auxiliaryActions,
}: CallControlsBarProps) {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: showControls ? 0 : 100, opacity: showControls ? 1 : 0 }}
      className="absolute bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] md:bottom-10 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-am-surface-900/[0.88] px-2 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-3xl sm:w-auto sm:gap-2 sm:rounded-[24px] sm:px-3 sm:py-3 md:gap-3 md:rounded-[28px] md:px-6 md:py-4"
    >
      <ControlButton
        active={isAudioEnabled}
        onClick={onToggleAudio}
        icon={isAudioEnabled ? <Mic className="w-5 h-5 md:w-5.5 md:h-5.5" /> : <MicOff className="w-5 h-5 md:w-5.5 md:h-5.5" />}
        label={isAudioEnabled ? 'Silenciar' : 'Activar'}
        variant={isAudioEnabled ? 'glass' : 'danger'}
      />
      
      <ControlButton
        active={isVideoEnabled}
        onClick={onToggleVideo}
        icon={isVideoEnabled ? <Video className="w-5 h-5 md:w-5.5 md:h-5.5" /> : <VideoOff className="w-5 h-5 md:w-5.5 md:h-5.5" />}
        label={isVideoEnabled ? 'Apagar' : 'Iniciar'}
        variant={isVideoEnabled ? 'glass' : 'danger'}
      />

      <div className="hidden h-6 w-px bg-white/10 sm:block md:mx-2 md:h-8" />

      {/* Screen share usually hidden on small mobiles as it's not supported well */}
      <div className="hidden sm:flex">
        <ControlButton
          active={isScreenSharing}
          onClick={onToggleScreenShare}
          icon={<Monitor className="w-5 h-5 md:w-5.5 md:h-5.5" />}
          label="Presentar"
          variant={isScreenSharing ? 'brand' : 'glass'}
        />
      </div>

      <ControlButton
        active={isRecording}
        onClick={onToggleRecording}
        icon={isRecording ? <CircleDot className="w-5 h-5 md:w-5.5 md:h-5.5 text-red-500 animate-pulse" /> : <CircleDot className="w-5 h-5 md:w-5.5 md:h-5.5" />}
        label="Grabar"
        variant={isRecording ? 'brand' : 'glass'}
      />

      <ControlButton
        active={isChatPanelOpen}
        onClick={onToggleChat}
        icon={<MessageSquare className="w-5 h-5 md:w-5.5 md:h-5.5" />}
        label="Chat"
        variant={isChatPanelOpen ? 'brand' : 'glass'}
        badge={unreadMessages > 0 ? unreadMessages : undefined}
      />

      <div className="hidden md:flex">
        <ControlButton
          active={false}
          onClick={onTogglePiP}
          icon={<Maximize className="w-5 h-5 md:w-5.5 md:h-5.5" />}
          label="PiP"
          variant="glass"
        />
      </div>

      <div className="hidden h-6 w-px bg-white/10 sm:block md:mx-2 md:h-8" />

      {auxiliaryActions && (
        <>
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
            {auxiliaryActions}
          </div>

          <div className="hidden h-6 w-px bg-white/10 sm:block md:mx-2 md:h-8" />
        </>
      )}

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onEndCall}
        aria-label="Finalizar llamada"
        className="flex h-10 w-12 shrink-0 items-center justify-center rounded-xl bg-red-600/95 text-white shadow-lg shadow-red-600/25 transition-colors hover:bg-red-500 sm:h-12 sm:w-16 md:h-14 md:w-20 md:rounded-2xl"
      >
        <PhoneOff className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" />
      </motion.button>
    </motion.div>
  )
}

export function CallAuxiliaryButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        whileHover={disabled ? undefined : { y: -2 }}
        whileTap={disabled ? undefined : { scale: 0.92 }}
        onClick={onClick}
        disabled={disabled}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-am-doctor-600 text-white shadow-am-sm transition-all duration-300 hover:bg-am-doctor-700 disabled:cursor-not-allowed disabled:opacity-45 sm:h-11 sm:w-11 md:h-14 md:w-14 md:rounded-2xl"
        title={label}
        aria-label={label}
      >
        {icon}
      </motion.button>
      <span className="hidden max-w-[4.5rem] text-center text-[9px] font-bold uppercase tracking-widest text-am-surface-400/80 sm:block md:text-[10px]">
        {label}
      </span>
    </div>
  )
}

function ControlButton({ 
  active, 
  icon, 
  onClick, 
  label, 
  variant = 'glass',
  badge 
}: { 
  active: boolean, 
  icon: React.ReactNode, 
  onClick: () => void, 
  label: string,
  variant?: 'glass' | 'danger' | 'brand',
  badge?: number
}) {
  const styles = {
    glass: 'bg-white/[0.08] text-am-surface-100 hover:bg-white/15 border border-white/10',
    danger: 'bg-red-500/20 text-red-300 border border-red-400/35',
    brand: 'bg-am-primary-500 text-white shadow-am-primary/20 border border-white/10',
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.92 }}
        onClick={onClick}
        aria-pressed={active}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 sm:h-11 sm:w-11 md:h-14 md:w-14 md:rounded-2xl ${styles[variant]}`}
      >
        {icon}
        {badge !== undefined && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-am-surface-900 bg-am-primary-500 text-[9px] font-bold text-white md:h-5 md:w-5 md:text-[10px]">
            {badge}
          </span>
        )}
      </motion.button>
      <span className="hidden text-[9px] font-bold uppercase tracking-widest text-am-surface-400/80 sm:block md:text-[10px]">{label}</span>
    </div>
  )
}
