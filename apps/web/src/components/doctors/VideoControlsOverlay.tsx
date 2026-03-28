import { useDoctorsPortal } from '@/components/doctors/layout/DoctorsPortalShell'
import {
  Mic,
  MicOff,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  Video,
  VideoOff,
} from 'lucide-react'
import type { JSX, ReactNode } from 'react'

type ControlButtonProps = {
  active: boolean
  iconActive: ReactNode
  iconInactive: ReactNode
  label: string
  onClick: () => void
}

function ControlButton({ active, iconActive, iconInactive, label, onClick }: ControlButtonProps): JSX.Element {
  const { isFocusMode } = useDoctorsPortal()

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center rounded-full transition ${
        isFocusMode ? 'h-10 w-10' : 'h-12 w-12'
      } ${
        active
          ? 'bg-emerald-500 text-slate-900 hover:bg-emerald-400'
          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
      }`}
      aria-label={label}
      title={label}
    >
      {active ? iconActive : iconInactive}
    </button>
  )
}

interface VideoControlsOverlayProps {
  showControls: boolean
  isMuted: boolean
  isVideoEnabled: boolean
  isScreenSharing: boolean
  isFocusMode: boolean
  onToggleAudio: () => void
  onToggleVideo: () => void
  onToggleScreenShare: () => void
  onEndCall: () => void
}

export function VideoControlsOverlay({
  showControls,
  isMuted,
  isVideoEnabled,
  isScreenSharing,
  isFocusMode,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onEndCall,
}: VideoControlsOverlayProps): JSX.Element {
  return (
    <div className={`video-overlay absolute bottom-6 inset-x-0 flex justify-center transition-opacity duration-300 ${showControls ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-6 py-4 backdrop-blur-2xl shadow-2xl shadow-black/50 sm:flex-nowrap">
        <ControlButton
          active={!isMuted}
          iconActive={<Mic className="h-5 w-5" />}
          iconInactive={<MicOff className="h-5 w-5" />}
          label={isMuted ? 'Activar micrófono' : 'Silenciar'}
          onClick={onToggleAudio}
        />
        <ControlButton
          active={isVideoEnabled}
          iconActive={<Video className="h-5 w-5" />}
          iconInactive={<VideoOff className="h-5 w-5" />}
          label={isVideoEnabled ? 'Ocultar video' : 'Mostrar video'}
          onClick={onToggleVideo}
        />
        <ControlButton
          active={isScreenSharing}
          iconActive={<ScreenShare className="h-5 w-5" />}
          iconInactive={<ScreenShareOff className="h-5 w-5" />}
          label={isScreenSharing ? 'Detener pantalla' : 'Compartir pantalla'}
          onClick={onToggleScreenShare}
        />
        <button
          type="button"
          onClick={onEndCall}
          className={`flex items-center justify-center rounded-full bg-rose-600 text-white transition hover:bg-rose-500 ${
            isFocusMode ? 'h-10 w-10' : 'h-12 w-12'
          }`}
        >
          <PhoneOff className={isFocusMode ? 'h-4 w-4' : 'h-5 w-5'} />
        </button>
      </div>
    </div>
  )
}
