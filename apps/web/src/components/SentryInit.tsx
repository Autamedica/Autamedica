'use client'

import { useEffect } from 'react'
import { initClientSentry } from '@/lib/observability/sentry'

export function SentryInit() {
  useEffect(() => {
    initClientSentry(window.__ENV)
  }, [])

  return null
}
