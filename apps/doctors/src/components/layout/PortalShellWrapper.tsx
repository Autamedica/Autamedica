'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { DoctorsPortalShell } from './DoctorsPortalShell'

const PUBLIC_PATHS = ['/test-call', '/consultation', '/auth/callback']

/**
 * Renders DoctorsPortalShell for authenticated routes.
 * Public routes (/test-call, /consultation, /auth/callback) bypass the shell.
 */
export function PortalShellWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )

  if (isPublic) return <>{children}</>
  return <DoctorsPortalShell>{children}</DoctorsPortalShell>
}
