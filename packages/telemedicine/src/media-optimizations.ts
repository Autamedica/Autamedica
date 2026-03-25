/**
 * Media optimizations for WebRTC video calls.
 * - Adaptive constraints based on network/device
 * - contentHint for video/audio/screenshare tracks
 * - Screen Wake Lock management
 * - Tab visibility video pause
 */

/* ── Browser & device detection ── */

export interface BrowserCapabilities {
  isSafari: boolean
  isFirefox: boolean
  isChrome: boolean
  supportsVP9: boolean
  supportsSimulcast: boolean
}

export function detectBrowser(): BrowserCapabilities {
  if (typeof window === 'undefined' || typeof RTCRtpSender === 'undefined') {
    return { isSafari: false, isFirefox: false, isChrome: false, supportsVP9: false, supportsSimulcast: false }
  }

  const codecs = RTCRtpSender.getCapabilities?.('video')?.codecs ?? []
  const supportsVP9 = codecs.some(c => c.mimeType === 'video/VP9')

  const ua = navigator.userAgent
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua)
  const isFirefox = /Firefox/i.test(ua)
  const isChrome = /Chrome|Chromium/i.test(ua) && !/Edg/i.test(ua)

  return {
    isSafari,
    isFirefox,
    isChrome,
    supportsVP9,
    supportsSimulcast: !isSafari,
  }
}

export function getPreferredCodecs(): string[] {
  const { isSafari, supportsVP9 } = detectBrowser()
  if (isSafari || !supportsVP9) return ['video/H264', 'video/VP8']
  return ['video/VP9', 'video/VP8', 'video/H264']
}

/**
 * Safari sometimes throws AbortError on rapid srcObject reassignment.
 * This safely calls .play() with error suppression.
 */
export function patchVideoPlayback(el: HTMLVideoElement): void {
  if (!el.srcObject) return
  const playPromise = el.play()
  if (playPromise) {
    playPromise.catch(() => { /* AbortError or NotAllowedError — safe to ignore */ })
  }
}

/* ── Adaptive getUserMedia constraints ── */

interface NetworkInfo {
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g'
  downlink?: number
}

function getNetworkInfo(): NetworkInfo {
  const nav = navigator as Navigator & { connection?: NetworkInfo }
  return nav.connection ?? {}
}

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function getAdaptiveConstraints(): MediaStreamConstraints {
  const mobile = isMobileDevice()
  const net = getNetworkInfo()
  const slow = net.effectiveType === '2g' || net.effectiveType === '3g' || net.effectiveType === 'slow-2g'

  return {
    video: {
      width: {
        min: 320,
        ideal: mobile || slow ? 640 : 1280,
        max: mobile ? 1280 : 1920,
      },
      height: {
        min: 240,
        ideal: mobile || slow ? 480 : 720,
        max: mobile ? 720 : 1080,
      },
      frameRate: {
        ideal: slow ? 15 : mobile ? 24 : 30,
        max: 30,
      },
      facingMode: mobile ? 'user' : undefined,
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 },
    },
  }
}

/* ── contentHint ── */

export function applyContentHints(stream: MediaStream): void {
  for (const track of stream.getVideoTracks()) {
    if ('contentHint' in track) {
      track.contentHint = 'motion'
    }
  }
  for (const track of stream.getAudioTracks()) {
    if ('contentHint' in track) {
      track.contentHint = 'speech'
    }
  }
}

export function applyScreenShareHint(stream: MediaStream): void {
  for (const track of stream.getVideoTracks()) {
    if ('contentHint' in track) {
      track.contentHint = 'detail'
    }
  }
}

/* ── Screen Wake Lock ── */

let wakeLockSentinel: WakeLockSentinel | null = null

export async function acquireWakeLock(): Promise<boolean> {
  if (!('wakeLock' in navigator)) return false
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen')
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null
    })
    return true
  } catch {
    return false
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (wakeLockSentinel) {
    await wakeLockSentinel.release()
    wakeLockSentinel = null
  }
}

export function isWakeLockActive(): boolean {
  return wakeLockSentinel !== null && !wakeLockSentinel.released
}

/**
 * Re-acquire wake lock when tab becomes visible (browsers release on hide).
 * Returns cleanup function.
 */
export function setupWakeLockVisibilityHandler(): () => void {
  const handler = async () => {
    if (document.visibilityState === 'visible' && !isWakeLockActive()) {
      await acquireWakeLock()
    }
  }
  document.addEventListener('visibilitychange', handler)
  return () => document.removeEventListener('visibilitychange', handler)
}

/* ── Tab visibility video pause ── */

/**
 * Pauses video track when tab is hidden, resumes when visible.
 * Saves CPU/battery without dropping the call.
 * Returns cleanup function.
 */
export function setupVisibilityVideoPause(getStream: () => MediaStream | null): () => void {
  const handler = () => {
    const stream = getStream()
    if (!stream) return
    const enabled = document.visibilityState === 'visible'
    for (const track of stream.getVideoTracks()) {
      track.enabled = enabled
    }
  }
  document.addEventListener('visibilitychange', handler)
  return () => document.removeEventListener('visibilitychange', handler)
}
