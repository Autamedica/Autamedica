'use client'

import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  MessageSquare,
  PictureInPicture2,
  Circle,
  Square,
} from 'lucide-react'

export interface CallControlsBarProps {
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  isScreenSharing: boolean
  isRecording: boolean
  isChatPanelOpen: boolean
  unreadMessages: number
  showControls: boolean
  userType: 'doctor' | 'patient' | 'nurse'
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
  userType,
  accentColor,
  onToggleVideo,
  onToggleAudio,
  onToggleScreenShare,
  onToggleRecording,
  onToggleChat,
  onTogglePiP,
  onEndCall,
}: CallControlsBarProps) {
  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-20 flex items-end justify-center px-4 pb-5 pt-12 bg-gradient-to-t from-black/60 via-black/20 to-transparent transition-opacity duration-500 ${
        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        className="rounded-[30px] border border-white/10 bg-neutral-950/78 px-3 pb-3 pt-2 shadow-[0_30px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl"
      >
        <div className="mb-3 flex justify-center">
          <div className="h-1.5 w-16 rounded-full bg-white/10" />
        </div>

        <div
          role="toolbar"
          aria-label="Controles de videollamada"
          className="flex items-center gap-2 sm:gap-3"
        >
          {/* Mic */}
          <button
            onClick={onToggleAudio}
            aria-label={isAudioEnabled ? 'Silenciar microfono' : 'Activar microfono'}
            aria-pressed={!isAudioEnabled}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all active:scale-95 sm:h-14 sm:w-14 ${
              isAudioEnabled
                ? 'border-white/10 bg-white/8 text-white hover:bg-white/14'
                : 'border-red-400/20 bg-red-500/85 text-white hover:bg-red-500'
            }`}
            title={isAudioEnabled ? 'Silenciar' : 'Activar microfono'}
          >
            {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>

          {/* Camera */}
          <button
            onClick={onToggleVideo}
            aria-label={isVideoEnabled ? 'Desactivar camara' : 'Activar camara'}
            aria-pressed={!isVideoEnabled}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all active:scale-95 sm:h-14 sm:w-14 ${
              isVideoEnabled
                ? 'border-white/10 bg-white/8 text-white hover:bg-white/14'
                : 'border-red-400/20 bg-red-500/85 text-white hover:bg-red-500'
            }`}
            title={isVideoEnabled ? 'Desactivar camara' : 'Activar camara'}
          >
            {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>

          {/* Screen share */}
          {typeof window !== 'undefined' && typeof navigator?.mediaDevices?.getDisplayMedia === 'function' && (
            <button
              onClick={onToggleScreenShare}
              aria-label={isScreenSharing ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
              aria-pressed={isScreenSharing}
              className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all active:scale-95 sm:h-14 sm:w-14 ${
                isScreenSharing
                  ? 'border-cyan-400/30 bg-cyan-500 text-white hover:bg-cyan-400'
                  : 'border-white/10 bg-white/8 text-white hover:bg-white/14'
              }`}
              title={isScreenSharing ? 'Dejar de compartir' : 'Compartir pantalla'}
            >
              {isScreenSharing ? <ScreenShare className="h-5 w-5" /> : <ScreenShareOff className="h-5 w-5" />}
            </button>
          )}

          {/* Record */}
          {userType === 'doctor' && (
            <button
              onClick={onToggleRecording}
              aria-label={isRecording ? 'Detener grabacion' : 'Grabar consulta'}
              aria-pressed={isRecording}
              className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all active:scale-95 sm:h-14 sm:w-14 ${
                isRecording
                  ? 'border-red-400/20 bg-red-500 text-white hover:bg-red-400'
                  : 'border-white/10 bg-white/8 text-white hover:bg-white/14'
              }`}
              title={isRecording ? 'Detener grabacion' : 'Grabar consulta'}
            >
              {isRecording ? <Square className="h-4.5 w-4.5" /> : <Circle className="h-5 w-5" />}
            </button>
          )}

          {/* Chat */}
          <button
            onClick={onToggleChat}
            aria-label={isChatPanelOpen ? 'Cerrar chat' : 'Abrir chat'}
            aria-pressed={isChatPanelOpen}
            className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border transition-all active:scale-95 sm:h-14 sm:w-14 ${
              isChatPanelOpen
                ? accentColor === 'violet'
                  ? 'border-violet-400/20 bg-violet-600 text-white'
                  : 'border-cyan-400/20 bg-cyan-600 text-white'
                : 'border-white/10 bg-white/8 text-white hover:bg-white/14'
            }`}
            title={isChatPanelOpen ? 'Cerrar chat' : 'Abrir chat'}
          >
            <MessageSquare className="h-5 w-5" />
            {!isChatPanelOpen && unreadMessages > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold">
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </span>
            )}
          </button>

          {/* PiP */}
          {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
            <button
              onClick={onTogglePiP}
              aria-label="Picture-in-Picture"
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-white transition-all hover:bg-white/14 active:scale-95 sm:h-14 sm:w-14"
              title="Picture-in-Picture"
            >
              <PictureInPicture2 className="h-5 w-5" />
            </button>
          )}

          <div className="mx-1 h-9 w-px bg-white/10" />

          {/* End call */}
          <button
            onClick={onEndCall}
            aria-label="Terminar videollamada"
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-red-500 to-red-600 px-4 text-sm font-semibold text-white shadow-lg shadow-red-600/30 transition-all hover:from-red-400 hover:to-red-500 active:scale-95 sm:h-14 sm:px-5"
            title="Terminar videollamada"
          >
            <PhoneOff className="h-5 w-5" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>
    </div>
  )
}
