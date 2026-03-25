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
      className={`absolute inset-x-0 bottom-0 z-20 flex items-center justify-center pb-6 pt-12 bg-gradient-to-t from-black/40 via-black/15 to-transparent transition-opacity duration-500 ${
        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="toolbar"
        aria-label="Controles de videollamada"
        className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-2 shadow-xl shadow-black/20 backdrop-blur-2xl ring-1 ring-white/[0.08] sm:gap-3 sm:px-4"
      >
        {/* Mic */}
        <button
          onClick={onToggleAudio}
          aria-label={isAudioEnabled ? 'Silenciar microfono' : 'Activar microfono'}
          aria-pressed={!isAudioEnabled}
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 sm:h-12 sm:w-12 ${
            isAudioEnabled
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-red-500/80 text-white hover:bg-red-500'
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
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 sm:h-12 sm:w-12 ${
            isVideoEnabled
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-red-500/80 text-white hover:bg-red-500'
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
            className={`flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 sm:h-12 sm:w-12 ${
              isScreenSharing
                ? 'bg-blue-500 text-white hover:bg-blue-400'
                : 'bg-white/10 text-white hover:bg-white/20'
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
            className={`flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 sm:h-12 sm:w-12 ${
              isRecording
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title={isRecording ? 'Detener grabacion' : 'Grabar consulta'}
          >
            {isRecording ? <Square className="h-4 w-4" /> : <Circle className="h-5 w-5" />}
          </button>
        )}

        {/* Chat */}
        <button
          onClick={onToggleChat}
          aria-label={isChatPanelOpen ? 'Cerrar chat' : 'Abrir chat'}
          aria-pressed={isChatPanelOpen}
          className={`relative flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 sm:h-12 sm:w-12 ${
            isChatPanelOpen
              ? accentColor === 'violet'
                ? 'bg-violet-600 text-white'
                : 'bg-sky-600 text-white'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
          title={isChatPanelOpen ? 'Cerrar chat' : 'Abrir chat'}
        >
          <MessageSquare className="h-5 w-5" />
          {!isChatPanelOpen && unreadMessages > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold">
              {unreadMessages > 99 ? '99+' : unreadMessages}
            </span>
          )}
        </button>

        {/* PiP */}
        {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
          <button
            onClick={onTogglePiP}
            aria-label="Picture-in-Picture"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-all hover:bg-white/20 active:scale-95 sm:h-12 sm:w-12"
            title="Picture-in-Picture"
          >
            <PictureInPicture2 className="h-5 w-5" />
          </button>
        )}

        {/* Divider */}
        <div className="mx-1 h-8 w-px bg-white/10" />

        {/* End call */}
        <button
          onClick={onEndCall}
          aria-label="Terminar videollamada"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-red-500 to-red-600 text-white shadow-lg shadow-red-600/30 transition-all hover:from-red-400 hover:to-red-500 hover:scale-105 active:scale-95 sm:h-14 sm:w-14"
          title="Terminar videollamada"
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </div>
    </div>
  )
}
