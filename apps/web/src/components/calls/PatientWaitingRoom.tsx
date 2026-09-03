'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { gsap } from 'gsap'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  SwitchCamera,
  AlertCircle,
  Activity,
  SlidersHorizontal,
  RotateCcw,
  Sun,
  Palette,
  X,
  QrCode
} from 'lucide-react'
import { PixPaymentModal } from '@/components/payments/PixPaymentModal'
import { formatBrlFromCents } from '@/lib/payments/money'

export interface PatientWaitingRoomProps {
  doctorName?: string
  doctorRole?: string
  doctorCrm?: string
  doctorPhoto?: string
  clinicName?: string
  patientName?: string
  triageCompleted?: boolean
  language?: 'pt' | 'es'
  appointmentId?: string
  consultationFeeCents?: number
  paymentRequired?: boolean
  isPaid?: boolean
  onPaymentSuccess?: () => void
  onJoin: (mediaState: { stream: MediaStream | null; videoEnabled: boolean; audioEnabled: boolean }) => void
}

interface VideoFilters {
  saturation: number
  brightness: number
  contrast: number
}

const DEFAULT_FILTERS: VideoFilters = {
  saturation: 110,
  brightness: 105,
  contrast: 102
}

const PRESETS: Record<string, { labelPt: string; labelEs: string; filters: VideoFilters }> = {
  natural: {
    labelPt: 'Natural',
    labelEs: 'Natural',
    filters: { saturation: 100, brightness: 100, contrast: 100 }
  },
  clinical: {
    labelPt: 'Luz Clínica',
    labelEs: 'Luz Clínica',
    filters: { saturation: 105, brightness: 115, contrast: 108 }
  },
  warmth: {
    labelPt: 'Calidez HD',
    labelEs: 'Cálido HD',
    filters: { saturation: 125, brightness: 106, contrast: 104 }
  }
}

const I18N = {
  pt: {
    online: 'Em linha',
    cameraOff: 'Câmera desativada',
    cameraLabel: 'Câmera ativa',
    micLabel: 'Microfone ativo',
    micOff: 'Microfone silenciado',
    switchCamera: 'Inverter câmera',
    btnJoin: 'Entrar no Consultório',
    imageSettings: 'Ajuste de Luz & Imagem',
    saturation: 'Saturação',
    brightness: 'Brilho',
    reset: 'Restaurar',
    backlightAlert: 'Muita luz ao fundo: posicione a luz à sua frente',
    lowLightAlert: 'Ambiente escuro: recomendamos iluminar o rosto',
    permissionError: 'Acesso à câmera ou microfone não permitido.',
    consentNotice: 'Ao entrar no consultório, você concorda com o Termo de Telemedicina (CFM 2.314/2022) e Tratamento de Dados (LGPD).',
    btnPayPix: 'Pagar Consulta com Pix',
    pixPending: 'Pix Pendente',
    particularBadge: 'Consulta Particular',
    retryBtn: 'Tentar novamente',
    joinWithoutMedia: 'Entrar sem câmera'
  },
  es: {
    online: 'En línea',
    cameraOff: 'Cámara apagada',
    cameraLabel: 'Cámara activa',
    micLabel: 'Micrófono activo',
    micOff: 'Micrófono silenciado',
    switchCamera: 'Cambiar cámara',
    btnJoin: 'Ingresar a la consulta',
    imageSettings: 'Ajuste de Luz e Imagen',
    saturation: 'Saturación',
    brightness: 'Brillo',
    reset: 'Restablecer',
    backlightAlert: 'Luz de fondo intensa: colocá la luz frente a vos',
    lowLightAlert: 'Ambiente con poca luz: iluminá tu rostro',
    permissionError: 'Acceso a cámara o micrófono no permitido.',
    consentNotice: 'Al ingresar a la consulta, aceptás los Términos de Telemedicina y Tratamiento de Dados (LGPD).',
    btnPayPix: 'Pagar Consulta con Pix',
    pixPending: 'Pix Pendiente',
    particularBadge: 'Consulta Particular',
    retryBtn: 'Reintentar',
    joinWithoutMedia: 'Ingresar sin cámara'
  }
}

export default function PatientWaitingRoom({
  doctorName = 'Dr. Felipe Silva',
  doctorRole = 'Clínica Geral & Telemedicina',
  doctorCrm = 'CRM/SP 184.920',
  clinicName = 'AutaMedica',
  language = 'pt',
  appointmentId,
  consultationFeeCents = 15000,
  paymentRequired = false,
  isPaid = false,
  onPaymentSuccess,
  onJoin
}: PatientWaitingRoomProps) {
  const t = I18N[language] || I18N.pt

  const [showPixModal, setShowPixModal] = useState(false)
  const [hasPaid, setHasPaid] = useState(isPaid || !paymentRequired)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const lastAlertTimeRef = useRef<number>(0)

  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [audioLevel, setAudioLevel] = useState(0)
  const [mediaError, setMediaError] = useState<string | null>(null)

  // Transient Lighting Advisory Toast (auto-dismisses in 3.5s)
  const [lightingAlert, setLightingAlert] = useState<string | null>(null)

  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<VideoFilters>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('autamedica_camera_filters_v1')
        if (saved) return JSON.parse(saved) as VideoFilters
      } catch {
        // ignore
      }
    }
    return DEFAULT_FILTERS
  })

  useEffect(() => {
    try {
      localStorage.setItem('autamedica_camera_filters_v1', JSON.stringify(filters))
    } catch {
      // ignore
    }
  }, [filters])

  // GSAP Entrance
  useEffect(() => {
    if (typeof window === 'undefined') return

    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, scale: 0.98 },
        { opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out', clearProps: 'all' }
      )
    }
  }, [])

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Start Camera & Microphone
  const initMedia = useCallback(async (facing: 'user' | 'environment') => {
    try {
      setMediaError(null)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      })

      if (!isMountedRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      try {
        if (audioContextRef.current) {
          try {
            void audioContextRef.current.close()
          } catch {
            // ignore
          }
          audioContextRef.current = null
        }

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const audioCtx = new AudioCtx()
        audioContextRef.current = audioCtx
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        analyserRef.current = analyser

        const dataArray = new Uint8Array(analyser.frequencyBinCount)

        const updateAudioLevel = () => {
          if (!analyserRef.current) return
          analyserRef.current.getByteFrequencyData(dataArray)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i]
          }
          const average = sum / dataArray.length
          const normalized = Math.min(100, Math.round((average / 128) * 100))
          setAudioLevel(normalized)
          animFrameRef.current = requestAnimationFrame(updateAudioLevel)
        }

        updateAudioLevel()
      } catch (e) {
        console.warn('Audio level monitoring not available:', e)
      }
    } catch (err) {
      console.error('Error accessing camera/mic:', err)
      setMediaError(t.permissionError)
    }
  }, [t.permissionError])

  useEffect(() => {
    void initMedia(facingMode)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (audioContextRef.current) void audioContextRef.current.close()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [initMedia, facingMode])

  // ── Real-Time Backlight & Ambient Lighting Diagnostics (Lightweight 32x24 Canvas) ──
  useEffect(() => {
    if (!videoEnabled || mediaError) return

    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 24
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const checkLighting = () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return

      try {
        ctx.drawImage(videoRef.current, 0, 0, 32, 24)
        const imgData = ctx.getImageData(0, 0, 32, 24).data

        let centerSum = 0
        let centerCount = 0
        let perimSum = 0
        let perimCount = 0

        for (let y = 0; y < 24; y++) {
          for (let x = 0; x < 32; x++) {
            const idx = (y * 32 + x) * 4
            // Rec. 709 luminance calculation
            const lum = 0.2126 * imgData[idx] + 0.7152 * imgData[idx + 1] + 0.0722 * imgData[idx + 2]

            // Central face region (x: 10..22, y: 5..19)
            if (x >= 10 && x <= 22 && y >= 5 && y <= 19) {
              centerSum += lum
              centerCount++
            } else if (y <= 5 || x <= 6 || x >= 26) {
              // Background & perimeter
              perimSum += lum
              perimCount++
            }
          }
        }

        const centerAvg = centerCount > 0 ? centerSum / centerCount : 128
        const perimAvg = perimCount > 0 ? perimSum / perimCount : 128
        const now = Date.now()

        // 20s cooldown between transient advisories
        if (now - lastAlertTimeRef.current > 20000) {
          // Backlight condition: bright background (> 140) and shadowed face (< 80) with contrast ratio > 1.9
          if (perimAvg > 140 && centerAvg < 80 && perimAvg / (centerAvg || 1) > 1.9) {
            setLightingAlert(t.backlightAlert)
            lastAlertTimeRef.current = now
            setTimeout(() => setLightingAlert(null), 3600)
          } else if (centerAvg < 38 && perimAvg < 45) {
            // Low ambient light (< 80 lux equivalent sensor read)
            setLightingAlert(t.lowLightAlert)
            lastAlertTimeRef.current = now
            setTimeout(() => setLightingAlert(null), 3600)
          }
        }
      } catch {
        // ignore cross-origin or transient read issues
      }
    }

    const interval = setInterval(checkLighting, 2500)
    return () => clearInterval(interval)
  }, [videoEnabled, mediaError, t.backlightAlert, t.lowLightAlert])

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoEnabled
        setVideoEnabled(!videoEnabled)
      }
    }
  }

  const toggleAudio = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioEnabled
        setAudioEnabled(!audioEnabled)
      }
    }
  }

  const switchCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'))
  }

  const handleJoin = () => {
    if (paymentRequired && !hasPaid) {
      setShowPixModal(true)
      return
    }
    if (audioContextRef.current?.state === 'suspended') {
      void audioContextRef.current.resume()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    onJoin({
      stream: null,
      videoEnabled,
      audioEnabled
    })
  }

  return (
    <div className="min-h-[100dvh] bg-am-surface-900 flex flex-col items-center justify-center p-3 sm:p-6 select-none font-sans relative selection:bg-am-primary-500/30">
      {/* ── Background concentric pulse decoration ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-am-surface-700/30 animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-am-surface-700/40" />
      </div>

      <div
        ref={containerRef}
        className="w-full max-w-4xl flex flex-col gap-2.5 sm:gap-3.5 relative z-10"
      >
        {/* ── 1. Minimal Header (Only the pure essentials) ── */}
        <header className="w-full flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="AutaMedica"
              className="h-6 w-6 sm:h-7 sm:w-7 object-contain"
            />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-am-surface-400">
              {clinicName}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-sm sm:text-base font-semibold text-am-surface-50 font-heading">
                {doctorName}
              </span>
              <span className="hidden sm:inline text-xs text-am-surface-400 ml-2 font-mono">
                {doctorCrm}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-am-surface-800 border border-am-surface-700/60 text-am-primary-300 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-am-primary-400 animate-pulse" />
              <span>{t.online}</span>
            </div>
          </div>
        </header>

        {/* ── 2. Cinematic Video Mirror with UFCLabs Dotted Reticle & Floating Controls ── */}
        <div className="relative w-full aspect-[3/4] sm:aspect-video rounded-3xl border border-am-surface-700/60 bg-am-surface-800 shadow-2xl overflow-hidden flex items-center justify-center group">
          {mediaError ? (
            <div className="p-4 text-center max-w-sm">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
              <p className="text-xs text-am-surface-300 mb-3">{mediaError}</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void initMedia(facingMode)}
                  className="px-4 py-2 bg-am-surface-700 hover:bg-am-surface-600 text-xs font-semibold rounded-xl text-white transition-colors border border-am-surface-600"
                >
                  {t.retryBtn}
                </button>
                <button
                  type="button"
                  onClick={() => onJoin({ stream: null, videoEnabled: false, audioEnabled: false })}
                  className="px-4 py-2 bg-am-primary-600 hover:bg-am-primary-500 text-xs font-semibold rounded-xl text-white transition-colors shadow-lg"
                >
                  {t.joinWithoutMedia}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Camera Video Stream */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  filter: `brightness(${filters.brightness}%) saturate(${filters.saturation}%) contrast(${filters.contrast}%)`
                }}
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  facingMode === 'user' ? 'scale-x-[-1]' : ''
                } ${videoEnabled ? 'opacity-100' : 'opacity-0'}`}
              />

              {/* Video Off State */}
              {!videoEnabled && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-am-surface-900 text-am-surface-400">
                  <div className="w-14 h-14 rounded-2xl bg-am-surface-800 border border-am-surface-700 flex items-center justify-center mb-2 shadow-inner">
                    <VideoOff className="w-7 h-7 text-am-surface-500" />
                  </div>
                  <p className="text-xs font-medium">{t.cameraOff}</p>
                </div>
              )}

              {/* ── UFCLabs Aesthetic: Fine Dotted White Framing Reticle ── */}
              <div className="absolute inset-4 sm:inset-6 pointer-events-none rounded-2xl border border-dashed border-white/20">
                {/* Corner Markers */}
                <div className="absolute -top-1.5 -left-1.5 w-3 h-3 border-t-2 border-l-2 border-white/50" />
                <div className="absolute -top-1.5 -right-1.5 w-3 h-3 border-t-2 border-r-2 border-white/50" />
                <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 border-b-2 border-l-2 border-white/50" />
                <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 border-b-2 border-r-2 border-white/50" />

                {/* Subtle Eye-Level Dashed Horizon Line */}
                <div className="absolute top-[38%] inset-x-3 border-t border-dashed border-white/15" />
              </div>

              {/* Subtle Gradient Overlays for Contrast */}
              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 h-32 sm:h-28 bg-gradient-to-t from-black/75 via-black/40 to-transparent pointer-events-none" />

              {/* ── Transient Lighting / Backlight Alert (Auto-Dismissing Toast) ── */}
              {lightingAlert && (
                <div className="absolute top-14 inset-x-4 flex justify-center z-30 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-am-surface-900/90 backdrop-blur-md border border-white/20 text-am-surface-100 text-xs shadow-xl">
                    <Sun className="w-3.5 h-3.5 text-am-primary-400 flex-shrink-0 animate-pulse" />
                    <span>{lightingAlert}</span>
                  </div>
                </div>
              )}

              {/* Top Bar Floating Inside Video: Doctor Role + Audio Wave & Filters */}
              <div className="absolute top-3.5 inset-x-3.5 flex items-center justify-between z-10">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-am-surface-300 backdrop-blur-md px-3 py-1 rounded-full bg-am-surface-900/60 border border-white/10 font-medium">
                    {doctorRole}
                  </span>
                  {paymentRequired && !hasPaid && (
                    <button
                      type="button"
                      onClick={() => setShowPixModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-am-surface-900/85 backdrop-blur-md border border-am-primary-500/40 text-am-primary-300 hover:text-white text-xs font-semibold hover:bg-am-surface-800 transition-colors shadow-sm cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5 text-am-primary-400 animate-pulse" />
                      <span>{formatBrlFromCents(consultationFeeCents)} · {t.pixPending}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Audio Level Wave */}
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-am-surface-900/80 backdrop-blur-md border border-white/10 shadow-sm">
                    {audioEnabled ? (
                      <>
                        <Activity className="w-3.5 h-3.5 text-am-primary-400" />
                        <div className="flex items-end gap-0.5 h-2.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div
                              key={i}
                              className="w-0.5 rounded-full bg-am-primary-400 transition-all duration-75"
                              style={{
                                height: `${Math.max(2, (audioLevel / 100) * 10 * (0.5 + (i % 2) * 0.5))}%`
                              }}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <span className="text-[10px] text-rose-400 font-medium">Mudo</span>
                    )}
                  </div>

                  {/* Filter Adjustment Button */}
                  <button
                    type="button"
                    onClick={() => setShowFilters(!showFilters)}
                    className={`p-2 rounded-full backdrop-blur-md transition-all active:scale-95 border ${
                      showFilters
                        ? 'bg-am-primary-600 text-white border-am-primary-400 shadow-sm'
                        : 'bg-am-surface-900/80 text-am-surface-200 border-white/10 hover:bg-am-surface-800'
                    }`}
                    title={t.imageSettings}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* ── Image & Light Calibration Drawer (Floating Inside Video) ── */}
              {showFilters && (
                <div className="absolute inset-x-4 top-14 sm:max-w-xs sm:left-auto sm:right-4 bg-am-surface-900/95 backdrop-blur-xl border border-am-surface-700 rounded-2xl p-3.5 z-20 shadow-2xl animate-in fade-in duration-200">
                  <div className="flex items-center justify-between pb-2 border-b border-am-surface-700/60 mb-2.5">
                    <span className="text-xs font-semibold text-am-surface-50">
                      {t.imageSettings}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFilters(DEFAULT_FILTERS)}
                        className="p-1 hover:text-am-primary-400 text-am-surface-400 transition-colors text-[10px] flex items-center gap-1"
                        title={t.reset}
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFilters(false)}
                        className="p-1 hover:text-am-surface-100 text-am-surface-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 mb-2.5">
                    {Object.entries(PRESETS).map(([key, item]) => {
                      const isSelected =
                        filters.saturation === item.filters.saturation &&
                        filters.brightness === item.filters.brightness &&
                        filters.contrast === item.filters.contrast
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFilters(item.filters)}
                          className={`py-1 px-2 rounded-lg text-[10px] font-medium transition-all ${
                            isSelected
                              ? 'bg-am-primary-600 text-white font-semibold shadow-sm'
                              : 'bg-am-surface-800 text-am-surface-300 hover:bg-am-surface-700'
                          }`}
                        >
                          {language === 'pt' ? item.labelPt : item.labelEs}
                        </button>
                      )
                    })}
                  </div>

                  <div className="space-y-2 text-[10px]">
                    <div>
                      <div className="flex justify-between text-am-surface-300 mb-0.5">
                        <span className="flex items-center gap-1">
                          <Palette className="w-2.5 h-2.5 text-am-primary-400" />
                          {t.saturation}
                        </span>
                        <span className="font-mono text-am-primary-400">{filters.saturation}%</span>
                      </div>
                      <input
                        type="range"
                        min="60"
                        max="170"
                        value={filters.saturation}
                        onChange={e => setFilters(f => ({ ...f, saturation: Number(e.target.value) }))}
                        className="w-full h-1 bg-am-surface-700 rounded-lg appearance-none cursor-pointer accent-am-primary-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-am-surface-300 mb-0.5">
                        <span className="flex items-center gap-1">
                          <Sun className="w-2.5 h-2.5 text-am-primary-400" />
                          {t.brightness}
                        </span>
                        <span className="font-mono text-am-primary-400">{filters.brightness}%</span>
                      </div>
                      <input
                        type="range"
                        min="75"
                        max="145"
                        value={filters.brightness}
                        onChange={e => setFilters(f => ({ ...f, brightness: Number(e.target.value) }))}
                        className="w-full h-1 bg-am-surface-700 rounded-lg appearance-none cursor-pointer accent-am-primary-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── 3. FLOATING ACTION DOCK (INSIDE THE VIDEO) ── */}
              <div className="absolute bottom-4 inset-x-4 flex flex-col sm:flex-row items-center justify-between gap-3 z-10">
                {/* Peripheral Controls Pill */}
                <div className="flex items-center gap-2 p-1.5 rounded-full bg-am-surface-900/80 backdrop-blur-xl border border-white/10 shadow-lg">
                  <button
                    type="button"
                    onClick={toggleAudio}
                    className={`p-2.5 rounded-full backdrop-blur-md transition-all active:scale-95 ${
                      audioEnabled
                        ? 'bg-am-surface-800 text-white hover:bg-am-surface-700'
                        : 'bg-rose-600 text-white hover:bg-rose-500'
                    }`}
                    title={audioEnabled ? t.micLabel : t.micOff}
                  >
                    {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={toggleVideo}
                    className={`p-2.5 rounded-full backdrop-blur-md transition-all active:scale-95 ${
                      videoEnabled
                        ? 'bg-am-surface-800 text-white hover:bg-am-surface-700'
                        : 'bg-rose-600 text-white hover:bg-rose-500'
                    }`}
                    title={videoEnabled ? t.cameraLabel : t.cameraOff}
                  >
                    {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={switchCamera}
                    className="p-2.5 rounded-full bg-am-surface-800 text-white hover:bg-am-surface-700 backdrop-blur-md transition-all active:scale-95"
                    title={t.switchCamera}
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>
                </div>

                {/* ── Primary CTA Button & TCLE/LGPD Micro-Consent ── */}
                <div className="flex flex-col items-center sm:items-end w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={paymentRequired && !hasPaid ? () => setShowPixModal(true) : handleJoin}
                    className="relative group w-full sm:w-auto inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full bg-am-primary-600 hover:bg-am-primary-500 text-white font-semibold px-7 py-3 text-sm sm:text-base shadow-xl transition-all shadow-am-primary/30 active:scale-[0.99]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:animate-[am-shimmer_2s_infinite]" />
                    {paymentRequired && !hasPaid ? (
                      <QrCode className="w-4 h-4" />
                    ) : (
                      <Video className="w-4 h-4 fill-current" />
                    )}
                    <span>
                      {paymentRequired && !hasPaid
                        ? `${t.btnPayPix} (${formatBrlFromCents(consultationFeeCents)})`
                        : t.btnJoin}
                    </span>
                  </button>
                  <p className="text-[10px] text-am-surface-400 text-center mt-2 max-w-xs sm:max-w-sm">
                    {t.consentNotice}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Pix Payment Modal for Private Consultations ── */}
        <PixPaymentModal
          isOpen={showPixModal}
          onClose={() => setShowPixModal(false)}
          appointmentId={appointmentId}
          doctorName={doctorName}
          doctorRole={doctorRole}
          doctorCrm={doctorCrm}
          amountCents={consultationFeeCents}
          language={language}
          onSuccess={() => {
            setHasPaid(true)
            setShowPixModal(false)
            onPaymentSuccess?.()
          }}
        />
      </div>
    </div>
  )
}
