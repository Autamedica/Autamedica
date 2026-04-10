'use client'

import { AuthProvider } from '@autamedica/auth/react';
import type { AuthState } from '@autamedica/auth/react';
import type { ReactNode } from 'react';
import { SessionSync } from './SessionSync';

import { isProduction } from '@autamedica/shared';

interface ClientWrapperProps {
  children: ReactNode
}

export function ClientWrapper({ children }: ClientWrapperProps) {
  const handleAuthStateChange = (state: AuthState) => {
    if (!state.session && !state.loading) {
      if (!isProduction()) {
        return
      }

      const authOrigin = window.location.origin
      const loginUrl = new URL('/auth/login', authOrigin)
      loginUrl.searchParams.set('portal', 'doctors')
      window.location.href = loginUrl.toString()
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
