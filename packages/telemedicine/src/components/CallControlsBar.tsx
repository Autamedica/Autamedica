'use client'

import { motion } from 'framer-motion'
import { 
  Video, VideoOff, Mic, MicOff, 
  Monitor, StopCircle, MessageSquare, 
  Settings, Maximize, PhoneOff,
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
      className="absolute bottom-10 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 px-6 py-4 rounded-[28px] bg-am-surface-900/60 border border-white/10 backdrop-blur-3xl shadow-am-xl"
    >
      <ControlButton
        active={isAudioEnabled}
        onClick={onToggleAudio}
        icon={isAudioEnabled ? <Mic size={22} /> : <MicOff size={22} />}
        label={isAudioEnabled ? 'Silenciar' : 'Activar'}
        variant={isAudioEnabled ? 'glass' : 'danger'}
      />
      
      <ControlButton
        active={isVideoEnabled}
        onClick={onToggleVideo}
        icon={isVideoEnabled ? <Video size={22} /> : <VideoOff size={22} />}
        label={isVideoEnabled ? 'Apagar' : 'Iniciar'}
        variant={isVideoEnabled ? 'glass' : 'danger'}
      />

      <div className="w-px h-8 bg-white/10 mx-2" />

      <ControlButton
        active={isScreenSharing}
        onClick={onToggleScreenShare}
        icon={<Monitor size={22} />}
        label="Compartir"
        variant={isScreenSharing ? 'brand' : 'glass'}
      />

      <ControlButton
        active={isRecording}
        onClick={onToggleRecording}
        icon={isRecording ? <CircleDot size={22} className="text-red-500 animate-pulse" /> : <CircleDot size={22} />}
        label="Grabar"
        variant={isRecording ? 'brand' : 'glass'}
      />

      <ControlButton
        active={isChatPanelOpen}
        onClick={onToggleChat}
        icon={<MessageSquare size={22} />}
        label="Chat"
        variant={isChatPanelOpen ? 'brand' : 'glass'}
        badge={unreadMessages > 0 ? unreadMessages : undefined}
      />

      <ControlButton
        active={false}
        onClick={onTogglePiP}
        icon={<Maximize size={22} />}
        label="PiP"
        variant="glass"
      />

      <div className="w-px h-8 bg-white/10 mx-2" />

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onEndCall}
        className="flex h-14 w-20 items-center justify-center rounded-2xl bg-red-600/90 text-white shadow-lg shadow-red-600/20 hover:bg-red-500 transition-colors"
      >
        <PhoneOff size={26} />
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
    <div className="flex flex-col items-center gap-1.5">
      <motion.button
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.92 }}
        onClick={onClick}
        className={`relative flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-300 ${styles[variant]}`}
      >
        {icon}
        {badge !== undefined && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-am-primary-500 text-[10px] font-bold text-white border-2 border-am-surface-900">
            {badge}
          </span>
        )}
      </motion.button>
      <span className="text-[10px] font-bold uppercase tracking-widest text-am-surface-400/80">{label}</span>
    </div>
  )
}
