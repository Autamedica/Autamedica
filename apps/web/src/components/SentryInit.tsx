'use client'

import { useEffect } from 'react'
import { initClientSentry } from '@/lib/observability/sentry'

const CHUNK_RELOAD_FLAG = '__autamedica_chunk_reload__'
const CHUNK_RELOAD_COOLDOWN_MS = 60_000
const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'error loading dynamically imported module',
  'Unable to preload CSS',
]

function isChunkLoadError(message: unknown): boolean {
  if (typeof message !== 'string') return false
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}

function getChunkReloadTimestamp(): number | null {
  try {
    const storedValue = window.sessionStorage.getItem(CHUNK_RELOAD_FLAG)
    if (!storedValue) return null

    const timestamp = Number(storedValue)
    return Number.isFinite(timestamp) ? timestamp : Date.now()
  } catch {
    return null
  }
}

async function clearServiceWorkerCaches(): Promise<void> {
  const cacheKeys = typeof caches === 'undefined' ? [] : await caches.keys()
  await Promise.all(
    cacheKeys
      .filter((key) => key.startsWith('autamedica-'))
      .map((key) => caches.delete(key)),
  )

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration()
    registration?.active?.postMessage({ type: 'CLEAR_RUNTIME_CACHES' })
    await registration?.update()
  }
}

function reloadAfterCacheRefresh(): void {
  const cacheRefresh = clearServiceWorkerCaches().catch((error: unknown) => {
    console.warn('[SentryInit] Could not clear stale runtime caches', error)
  })
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 800))

  Promise.race([cacheRefresh, timeout]).finally(() => {
    window.location.reload()
  })
}

function handleStaleChunk(source: string, detail: unknown): void {
  if (typeof window === 'undefined') return

  // Evita loops: si ya recargamos en esta sesion, no insistir
  const lastReloadAt = getChunkReloadTimestamp()
  const alreadyReloaded =
    lastReloadAt !== null && Date.now() - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS

  console.warn('[SentryInit] Stale dynamic chunk detected', {
    source,
    detail,
    alreadyReloaded,
  })

  if (alreadyReloaded) return

  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, String(Date.now()))
  } catch {
    // sin sessionStorage hacemos best-effort: igual recargamos una vez
  }

  // Pequeño delay para dejar que Sentry envie el breadcrumb antes del reload
  window.setTimeout(reloadAfterCacheRefresh, 150)
}

export function SentryInit() {
  useEffect(() => {
    initClientSentry(window.__ENV)

    const lastReloadAt = getChunkReloadTimestamp()
    if (lastReloadAt !== null && Date.now() - lastReloadAt >= CHUNK_RELOAD_COOLDOWN_MS) {
      try {
        window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG)
      } catch {
        // ignore
      }
    }

    const onError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.message) || isChunkLoadError(event.error?.message)) {
        handleStaleChunk('window.error', event.message)
      }
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message =
        typeof reason === 'string'
          ? reason
          : reason?.message ?? reason?.toString?.() ?? ''
      if (isChunkLoadError(message)) {
        handleStaleChunk('unhandledrejection', message)
      }
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  return null
}
