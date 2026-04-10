'use client'

import { AuthProvider } from '@autamedica/auth/react';
import type { AuthState } from '@autamedica/auth/react';
import type { ReactNode } from 'react';
import { SessionSync } from './SessionSync';

import { isProduction } from '@autamedica/shared';

const DOCTOR_PORTAL_ROLES = new Set(['doctor', 'organization_admin', 'platform_admin', 'admin'])

function resolveRolePortalUrl(role: string): string {
  if (!isProduction()) return '/'
  const PROD_PORTALS: Record<string, string> = {
    patient: 'https://paciente.autamedica.com',
    company: 'https://empresa.autamedica.com',
    company_admin: 'https://empresa.autamedica.com',
  }
  return PROD_PORTALS[role] ?? '/auth/select-role'
}

interface ClientWrapperProps {
  children: ReactNode
}

export function ClientWrapper({ children }: ClientWrapperProps) {
  const handleAuthStateChange = (state: AuthState) => {
    if (state.loading) return

    if (!state.session) {
      if (!isProduction()) {
        return
      }

      const authOrigin = window.location.origin
      const loginUrl = new URL('/auth/login', authOrigin)
      loginUrl.searchParams.set('portal', 'doctors')
      window.location.href = loginUrl.toString()
      return
    }

    // Role guard: redirect users whose role does not belong in the doctor portal
    const role = state.profile?.role
    if (role && !DOCTOR_PORTAL_ROLES.has(role)) {
      window.location.href = resolveRolePortalUrl(role)
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
