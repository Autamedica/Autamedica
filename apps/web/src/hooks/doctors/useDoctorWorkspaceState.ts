'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { UUID } from '@/types/medical'

type TabId = 'patient-info' | 'medical-history' | 'prescriptions' | 'vital-signs' | 'ai-history'

type WorkspaceUrlState = {
  activeSection: string | null
  selectedPatientId: UUID | null
  activeTab: TabId
  activePostId: string | null
}

type UseDoctorWorkspaceStateOptions = {
  enableWorkspaceUrlState: boolean
  activeSection: string | null
  setActiveSection: (section: string | null) => void
  setIsSidebarOpen: (open: boolean) => void
  setIsSidebarCollapsed: (collapsed: boolean) => void
}

type UseDoctorWorkspaceStateResult = {
  activeTab: TabId
  setActiveTab: (tab: TabId) => void
  activePostId: string | null
  setActivePostId: (postId: string | null) => void
  selectedPatientId: UUID | null
  workspaceUrlStateReady: boolean
  handleSelectPatient: (patientId: string, preferredTab?: TabId) => void
  resetWorkspace: () => void
}

const DEFAULT_ACTIVE_TAB: TabId = 'patient-info'
const DOCTORS_DASHBOARD_PATH = '/doctors/dashboard'
const DOCTOR_PATIENT_ROUTE_PREFIX = '/doctors/patients/'
const WORKSPACE_QUERY_SECTION = 'section'
const WORKSPACE_QUERY_PATIENT = 'patientId'
const WORKSPACE_QUERY_TAB = 'tab'
const WORKSPACE_QUERY_POST = 'postId'

function extractPatientIdFromPath(pathname: string): UUID | null {
  if (!pathname.startsWith(DOCTOR_PATIENT_ROUTE_PREFIX)) {
    return null
  }

  const candidate = pathname.slice(DOCTOR_PATIENT_ROUTE_PREFIX.length).split('/')[0]?.trim()
  return candidate ? (candidate as UUID) : null
}

function isTabId(value: string | null): value is TabId {
  return (
    value === 'patient-info'
    || value === 'medical-history'
    || value === 'prescriptions'
    || value === 'vital-signs'
    || value === 'ai-history'
  )
}

function parseWorkspaceUrlState(url: URL): WorkspaceUrlState {
  const patientIdFromPath = extractPatientIdFromPath(url.pathname)
  const activeSection = patientIdFromPath ? null : (url.searchParams.get(WORKSPACE_QUERY_SECTION)?.trim() || null)
  const selectedPatientId = patientIdFromPath ?? (url.searchParams.get(WORKSPACE_QUERY_PATIENT)?.trim() || null)
  const requestedTab = url.searchParams.get(WORKSPACE_QUERY_TAB)
  const activePostId = patientIdFromPath
    ? null
    : (
    activeSection === 'community'
      ? (url.searchParams.get(WORKSPACE_QUERY_POST)?.trim() || null)
      : null
    )

  return {
    activeSection,
    selectedPatientId: selectedPatientId ? (selectedPatientId as UUID) : null,
    activeTab: selectedPatientId && isTabId(requestedTab) ? requestedTab : DEFAULT_ACTIVE_TAB,
    activePostId,
  }
}

function buildWorkspaceRelativeUrl(url: URL, state: WorkspaceUrlState): string {
  const nextUrl = new URL(url.toString())

  if (state.selectedPatientId && !state.activeSection) {
    nextUrl.pathname = `${DOCTOR_PATIENT_ROUTE_PREFIX}${state.selectedPatientId}`
  } else {
    nextUrl.pathname = DOCTORS_DASHBOARD_PATH
  }

  if (state.activeSection) {
    nextUrl.searchParams.set(WORKSPACE_QUERY_SECTION, state.activeSection)
  } else {
    nextUrl.searchParams.delete(WORKSPACE_QUERY_SECTION)
  }

  if (state.selectedPatientId) {
    nextUrl.searchParams.set(WORKSPACE_QUERY_PATIENT, state.selectedPatientId)
  } else {
    nextUrl.searchParams.delete(WORKSPACE_QUERY_PATIENT)
  }

  if (state.selectedPatientId && state.activeTab !== DEFAULT_ACTIVE_TAB) {
    nextUrl.searchParams.set(WORKSPACE_QUERY_TAB, state.activeTab)
  } else {
    nextUrl.searchParams.delete(WORKSPACE_QUERY_TAB)
  }

  if (state.activeSection === 'community' && state.activePostId) {
    nextUrl.searchParams.set(WORKSPACE_QUERY_POST, state.activePostId)
  } else {
    nextUrl.searchParams.delete(WORKSPACE_QUERY_POST)
  }

  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
}

export function useDoctorWorkspaceState({
  enableWorkspaceUrlState,
  activeSection,
  setActiveSection,
  setIsSidebarOpen,
  setIsSidebarCollapsed,
}: UseDoctorWorkspaceStateOptions): UseDoctorWorkspaceStateResult {
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_ACTIVE_TAB)
  const [activePostId, setActivePostId] = useState<string | null>(null)
  const [selectedPatientId, setSelectedPatientId] = useState<UUID | null>(null)
  const [workspaceUrlStateReady, setWorkspaceUrlStateReady] = useState(!enableWorkspaceUrlState)
  const didSyncWorkspaceUrlRef = useRef(false)

  const syncWorkspaceStateFromUrl = useCallback((url: URL) => {
    const nextState = parseWorkspaceUrlState(url)
    setActiveSection(nextState.activeSection)
    setSelectedPatientId(nextState.selectedPatientId)
    setActiveTab(nextState.activeTab)
    setActivePostId(nextState.activePostId)
  }, [setActiveSection])

  const handleSelectPatient = useCallback((patientId: string, preferredTab: TabId = DEFAULT_ACTIVE_TAB) => {
    setSelectedPatientId(patientId as UUID)
    setActiveTab(preferredTab)
    setActivePostId(null)
    setActiveSection(null)
    setIsSidebarOpen(false)
  }, [setActiveSection, setIsSidebarOpen])

  const resetWorkspace = useCallback(() => {
    setSelectedPatientId(null)
    setActiveSection(null)
    setActiveTab(DEFAULT_ACTIVE_TAB)
    setActivePostId(null)
    setIsSidebarOpen(false)
  }, [setActiveSection, setIsSidebarOpen])

  useEffect(() => {
    if (!enableWorkspaceUrlState || typeof window === 'undefined') {
      setWorkspaceUrlStateReady(true)
      return
    }

    syncWorkspaceStateFromUrl(new URL(window.location.href))
    setWorkspaceUrlStateReady(true)

    const handlePopState = () => {
      syncWorkspaceStateFromUrl(new URL(window.location.href))
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [enableWorkspaceUrlState, syncWorkspaceStateFromUrl])

  useEffect(() => {
    if (!enableWorkspaceUrlState || !workspaceUrlStateReady || typeof window === 'undefined') {
      return
    }

    const currentUrl = new URL(window.location.href)
    const nextRelativeUrl = buildWorkspaceRelativeUrl(currentUrl, {
      activeSection,
      selectedPatientId,
      activeTab,
      activePostId,
    })
    const currentRelativeUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`

    if (nextRelativeUrl !== currentRelativeUrl) {
      if (didSyncWorkspaceUrlRef.current) {
        window.history.pushState({}, '', nextRelativeUrl)
      } else {
        window.history.replaceState({}, '', nextRelativeUrl)
      }
    }

    didSyncWorkspaceUrlRef.current = true
  }, [
    activePostId,
    activeSection,
    activeTab,
    enableWorkspaceUrlState,
    selectedPatientId,
    workspaceUrlStateReady,
  ])

  useEffect(() => {
    if (selectedPatientId && !activeSection) {
      setIsSidebarCollapsed(true)
    }
  }, [activeSection, selectedPatientId, setIsSidebarCollapsed])

  return {
    activeTab,
    setActiveTab,
    activePostId,
    setActivePostId,
    selectedPatientId,
    workspaceUrlStateReady,
    handleSelectPatient,
    resetWorkspace,
  }
}

export { DEFAULT_ACTIVE_TAB }
export { DOCTORS_DASHBOARD_PATH }
export type { TabId }
