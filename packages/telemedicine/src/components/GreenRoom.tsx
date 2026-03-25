'use client'

import type { RefObject } from 'react'
import {
  Video,
  Mic,
  Loader2,
  Phone,
  UserCircle,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Volume2,
} from 'lucide-react'
import type { ConnectionState, DeviceInfo, WarmUpResult } from '../webrtc-client'
import type { WebRTCClient } from '../webrtc-client'
import type { CloudflareCallsClient } from '../cloudflare-calls'

export interface GreenRoomProps {
  localVideoRef: RefObject<HTMLVideoElement | null>
  client: WebRTCClient | CloudflareCallsClient | null
  warmUpResult: WarmUpResult | null
  isWarmingUp: boolean
  audioLevel: number
  greenRoomChecks: { hasVideo: boolean; hasAudio: boolean; hasSignaling: boolean; allReady: boolean }
  availableDevices: DeviceInfo[]
  selectedVideoDevice: string
  selectedAudioDevice: string
  onDeviceChange: (kind: 'video' | 'audio', deviceId: string) => void
  onStartCall: () => void
  callError: string | null
  connectionState: ConnectionState
  userName?: string
  roomId: string
  userType: 'doctor' | 'patient' | 'nurse'
  accentColor: 'violet' | 'sky'
}

export function GreenRoom({
  localVideoRef,
  client,
  warmUpResult,
  isWarmingUp,
  audioLevel,
  greenRoomChecks,
  availableDevices,
  selectedVideoDevice,
  selectedAudioDevice,
  onDeviceChange,
  onStartCall,
  callError,
  connectionState,
  userName,
  roomId,
  userType,
  accentColor,
}: GreenRoomProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-950 px-4">
      {/* Camera preview — live from pre-warm */}
      <div className="relative mb-6 w-full max-w-md overflow-hidden rounded-2xl bg-slate-800 shadow-2xl shadow-black/40 ring-1 ring-white/10 aspect-video">
        <video
          ref={(el) => {
            (localVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el
            if (el && client) {
              const s = client.getLocalStream()
              if (s && el.srcObject !== s) el.srcObject = s
            }
          }}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover -scale-x-100"
        />
        {!warmUpResult && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80">
            {isWarmingUp ? (
              <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400 mb-2" />
                <p className="text-sm text-slate-400">Preparando camara...</p>
              </div>
            ) : (
              <UserCircle className="h-16 w-16 text-slate-600" />
            )}
          </div>
        )}

        {/* Audio VU meter — overlaid on video preview */}
        {warmUpResult && (
          <div className="absolute bottom-3 left-3 right-3">
            <div className="flex items-end gap-0.5 h-5 rounded-lg bg-black/30 px-2 py-1 backdrop-blur-sm">
              {Array.from({ length: 16 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-full transition-all duration-100 ${
                    audioLevel * 16 > i
                      ? i < 10 ? 'bg-emerald-400' : i < 13 ? 'bg-amber-400' : 'bg-red-400'
                      : 'bg-white/10'
                  }`}
                  style={{ height: `${Math.max(20, (i / 16) * 100)}%` }}
                />
              ))}
              <Volume2 className="h-3.5 w-3.5 text-white/50 ml-1.5 shrink-0" />
            </div>
          </div>
        )}
      </div>

      {/* Readiness checks */}
      {warmUpResult && (
        <div className="mb-4 flex items-center gap-4 text-xs">
          <div className={`flex items-center gap-1.5 ${greenRoomChecks.hasVideo ? 'text-emerald-400' : 'text-red-400'}`}>
            {greenRoomChecks.hasVideo ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            Camara
          </div>
          <div className={`flex items-center gap-1.5 ${greenRoomChecks.hasAudio ? 'text-emerald-400' : 'text-red-400'}`}>
            {greenRoomChecks.hasAudio ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            Microfono
          </div>
          <div className={`flex items-center gap-1.5 ${greenRoomChecks.hasSignaling ? 'text-emerald-400' : 'text-amber-400'}`}>
            {greenRoomChecks.hasSignaling ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Red
          </div>
          {warmUpResult.latencyMs !== null && (
            <span className="text-slate-500">{warmUpResult.latencyMs}ms</span>
          )}
        </div>
      )}

      {/* Device selectors */}
      {availableDevices.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2 justify-center">
          {availableDevices.filter(d => d.kind === 'videoinput').length > 1 && (
            <div className="relative">
              <Video className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={selectedVideoDevice}
                onChange={(e) => onDeviceChange('video', e.target.value)}
                className="appearance-none rounded-lg border border-white/10 bg-white/5 pl-8 pr-8 py-2 text-xs text-white backdrop-blur-sm focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors hover:bg-white/10"
              >
                {availableDevices.filter(d => d.kind === 'videoinput').map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
            </div>
          )}
          {availableDevices.filter(d => d.kind === 'audioinput').length > 1 && (
            <div className="relative">
              <Mic className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={selectedAudioDevice}
                onChange={(e) => onDeviceChange('audio', e.target.value)}
                className="appearance-none rounded-lg border border-white/10 bg-white/5 pl-8 pr-8 py-2 text-xs text-white backdrop-blur-sm focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors hover:bg-white/10"
              >
                {availableDevices.filter(d => d.kind === 'audioinput').map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>
      )}

      <h2 className="mb-1 text-xl font-semibold text-white sm:text-2xl">Consulta medica</h2>
      <p className="mb-5 text-sm text-slate-400">
        {userName && `${userName} \u00b7 `}Sala {roomId}
      </p>

      {callError && (
        <div className="mb-4 rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-300">{callError}</div>
      )}

      <button
        onClick={onStartCall}
        disabled={isWarmingUp}
        className={`inline-flex items-center gap-3 rounded-full px-10 py-4 text-lg font-semibold text-white shadow-xl transition-all hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${
          accentColor === 'violet'
            ? 'bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 shadow-violet-600/25'
            : 'bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 shadow-sky-600/25'
        }`}
        title={greenRoomChecks.allReady ? 'Todo listo — conectara al instante' : 'Iniciar videollamada'}
      >
        <Phone className="h-6 w-6" />
        {userType === 'doctor' ? 'Iniciar consulta' : 'Unirse a consulta'}
      </button>

      {greenRoomChecks.allReady && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400/80">
          <CheckCircle2 className="h-3.5 w-3.5" /> Todo listo — conexion instantanea
        </p>
      )}

      {connectionState === 'failed' && !callError && (
        <p className="mt-3 text-sm text-red-400">Error de conexion. Intenta nuevamente.</p>
      )}
    </div>
  )
}
