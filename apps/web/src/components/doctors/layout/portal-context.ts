'use client'

import { createContext, useContext } from 'react'

import type { TabId } from '@/hooks/doctors/useDoctorWorkspaceState'

export type DoctorsPortalContextValue = {
  activeTab: TabId
  setActiveTab: (tab: TabId) => void
  userName: string
  isFocusMode: boolean
  setFocusMode: (focus: boolean) => void
  setActiveSection: (section: string | null) => void
  activePostId: string | null
  setActivePostId: (postId: string | null) => void
}

export const DoctorsPortalContext = createContext<DoctorsPortalContextValue | null>(null)

export function useDoctorsPortal(): DoctorsPortalContextValue {
  const value = useContext(DoctorsPortalContext)
  if (!value) {
    throw new Error('useDoctorsPortal must be used within DoctorsPortalShell')
  }
  return value
}
