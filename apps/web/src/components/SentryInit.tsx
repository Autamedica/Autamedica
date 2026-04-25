'use client'

import { useEffect } from 'react'
import { initClientSentry } from '@/lib/observability/sentry'

const CHUNK_RELOAD_FLAG = '__autamedica_chunk_reload__'
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

function handleStaleChunk(source: string, detail: unknown) {
  if (typeof window === 'undefined') return

  // Evita loops: si ya recargamos en esta sesion, no insistir
  let alreadyReloaded = false
  try {
    alreadyReloaded = window.sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1'
  } catch {
    // sessionStorage puede fallar en modo privado; seguimos igual
  }

  console.warn('[SentryInit] Stale dynamic chunk detected', {
    source,
    detail,
    alreadyReloaded,
  })

  if (alreadyReloaded) return

  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1')
  } catch {
    // sin sessionStorage hacemos best-effort: igual recargamos una vez
  }

  // Pequeño delay para dejar que Sentry envie el breadcrumb antes del reload
  window.setTimeout(() => {
    window.location.reload()
  }, 150)
}

export function SentryInit() {
  useEffect(() => {
    initClientSentry(window.__ENV)

    // Limpia el flag de reload cuando la pagina cargo bien con los chunks nuevos
    try {
      window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG)
    } catch {
      // ignore
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
