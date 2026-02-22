'use client'

import type { ReactNode } from 'react'
import { AuthProvider } from '@autamedica/auth/react'
import { SessionSync } from './SessionSync'

interface ClientWrapperProps {
  children: ReactNode
}

export function ClientWrapper({ children }: ClientWrapperProps) {
  const handleAuthStateChange = (event: string, session: any) => {
    if (event === 'SIGNED_OUT') {
      const authOrigin = process.env.NEXT_PUBLIC_APP_URL || (
        process.env.NODE_ENV === 'production'
          ? 'https://www.autamedica.com'
          : 'http://localhost:3000'
      )
      const loginUrl = new URL('/auth/login', authOrigin)
      loginUrl.searchParams.set('portal', 'doctors')
      window.location.href = loginUrl.toString()
    }
    if (event === 'SIGNED_IN' && session?.user) {
      // logger.info('🔐 Doctor authenticated:', session.user.email)
    }
  }

  return (
    <>
      <SessionSync />
      <AuthProvider onAuthStateChange={handleAuthStateChange}>
        {children}
      </AuthProvider>
    </>
  )
}
