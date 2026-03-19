'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  getPatientPortalRouteByPath,
  type PatientPortalAside,
} from '@/data/patient-navigation'
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
  contentClassName = 'w-full',
  aside,
  panelContext = 'dashboard',
  showRightPanel = true,
}: DashboardPageShellProps) {
  const pathname = usePathname()
  const currentRoute = getPatientPortalRouteByPath(pathname)
  const RouteIcon = currentRoute?.icon
  const resolvedAside = resolveAside(aside, panelContext, showRightPanel)

  return (
    <DashboardLayout>
      <div className="min-h-full px-4 py-4 lg:px-6 lg:py-6">
        <div className="mx-auto flex w-full max-w-[1560px] gap-6">
          <section className="min-w-0 flex-1 space-y-6">
            <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.95)_55%,_rgba(224,231,255,0.92))] p-6 shadow-sm shadow-slate-900/5 lg:p-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-stone-900 text-white shadow-sm">
                    {RouteIcon ? <RouteIcon className="h-6 w-6" /> : null}
                  </div>
                  <div className="max-w-3xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      {currentRoute?.eyebrow ?? 'Vista editorial'}
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 lg:text-3xl">
                      {currentRoute?.label ?? 'Detalle de paciente'}
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 lg:text-base">
                      {currentRoute?.description ??
                        'Explora el módulo con una lectura más enfocada y sin duplicar navegación.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                    Shell editorial
                  </span>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
                    Contexto enfocado
                  </span>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white/95 shadow-sm shadow-slate-900/5 backdrop-blur">
              <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                  <span className="rounded-full bg-white px-2.5 py-1 shadow-sm ring-1 ring-slate-200">
                    Layout de detalle
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 shadow-sm ring-1 ring-slate-200">
                    Sin navegación duplicada
                  </span>
                </div>
              </div>
              <div className={`px-6 py-6 lg:px-8 lg:py-8 ${contentClassName}`}>{children}</div>
            </div>
          </section>
        {resolvedAside !== 'none' ? (
            <aside className="hidden w-[360px] shrink-0 2xl:block">
              <div className="sticky top-6 overflow-hidden rounded-[32px] border border-slate-200 bg-white/90 shadow-sm shadow-slate-900/5 backdrop-blur">
                <div className="border-b border-stone-200 bg-[linear-gradient(135deg,_rgba(250,245,255,0.9),_rgba(255,255,255,0.98)_55%,_rgba(239,246,255,0.88))] px-5 py-4 text-stone-900">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">
                    Panel contextual
                  </p>
                  <p className="mt-1 text-sm text-stone-600">
                    Resumen lateral sin competir con la pantalla principal.
                  </p>
                </div>
                <DynamicRightPanel context={contextFromAside(resolvedAside)} />
              </div>
            </aside>
        ) : null}
        </div>
      </div>
    </DashboardLayout>
  )
}
