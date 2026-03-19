'use client';

import Link from 'next/link';
import React, { createContext, useContext, useState } from 'react';
import { ArrowLeft, HeartPulse } from 'lucide-react';

interface PatientPortalContextType {
  isFocusMode: boolean;
  setFocusMode: (_focus: boolean) => void;
  activePanel: string | null;
  setActivePanel: (_panel: string | null) => void;
  isQuickActionsVisible: boolean;
  setQuickActionsVisible: (_visible: boolean) => void;
}

const PatientPortalContext = createContext<PatientPortalContextType | null>(null);

export function usePatientPortal() {
  const context = useContext(PatientPortalContext);
  if (!context) {
    throw new Error('usePatientPortal must be used within PatientPortalProvider');
  }
  return context;
}

interface PatientPortalProviderProps {
  children: React.ReactNode;
}

export function PatientPortalProvider({ children }: PatientPortalProviderProps) {
  const [isFocusMode, setFocusMode] = useState(false);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [isQuickActionsVisible, setQuickActionsVisible] = useState(false);

  const value = {
    isFocusMode,
    setFocusMode,
    activePanel,
    setActivePanel,
    isQuickActionsVisible,
    setQuickActionsVisible,
  };

  return (
    <PatientPortalContext.Provider value={value}>
      {children}
    </PatientPortalContext.Provider>
  );
}

interface PatientPortalShellProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  modeLabel?: string;
  backHref?: string;
  actions?: React.ReactNode;
}

export function PatientPortalShell({
  children,
  className = '',
  title = 'Modo inmersivo',
  subtitle = 'Experiencia enfocada para videollamada, seguimiento y acciones críticas.',
  modeLabel = 'Patient Portal Shell',
  backHref,
  actions,
}: PatientPortalShellProps) {
  const { isFocusMode } = usePatientPortal();

  return (
    <div
      className={`relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.16),_transparent_18%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.16),_transparent_28%),linear-gradient(135deg,#1c1917_0%,#0c0a09_55%,#1f2937_100%)] text-white ${
        isFocusMode ? 'overflow-hidden' : ''
      } ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute left-10 top-10 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute right-8 top-24 h-64 w-64 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-stone-200/10 blur-3xl" />
      </div>

      <div className={`relative flex min-h-screen flex-col ${isFocusMode ? 'p-3' : 'p-4 lg:p-6'}`}>
        <div className="mb-4 overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-2xl shadow-slate-950/25 backdrop-blur-xl">
          <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-200 ring-1 ring-white/10">
                <HeartPulse className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">
                  {modeLabel}
                </p>
                <h1 className="mt-2 text-xl font-semibold tracking-tight text-white lg:text-2xl">
                  {title}
                </h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">{subtitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {backHref ? (
                <Link
                  href={backHref}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver al portal
                </Link>
              ) : null}
              {actions}
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[32px] border border-white/10 bg-stone-950/55 shadow-[0_30px_80px_rgba(28,25,23,0.55)] backdrop-blur-md">
          {children}
        </div>
      </div>

      {/* Focus mode overlay */}
      {isFocusMode && (
        <div className="pointer-events-none fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" />
      )}
    </div>
  );
}
