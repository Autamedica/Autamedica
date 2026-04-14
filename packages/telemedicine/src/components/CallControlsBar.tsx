'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Video, VideoOff, Mic, MicOff, PhoneOff,
  MonitorUp, MonitorOff, MessageSquare,
  PictureInPicture2, Circle, Square,
} from 'lucide-react'
import { controlBarVariants, springSnappy, buttonHover, buttonTap, scaleIn } from './animation-presets'

export interface CallControlsBarProps {
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  isScreenSharing: boolean
  isRecording: boolean
  isChatPanelOpen: boolean
  unreadMessages: number
  showControls: boolean
  userType: 'doctor' | 'patient' | 'nurse' | 'guest'
  accentColor: 'violet' | 'sky'
  onToggleVideo: () => void
  onToggleAudio: () => void
  onToggleScreenShare: () => void
  onToggleRecording: () => void
  onToggleChat: () => void
  onTogglePiP: () => void
  onEndCall: () => void
}

function ControlButton({
  onClick, label, active, danger, accent, badge, children,
}: {
  onClick: () => void; label: string; active?: boolean; danger?: boolean;
  accent?: boolean; badge?: number; children: React.ReactNode;
}) {
  const base = 'relative flex h-12 w-12 items-center justify-center rounded-full sm:h-[52px] sm:w-[52px]'

  let style: string
  if (danger) {
    style = 'bg-red-500/90 text-white hover:bg-red-400 shadow-lg shadow-red-500/25'
  } else if (active) {
    style = accent
      ? 'bg-am-primary-600 text-white hover:bg-am-primary-500 ring-1 ring-am-primary-400/30'
      : 'bg-am-doctor-600 text-white hover:bg-am-doctor-500 ring-1 ring-am-doctor-400/30'
  } else {
    style = 'bg-white/10 text-white hover:bg-white/[0.18] hover:ring-1 hover:ring-white/20'
  }

  return (
    <div className="group relative">
      <motion.button
        onClick={onClick}
        aria-label={label}
        className={`${base} ${style}`}
        whileHover={buttonHover}
        whileTap={buttonTap}
        transition={springSnappy}
      >
        {children}
        <AnimatePresence>
          {badge != null && badge > 0 && (
            <motion.span
              className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white ring-2 ring-neutral-950"
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {badge > 99 ? '99+' : badge}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
      {/* Tooltip */}
      <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white shadow-xl opacity-0 translate-y-1 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-150">
        {label}
        <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-700" />
      </div>
    </div>
  )
}

export function CallControlsBar({
  isVideoEnabled, isAudioEnabled, isScreenSharing, isRecording,
  isChatPanelOpen, unreadMessages, showControls, userType, accentColor,
  onToggleVideo, onToggleAudio, onToggleScreenShare, onToggleRecording,
  onToggleChat, onTogglePiP, onEndCall,
}: CallControlsBarProps) {
  const hasScreenShareApi = typeof window !== 'undefined' && typeof navigator?.mediaDevices?.getDisplayMedia === 'function'
  const hasPiPApi = typeof document !== 'undefined' && document.pictureInPictureEnabled
  const isAccentViolet = accentColor === 'violet'

  return (
    <AnimatePresence>
      {showControls && (
        <motion.div
          className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-16 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent"
          variants={controlBarVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-slate-800/80 px-4 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:gap-3 sm:px-5 sm:py-3">
            <ControlButton onClick={onToggleAudio} label={isAudioEnabled ? 'Silenciar micrófono' : 'Activar micrófono'} danger={!isAudioEnabled}>
              {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </ControlButton>

            <ControlButton onClick={onToggleVideo} label={isVideoEnabled ? 'Desactivar cámara' : 'Activar cámara'} danger={!isVideoEnabled}>
              {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </ControlButton>

            {hasScreenShareApi && (
              <ControlButton onClick={onToggleScreenShare} label={isScreenSharing ? 'Dejar de compartir' : 'Compartir pantalla'} active={isScreenSharing}>
                {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
              </ControlButton>
            )}

            {userType === 'doctor' && (
              <ControlButton onClick={onToggleRecording} label={isRecording ? 'Detener grabación' : 'Grabar consulta'} danger={isRecording}>
                {isRecording ? (
                  <span className="relative">
                    <Square className="h-4 w-4" />
                    <motion.span
                      className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-400"
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  </span>
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </ControlButton>
            )}

            <ControlButton onClick={onToggleChat} label={isChatPanelOpen ? 'Cerrar chat' : 'Abrir chat'} active={isChatPanelOpen} accent={isAccentViolet} badge={isChatPanelOpen ? 0 : unreadMessages}>
              <MessageSquare className="h-5 w-5" />
            </ControlButton>

            {hasPiPApi && (
              <ControlButton onClick={onTogglePiP} label="Picture-in-Picture">
                <PictureInPicture2 className="h-5 w-5" />
              </ControlButton>
            )}

            <div className="mx-0.5 h-8 w-px bg-white/10 sm:mx-1" />

            <ControlButton onClick={onEndCall} label="Terminar llamada" danger>
              <PhoneOff className="h-5 w-5" />
            </ControlButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
