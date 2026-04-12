'use client'

import type { RefObject } from 'react'
import { motion } from 'framer-motion'
import {
  Video,
  Mic,
  Loader2,
  Phone,
  UserCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Volume2,
  Settings,
  RefreshCw,
  Wifi,
} from 'lucide-react'
import { springGentle, staggerContainer, staggerChild, buttonGentleHover, buttonGentleTap } from './animation-presets'
import type { ConnectionState, DeviceInfo, WarmUpResult } from '../webrtc-client'
import type { WebRTCClient } from '../webrtc-client'
import type { CloudflareCallsClient } from '../cloudflare-calls'
import type { PreflightResult } from '../network/preflight'

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
  /** Network preflight result (optional — skipped if no ICE servers) */
  preflightResult?: PreflightResult | null
  preflightRunning?: boolean
  onPreflightRerun?: () => void
}

/* ── Device selector ── */
function DeviceSelect({
  icon: Icon,
  devices,
  value,
  onChange,
}: {
  icon: typeof Video
  devices: DeviceInfo[]
  value: string
  onChange: (id: string) => void
}) {
  if (devices.length <= 1) return null
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-8 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 hover:bg-white/8 transition-colors"
      >
        {devices.map(d => (
          <option key={d.deviceId} value={d.deviceId}>{d.label || `Dispositivo ${d.deviceId.slice(0, 5)}`}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  )
}

/* ── Audio level meter ── */
function AudioMeter({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-2">
      <Volume2 className="h-4 w-4 text-slate-400 shrink-0" />
      <div className="flex flex-1 items-end gap-[3px] h-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm transition-all duration-75 ${
              level * 20 > i
                ? i < 13 ? 'bg-emerald-400' : i < 17 ? 'bg-amber-400' : 'bg-red-400'
                : 'bg-white/10'
            }`}
            style={{ height: `${Math.max(25, (i / 20) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Readiness check item ── */
function CheckItem({ ok, loading, label }: { ok: boolean; loading?: boolean; label: string }) {
  return (
    <motion.div
      className={`flex items-center gap-2 text-sm ${ok ? 'text-emerald-400' : loading ? 'text-amber-400' : 'text-red-400'}`}
      variants={staggerChild}
    >
      {loading ? (
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
          <Loader2 className="h-4 w-4" />
        </motion.div>
      ) : ok ? (
        <motion.div initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={springGentle}>
          <CheckCircle2 className="h-4 w-4" />
        </motion.div>
      ) : (
        <AlertTriangle className="h-4 w-4" />
      )}
      <span>{label}</span>
    </motion.div>
  )
}

/* ── Network preflight result display ── */
function NetworkQualityDisplay({
  result,
  isRunning,
  onRerun,
}: {
  result: PreflightResult | null
  isRunning: boolean
  onRerun?: () => void
}) {
  if (isRunning) {
    return (
      <div className="flex items-center gap-2 text-sm text-amber-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Analizando tu conexion...</span>
      </div>
    )
  }

  if (!result) return null

  const { recommendation } = result

  const config: Record<string, { color: string; Icon: typeof CheckCircle2; text: string }> = {
    hd: {
      color: 'text-emerald-400',
      Icon: CheckCircle2,
      text: 'Conexion excelente — video en alta definicion',
    },
    sd: {
      color: 'text-amber-400',
      Icon: AlertTriangle,
      text: 'Conexion moderada — video en definicion estandar',
    },
    'audio-only': {
      color: 'text-orange-400',
      Icon: AlertTriangle,
      text: 'Conexion limitada — recomendamos audio sin video',
    },
    unreachable: {
      color: 'text-red-400',
      Icon: XCircle,
      text: 'No pudimos conectar — verifica tu red',
    },
  }

  const { color, Icon, text } = config[recommendation] ?? config.unreachable

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 text-sm ${color}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span>{text}</span>
      </div>
      {result.estimatedBandwidthKbps > 0 && (
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <span>{Math.round(result.estimatedBandwidthKbps)} kbps</span>
          <span>{Math.round(result.latencyMs)} ms</span>
          {result.stunReachable && <span>STUN OK</span>}
          {result.turnReachable && <span>TURN OK</span>}
        </div>
      )}
      {onRerun && (
        <button
          onClick={onRerun}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Reintentar
        </button>
      )}
    </div>
  )
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
  preflightResult,
  preflightRunning,
  onPreflightRerun,
}: GreenRoomProps) {
  const videoDevices = availableDevices.filter(d => d.kind === 'videoinput')
  const audioDevices = availableDevices.filter(d => d.kind === 'audioinput')
  const isUnreachable = preflightResult?.recommendation === 'unreachable'

  return (
    <div className="flex h-full items-center justify-center bg-slate-950 px-4 py-6 sm:px-6">
      {/* Background ambient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute left-1/4 top-1/4 h-[500px] w-[500px] rounded-full blur-[150px] opacity-[0.08] ${
          accentColor === 'violet' ? 'bg-am-primary-500' : 'bg-am-patient-500'
        }`} />
      </div>

      <div className="relative z-10 grid w-full max-w-4xl gap-8 lg:grid-cols-[1fr_340px]">
        {/* ── Left: Video preview ── */}
        <div className="flex flex-col">
          <div className="relative overflow-hidden rounded-2xl bg-slate-800 shadow-[0_16px_64px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
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
              className="aspect-video w-full object-cover -scale-x-100"
            />

            {/* Loading/no camera overlay */}
            {!warmUpResult && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                {isWarmingUp ? (
                  <div className="text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
                    <p className="mt-2 text-sm text-slate-500">Preparando cámara...</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <UserCircle className="mx-auto h-16 w-16 text-neutral-700" />
                    <p className="mt-2 text-sm text-slate-500">Vista previa no disponible</p>
                  </div>
                )}
              </div>
            )}

            {/* Name overlay */}
            {warmUpResult && (
              <div className="absolute bottom-3 left-3 rounded-md bg-slate-900/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                {userName || 'Tú'}
              </div>
            )}
          </div>

          {/* Audio meter below preview */}
          {warmUpResult && (
            <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
              <AudioMeter level={audioLevel} />
            </div>
          )}
        </div>

        {/* ── Right: Settings & Join ── */}
        <div className="flex flex-col justify-between">
          {/* Title */}
          <div>
            <h1 className="text-2xl font-bold text-white">Consulta médica</h1>
            <p className="mt-1 text-sm text-slate-400">
              {userName && <span>{userName} · </span>}
              Sala {roomId.replace(/^room_/, '').slice(0, 8)}
            </p>

            {/* Readiness checks */}
            {warmUpResult && (
              <motion.div
                className="mt-6 space-y-3 rounded-xl border border-white/8 bg-white/[0.03] p-4"
                variants={staggerContainer(0.15)}
                initial="hidden"
                animate="visible"
              >
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Verificacion
                </p>
                <CheckItem ok={greenRoomChecks.hasVideo} label="Camara" />
                <CheckItem ok={greenRoomChecks.hasAudio} label="Microfono" />
                <CheckItem
                  ok={greenRoomChecks.hasSignaling}
                  loading={!greenRoomChecks.hasSignaling && connectionState !== 'failed'}
                  label={warmUpResult.latencyMs != null ? `Red (${warmUpResult.latencyMs}ms)` : 'Red'}
                />
              </motion.div>
            )}

            {/* Network preflight */}
            {(preflightRunning || preflightResult) && (
              <div className="mt-4 space-y-2 rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  <Wifi className="h-3 w-3" />
                  Calidad de red
                </p>
                <NetworkQualityDisplay
                  result={preflightResult ?? null}
                  isRunning={!!preflightRunning}
                  onRerun={onPreflightRerun}
                />
              </div>
            )}

            {/* Device selectors */}
            {availableDevices.length > 0 && (videoDevices.length > 1 || audioDevices.length > 1) && (
              <div className="mt-4 space-y-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  <Settings className="h-3 w-3" />
                  Dispositivos
                </p>
                <DeviceSelect icon={Video} devices={videoDevices} value={selectedVideoDevice} onChange={(id) => onDeviceChange('video', id)} />
                <DeviceSelect icon={Mic} devices={audioDevices} value={selectedAudioDevice} onChange={(id) => onDeviceChange('audio', id)} />
              </div>
            )}
          </div>

          {/* Error */}
          {callError && (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {callError}
            </div>
          )}

          {/* Join button */}
          <div className="mt-6">
            <motion.button
              onClick={onStartCall}
              disabled={isWarmingUp || isUnreachable}
              className={`w-full rounded-xl px-6 py-4 text-base font-semibold text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                accentColor === 'violet'
                  ? 'bg-gradient-to-r from-am-primary-600 to-am-primary-500 hover:from-violet-500 hover:to-am-primary-400 shadow-am-primary-600/20'
                  : 'bg-gradient-to-r from-am-patient-600 to-am-patient-500 hover:from-sky-500 hover:to-am-patient-400 shadow-am-patient-600/20'
              }`}
              whileHover={buttonGentleHover}
              whileTap={buttonGentleTap}
              transition={springGentle}
            >
              <span className="flex items-center justify-center gap-2">
                <Phone className="h-5 w-5" />
                {userType === 'doctor' ? 'Iniciar consulta' : 'Unirse a consulta'}
              </span>
            </motion.button>

            {greenRoomChecks.allReady && (
              <motion.p
                className="mt-2 text-center text-xs text-emerald-400/70"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                Todo listo — conexión instantánea
              </motion.p>
            )}

            {connectionState === 'failed' && !callError && (
              <p className="mt-2 text-center text-sm text-red-400">
                Error de conexión. Intenta nuevamente.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
