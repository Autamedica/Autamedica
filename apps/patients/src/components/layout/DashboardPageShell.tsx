'use client'

import type { ReactNode } from 'react'
import type { PatientPortalAside } from '@/data/patient-navigation'
import { DashboardLayout } from './DashboardLayout'
import { DynamicRightPanel } from './DynamicRightPanel'

type DashboardPanelContext = 'dashboard' | 'video' | 'appointments' | 'history'

type DashboardPageShellProps = {
  children: ReactNode
  contentClassName?: string
  aside?: PatientPortalAside
  panelContext?: DashboardPanelContext
  showRightPanel?: boolean
}

function resolveAside(
  aside: PatientPortalAside | undefined,
  panelContext: DashboardPanelContext,
  showRightPanel: boolean
): PatientPortalAside {
  if (aside) {
    return aside
  }

  if (!showRightPanel) {
    return 'none'
  }

  switch (panelContext) {
    case 'video':
      return 'video'
    case 'appointments':
      return 'appointments'
    case 'history':
      return 'history'
    default:
      return 'summary'
  }
}

function contextFromAside(aside: Exclude<PatientPortalAside, 'none'>): DashboardPanelContext {
  switch (aside) {
    case 'video':
      return 'video'
    case 'appointments':
      return 'appointments'
    case 'history':
      return 'history'
    default:
      return 'dashboard'
  }
}

export function DashboardPageShell({
  children,
  contentClassName = 'mx-auto w-full max-w-7xl p-6 lg:p-8',
  aside,
  panelContext = 'dashboard',
  showRightPanel = true,
}: DashboardPageShellProps) {
  const resolvedAside = resolveAside(aside, panelContext, showRightPanel)

  return (
    <DashboardLayout>
      <div className="flex min-h-full bg-slate-50">
        <section className="min-w-0 flex-1">
          <div className={contentClassName}>{children}</div>
        </section>
        {resolvedAside !== 'none' ? (
          <div className="hidden shrink-0 2xl:block">
            <DynamicRightPanel context={contextFromAside(resolvedAside)} />
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  )
}
