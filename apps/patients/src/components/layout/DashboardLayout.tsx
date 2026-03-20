'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronRight,
  LogOut,
  Activity,
  Menu,
  User,
  X,
} from 'lucide-react';
import { getClientEnvOrDefault } from '@autamedica/shared';
import { TourHub } from '@/components/tours/TourHub';
import { AutaFloatingButton } from '@/components/chat/AutaFloatingButton';
import { IncomingCallHandler } from '@/components/calls/IncomingCallHandler';
import { PatientOnboarding } from '@/components/onboarding/PatientOnboarding';
import {
  dashboardBottomNavItems,
  dashboardNavigationItems,
  getPatientPortalRouteByPath,
} from '@/data/patient-navigation';
import { usePatientSession } from '@/hooks/usePatientSession';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileUserMenuOpen, setIsMobileUserMenuOpen] = useState(false);
  const { user, profile, patient, loading, signOut } = usePatientSession();
  const currentRoute = getPatientPortalRouteByPath(pathname);

  useEffect(() => {
    setIsUserMenuOpen(false);
    setIsMobileUserMenuOpen(false);
  }, [pathname]);

  const isPathActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const computedName = [profile?.firstName, profile?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const rawMetadata = user?.user_metadata;
  const metadata = rawMetadata && typeof rawMetadata === 'object'
    ? (rawMetadata as Record<string, unknown>)
    : null;
  const metaName = typeof metadata?.full_name === 'string'
    ? metadata.full_name
    : undefined;
  const emailLocal = user?.email?.split('@')[0];
  const incomingCallIds = useMemo(
    () =>
      Array.from(
        new Set(
          [patient?.id, user?.id].filter(
            (value): value is string => typeof value === 'string' && value.length > 0,
          ),
        ),
      ),
    [patient?.id, user?.id],
  );
  const userName = computedName || metaName || emailLocal || 'Paciente';
  const userEmail = user?.email || '';
  const currentLabel = currentRoute?.label ?? 'Portal';
  const currentEyebrow = currentRoute?.eyebrow ?? 'Portal';
  const currentDescription =
    currentRoute?.description ?? 'Acceso rápido a tus módulos y cuenta.';

  const handleSignOut = async () => {
    await signOut();
    const defaultAuthOrigin = window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : 'https://www.autamedica.com';
    const authOrigin = getClientEnvOrDefault('NEXT_PUBLIC_APP_URL', defaultAuthOrigin);
    const loginUrl = new URL('/auth/login', authOrigin);
    loginUrl.searchParams.set('portal', 'patients');
    window.location.href = loginUrl.toString();
  };

  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.09),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.08),_transparent_24%),#f8fafc]">
      <IncomingCallHandler patientIds={incomingCallIds} />
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-200/80 bg-white/90 backdrop-blur-xl md:flex">
        {/* Logo */}
        <div className="border-b border-slate-200/80 bg-gradient-to-br from-sky-50 via-white to-indigo-50 px-6 py-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 shadow-sm ring-1 ring-sky-200">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">
                AutaMedica
              </p>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Paciente</h1>
            </div>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm shadow-sky-100/60">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {currentEyebrow}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{currentLabel}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{currentDescription}</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="px-6 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Navegacion
          </p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-4" aria-label="Navegacion principal">
          {dashboardNavigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = isPathActive(item.href);

            return (
              <Link
                key={item.id}
                href={item.href}
                aria-label={`Ir a ${item.label}`}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-sky-50 text-sky-700 shadow-sm ring-1 ring-sky-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-5 w-5 transition-colors ${isActive ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-600'}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p>{item.label}</p>
                  <p className={`truncate text-[11px] ${isActive ? 'text-sky-600/80' : 'text-slate-400'}`}>
                    {item.eyebrow}
                  </p>
                </div>
                {isActive ? <ChevronRight className="h-4 w-4 text-sky-500" aria-hidden="true" /> : null}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-slate-200/80 bg-slate-50/80 p-5">
          <div className="relative">
            {isUserMenuOpen ? (
              <div className="absolute inset-x-0 bottom-[calc(100%+0.75rem)] z-20 rounded-3xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10">
                <UserMenuContent
                  loading={loading}
                  onSignOut={handleSignOut}
                  onNavigate={() => setIsUserMenuOpen(false)}
                />
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setIsUserMenuOpen((open) => !open)}
              aria-expanded={isUserMenuOpen}
              aria-label="Abrir menu de cuenta"
              className="flex w-full items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-sm font-semibold text-white shadow-sm">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{userName}</p>
                <p className="truncate text-xs text-slate-500">{userEmail}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  {currentLabel}
                </p>
              </div>
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                  isUserMenuOpen ? '-rotate-90' : 'rotate-90'
                }`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm md:hidden" role="dialog" aria-modal="true">
          <div className="relative h-full w-80 max-w-[88vw] border-r border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50 px-5 py-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">
                      AutaMedica
                    </p>
                    <span className="text-sm font-semibold text-slate-900">Paciente</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileUserMenuOpen(false);
                    setIsMobileMenuOpen(false);
                  }}
                  className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50"
                  aria-label="Cerrar menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {currentEyebrow}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{currentLabel}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{currentDescription}</p>
              </div>
            </div>
            <nav className="space-y-1 overflow-y-auto px-4 py-4">
              {dashboardNavigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = isPathActive(item.href);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => {
                      setIsMobileUserMenuOpen(false);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      isActive
                        ? 'bg-sky-50 text-sky-700 shadow-sm ring-1 ring-sky-100'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p>{item.label}</p>
                      <p className={`truncate text-[11px] ${isActive ? 'text-sky-600/80' : 'text-slate-400'}`}>
                        {item.eyebrow}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </nav>
            <div className="absolute inset-x-4 bottom-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-600 text-sm font-semibold text-white">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{userName}</p>
                  <p className="truncate text-xs text-slate-500">{userEmail}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileUserMenuOpen((open) => !open)}
                aria-expanded={isMobileUserMenuOpen}
                className="mt-3 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700"
              >
                Cuenta
                <ChevronRight
                  className={`h-4 w-4 text-slate-400 transition-transform ${
                    isMobileUserMenuOpen ? '-rotate-90' : 'rotate-90'
                  }`}
                  aria-hidden="true"
                />
              </button>
              {isMobileUserMenuOpen ? (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <UserMenuContent
                    loading={loading}
                    onSignOut={handleSignOut}
                    onNavigate={() => {
                      setIsMobileUserMenuOpen(false);
                      setIsMobileMenuOpen(false);
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {currentEyebrow}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-slate-900">{currentLabel}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" className="flex-1 overflow-auto pb-20 md:pb-0" role="main">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-3 bottom-3 z-40 rounded-3xl border border-slate-200/80 bg-white/95 p-2 shadow-xl shadow-slate-900/10 backdrop-blur md:hidden">
        <div className="flex items-center justify-around gap-1">
          {dashboardBottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = isPathActive(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-2 text-[10px] font-medium transition ${
                  isActive
                    ? 'bg-sky-50 text-sky-600'
                    : 'text-slate-400 active:text-slate-600'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{item.shortLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Auta AI */}
      <AutaFloatingButton />
    </div>
  );
}

function UserMenuContent({
  loading,
  onSignOut,
  onNavigate,
}: {
  loading: boolean;
  onSignOut: () => Promise<void>;
  onNavigate: () => void;
}) {
  return (
    <div className="space-y-2">
      <Link
        href="/profile"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
      >
        <User className="h-4 w-4" aria-hidden="true" />
        Perfil
      </Link>

      <PatientOnboarding autoStart={false} launcherVariant="sidebar" />
      <TourHub variant="sidebar" />

      <button
        onClick={onSignOut}
        disabled={loading}
        aria-label="Cerrar sesion y salir del portal"
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Cerrar sesion
      </button>
    </div>
  );
}
