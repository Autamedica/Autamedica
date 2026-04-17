'use client'

import type { RefObject } from 'react'
import { motion } from 'framer-motion'
import {
  Loader2,
  AlertTriangle,
  RefreshCcw,
} from 'lucide-react'
import type { ConnectionState, DeviceInfo, WarmUpResult } from '../providers/types'
import type { PreflightResult } from '../network/preflight'
import { 
  IconCamera, 
  IconMic, 
  IconShieldCheck, 
  IconConnectivity,
  IconPulse 
} from './TelemedicineIcons'

export interface GreenRoomProps {
  localVideoRef: RefObject<HTMLVideoElement | null>
  client: unknown
  warmUpResult: WarmUpResult | null
  isWarmingUp: boolean
  audioLevel: number
  greenRoomChecks: {
    hasVideo: boolean
    hasAudio: boolean
    hasSignaling: boolean
    allReady?: boolean
  }
  availableDevices: DeviceInfo[]
  selectedVideoDevice: string
  selectedAudioDevice: string
  onDeviceChange: (kind: 'video' | 'audio', deviceId: string) => void
  onStartCall: () => void
  callError: string | null
  connectionState: ConnectionState
  userName?: string
  roomId: string
  userType: string
  accentColor: 'violet' | 'sky'
  preflightResult: PreflightResult | null
  preflightRunning: boolean
  onPreflightRerun: () => void
}

export function GreenRoom({
  localVideoRef,
  warmUpResult: _warmUpResult,
  isWarmingUp,
  audioLevel,
  greenRoomChecks,
  onStartCall,
  callError: _callError,
  userName,
  accentColor: _accentColor,
  preflightResult,
  preflightRunning,
  onPreflightRerun,
}: GreenRoomProps) {
  const isUnreachable = preflightResult?.recommendation === 'unreachable'
  
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-am-surface-900 font-sans selection:bg-am-primary-500/30">
      {/* ── Background Decoration (Pulse Animation) ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <motion.div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-am-surface-700/30"
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-am-surface-700/50"
          animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
      </div>

      <div className="relative z-10 grid w-full max-w-6xl grid-cols-1 gap-8 px-6 lg:grid-cols-12">
        
        {/* ── Left Column: Preview ── */}
        <div className="lg:col-span-7">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="group relative aspect-video overflow-hidden rounded-[32px] border border-am-surface-700/50 bg-am-surface-800 shadow-am-2xl"
          >
            {/* Local Video */}
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover grayscale-[20%] transition-all duration-700 group-hover:grayscale-0"
            />

            {/* Video Overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            
            {/* Top Badge: Encrypted */}
            <div className="absolute top-6 left-6 flex items-center gap-2 rounded-full bg-am-surface-900/40 px-4 py-2 backdrop-blur-md border border-white/10">
              <IconShieldCheck size={16} className="text-am-success" />
              <span className="text-xs font-medium tracking-wide text-am-surface-50 uppercase">Conexión Encriptada</span>
            </div>

            {/* Audio Visualizer (Pulse) */}
            <div className="absolute bottom-8 left-8 flex items-end gap-1 h-8">
              {Array.from({ length: 12 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 rounded-full bg-am-primary-400"
                  animate={{ height: Math.max(4, audioLevel * (15 + Math.random() * 25)) }}
                  transition={{ type: "spring", stiffness: 300, damping: 15 }}
                />
              ))}
            </div>

            {/* Warming Up State */}
            {isWarmingUp && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-am-surface-900/80 backdrop-blur-sm">
                <Loader2 className="h-10 w-10 animate-spin text-am-primary-500" />
                <p className="mt-4 text-sm font-medium text-am-surface-100">Configurando dispositivos...</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* ── Right Column: Info & Actions ── */}
        <div className="flex flex-col justify-center lg:col-span-5">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-am-primary-400">Consulta Médica</h2>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-am-surface-50 font-heading">
              {userName || 'Preparando todo'}
            </h1>
            <p className="mt-4 text-lg text-am-surface-300 leading-relaxed">
              Verifica tu cámara y micrófono antes de ingresar a la sala privada.
            </p>

            {/* ── Quality Checks ── */}
            <div className="mt-10 space-y-5">
              <CheckItem 
                icon={<IconCamera size={20} />} 
                label="Cámara" 
                ok={greenRoomChecks.hasVideo} 
                loading={isWarmingUp} 
              />
              <CheckItem 
                icon={<IconMic size={20} />} 
                label="Micrófono" 
                ok={greenRoomChecks.hasAudio} 
                loading={isWarmingUp} 
              />
              <CheckItem 
                icon={<IconConnectivity size={20} level={preflightResult?.latencyMs && preflightResult.latencyMs < 300 ? 4 : 2} />} 
                label="Calidad de Red" 
                ok={greenRoomChecks.hasSignaling && !isUnreachable} 
                loading={preflightRunning}
                detail={preflightResult?.latencyMs ? `${Math.round(preflightResult.latencyMs)}ms` : undefined}
                onRerun={onPreflightRerun}
              />
            </div>

            {/* ── Action Button ── */}
            <div className="mt-12">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onStartCall}
                disabled={isWarmingUp || isUnreachable}
                className={`relative group flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl py-5 text-lg font-semibold transition-all shadow-am-primary/20
                  ${isUnreachable 
                    ? 'bg-am-surface-800 text-am-surface-500 cursor-not-allowed' 
                    : 'bg-am-primary-600 text-white hover:bg-am-primary-500'}`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:animate-[am-shimmer_2s_infinite]" />
                <IconPulse size={22} className={isWarmingUp ? 'animate-pulse' : ''} />
                <span>Ingresar a la consulta</span>
              </motion.button>
              
              {isUnreachable && (
                <p className="mt-4 flex items-center justify-center gap-2 text-sm text-red-400">
                  <AlertTriangle size={14} />
                  No pudimos establecer una conexión segura. Verifica tu red.
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

function CheckItem({ 
  icon, 
  label, 
  ok, 
  loading, 
  detail,
  onRerun 
}: { 
  icon: React.ReactNode, 
  label: string, 
  ok: boolean, 
  loading: boolean,
  detail?: string,
  onRerun?: () => void
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-am-surface-800/40 p-4 border border-am-surface-700/30 backdrop-blur-sm transition-all hover:border-am-surface-600">
      <div className="flex items-center gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${ok ? 'bg-am-success/10 text-am-success' : 'bg-am-surface-700 text-am-surface-400'}`}>
          {icon}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-am-surface-100">{label}</span>
          {detail && <span className="text-xs text-am-surface-400 tracking-wider font-mono">{detail}</span>}
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        {onRerun && !loading && (
          <button onClick={onRerun} className="p-2 text-am-surface-400 hover:text-am-primary-400 transition-colors">
            <RefreshCcw size={14} />
          </button>
        )}
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-am-primary-400" />
        ) : ok ? (
          <div className="h-2 w-2 rounded-full bg-am-success shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
        ) : (
          <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]" />
        )}
      </div>
    </div>
  )
}
