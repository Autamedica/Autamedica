'use client'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PatientPortalProvider } from '@/components/layout/PatientPortalShell'
import type { ReactNode } from 'react'

type PatientRootLayoutProps = {
  children: ReactNode
}

export function PatientRootLayout({ children }: PatientRootLayoutProps): ReactNode {
  return (
    <ErrorBoundary>
      <PatientPortalProvider>
        {children}
      </PatientPortalProvider>
    </ErrorBoundary>
  )
}
