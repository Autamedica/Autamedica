'use client'

import { createBrowserClient } from '@autamedica/auth/client'

export function createClient(): ReturnType<typeof createBrowserClient> | null {
  try {
    return createBrowserClient()
  } catch {
    return null
  }
}
