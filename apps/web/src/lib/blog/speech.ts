import { segmentForTTS } from '../patients/utils/tts-sanitizer'

const DEFAULT_LANG = 'es-AR'
const DEFAULT_SEGMENT_LENGTH = 220
const VOICE_LOAD_TIMEOUT_MS = 1500
const PREMIUM_VOICE_HINTS = ['google', 'microsoft', 'premium', 'natural', 'online']

function normalizeLang(lang: string | undefined): string {
  return (lang ?? '').replace('_', '-').toLowerCase()
}

function scoreVoice(voice: SpeechSynthesisVoice, preferredLang: string): number {
  const normalizedPreferredLang = normalizeLang(preferredLang)
  const normalizedVoiceLang = normalizeLang(voice.lang)
  const voiceName = voice.name.toLowerCase()
  const matchesPreferredLang = normalizedVoiceLang === normalizedPreferredLang
  const matchesSpanish = normalizedVoiceLang.startsWith('es')
  const soundsPremium = PREMIUM_VOICE_HINTS.some((hint) => voiceName.includes(hint))

  return [
    matchesPreferredLang ? 4 : 0,
    matchesSpanish ? 2 : 0,
    soundsPremium ? 1 : 0,
    voice.default ? 1 : 0,
  ].reduce((total, current) => total + current, 0)
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

export function extractReadableText(root: ParentNode | null): string {
  return root?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

export async function waitForVoices(
  synth: SpeechSynthesis,
  timeoutMs = VOICE_LOAD_TIMEOUT_MS,
): Promise<SpeechSynthesisVoice[]> {
  const existingVoices = synth.getVoices()
  if (existingVoices.length > 0) return existingVoices

  return new Promise((resolve) => {
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      synth.removeEventListener('voiceschanged', handleVoicesChanged)
      window.clearTimeout(timeoutId)
      resolve(synth.getVoices())
    }

    const handleVoicesChanged = () => {
      if (synth.getVoices().length === 0) return
      finish()
    }

    const timeoutId = window.setTimeout(finish, timeoutMs)
    synth.addEventListener('voiceschanged', handleVoicesChanged)
  })
}

export function pickPreferredSpanishVoice(
  voices: SpeechSynthesisVoice[],
  preferredLang = DEFAULT_LANG,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null

  return [...voices]
    .filter((voice) => normalizeLang(voice.lang).startsWith('es'))
    .sort((left, right) => scoreVoice(right, preferredLang) - scoreVoice(left, preferredLang))[0] ?? null
}

interface SpeakTextOptions {
  synth: SpeechSynthesis
  text: string
  lang?: string
  rate?: number
  pitch?: number
  maxSegmentLength?: number
  onStart?: () => void
  onComplete?: () => void
  onError?: (event: SpeechSynthesisErrorEvent | Event | null) => void
}

export async function speakText({
  synth,
  text,
  lang = DEFAULT_LANG,
  rate = 0.84,
  pitch = 1.2,
  maxSegmentLength = DEFAULT_SEGMENT_LENGTH,
  onStart,
  onComplete,
  onError,
}: SpeakTextOptions): Promise<boolean> {
  const segments = segmentForTTS(text, maxSegmentLength)
  if (segments.length === 0) return false

  const voices = await waitForVoices(synth)
  const voice = pickPreferredSpanishVoice(voices, lang)

  synth.cancel()

  return new Promise((resolve) => {
    let started = false
    let finished = false

    const finish = (success: boolean, event: SpeechSynthesisErrorEvent | Event | null = null) => {
      if (finished) return
      finished = true

      if (success) onComplete?.()
      else onError?.(event)

      resolve(success)
    }

    const speakSegment = (index: number) => {
      if (index >= segments.length) {
        finish(true)
        return
      }

      const segment = segments[index]
      if (!segment) {
        finish(true)
        return
      }

      const utterance = new SpeechSynthesisUtterance(segment)
      utterance.lang = lang
      utterance.rate = rate
      utterance.pitch = pitch

      if (voice) {
        utterance.voice = voice
      }

      utterance.onstart = () => {
        if (started) return
        started = true
        onStart?.()
      }

      utterance.onend = () => {
        window.setTimeout(() => speakSegment(index + 1), 60)
      }

      utterance.onerror = (event) => {
        finish(false, event)
      }

      synth.speak(utterance)
      synth.resume()
    }

    speakSegment(0)
  })
}
