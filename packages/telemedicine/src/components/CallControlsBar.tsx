'use client'

import { motion } from 'framer-motion'
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
}: CallControlsBarProps) {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: showControls ? 0 : 100, opacity: showControls ? 1 : 0 }}
      className="absolute bottom-6 md:bottom-10 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-4 rounded-[24px] md:rounded-[28px] bg-am-surface-900/80 border border-white/10 backdrop-blur-3xl shadow-am-xl w-[92%] sm:w-auto justify-center"
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

      <div className="w-px h-6 md:h-8 bg-white/10 mx-1 md:mx-2" />

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

      <div className="w-px h-6 md:h-8 bg-white/10 mx-1 md:mx-2" />

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onEndCall}
        className="flex h-12 w-16 md:h-14 md:w-20 items-center justify-center rounded-xl md:rounded-2xl bg-red-600/90 text-white shadow-lg shadow-red-600/20 hover:bg-red-500 transition-colors"
      >
        <PhoneOff className="w-6 h-6 md:w-7 md:h-7" />
      </motion.button>
    </motion.div>
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
    glass: 'bg-white/5 text-am-surface-100 hover:bg-white/15 border border-white/5',
    danger: 'bg-red-500/20 text-red-400 border border-red-500/30',
    brand: 'bg-am-primary-500 text-white shadow-am-primary/20',
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.92 }}
        onClick={onClick}
        className={`relative flex h-11 w-11 md:h-14 md:w-14 items-center justify-center rounded-xl md:rounded-2xl transition-all duration-300 ${styles[variant]}`}
      >
        {icon}
        {badge !== undefined && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 md:h-5 md:w-5 items-center justify-center rounded-full bg-am-primary-500 text-[9px] md:text-[10px] font-bold text-white border-2 border-am-surface-900">
            {badge}
          </span>
        )}
      </motion.button>
      <span className="hidden sm:block text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-am-surface-400/80">{label}</span>
    </div>
  )
}
