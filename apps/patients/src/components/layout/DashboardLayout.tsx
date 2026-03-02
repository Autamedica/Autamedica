'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Calendar,
  FileText,
  Heart,
  User,
  LogOut,
  BookOpen,
  ShieldCheck,
  Activity,
  Menu,
  X,
} from 'lucide-react';
import { getClientEnvOrDefault } from '@autamedica/shared';
import { TourHub } from '@/components/tours/TourHub';
import { AutaFloatingButton } from '@/components/chat/AutaFloatingButton';
import { usePatientSession } from '@/hooks/usePatientSession';

interface DashboardLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Inicio', href: '/', icon: Home },
  { name: 'Mis Citas', href: '/appointments', icon: Calendar },
  { name: 'Mi Anamnesis', href: '/anamnesis', icon: BookOpen },
  { name: 'Historial Medico', href: '/medical-history', icon: FileText },
  { name: 'Salud Preventiva', href: '/preventive-health', icon: Heart },
  { name: 'Prevencion Embarazo', href: '/pregnancy-prevention', icon: ShieldCheck },
  { name: 'Perfil', href: '/profile', icon: User },
];

const bottomNavItems = [
  { name: 'Inicio', href: '/', icon: Home },
  { name: 'Citas', href: '/appointments', icon: Calendar },
  { name: 'Historial', href: '/medical-history', icon: FileText },
  { name: 'Salud', href: '/preventive-health', icon: Heart },
  { name: 'Perfil', href: '/profile', icon: User },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, profile, loading, signOut } = usePatientSession();

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
  const userName = computedName || metaName || emailLocal || 'Paciente';
  const userEmail = user?.email || '';

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
    <div className="flex h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
            <Activity className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">AutaMedica</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Navegacion principal">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.name}
                href={item.href}
                aria-label={`Ir a ${item.name}`}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-5 w-5 transition-colors ${isActive ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-600'}`} aria-hidden="true" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-slate-200 bg-slate-50/50 p-4">
          <div className="mb-4 flex items-center gap-3" role="group" aria-label="Informacion del usuario">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{userName}</p>
              <p className="truncate text-xs text-slate-500">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            disabled={loading}
            aria-label="Cerrar sesion y salir del portal"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Cerrar sesion
          </button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm md:hidden" role="dialog" aria-modal="true">
          <div className="relative h-full w-72 max-w-[85vw] border-r border-slate-200 bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-5">
              <span className="text-sm font-semibold text-slate-900">AutaMedica</span>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                aria-label="Cerrar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-1 overflow-y-auto px-3 py-4">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      isActive ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
            <div className="absolute inset-x-4 bottom-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{userName}</p>
                  <p className="text-xs text-slate-500">{userEmail}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
              <Activity className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-slate-900">AutaMedica</span>
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" className="flex-1 overflow-auto pb-16 md:pb-0" role="main">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white px-2 py-1.5 md:hidden">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition ${
                isActive ? 'text-sky-600' : 'text-slate-400 active:text-slate-600'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Tour Hub */}
      <TourHub />

      {/* Auta AI */}
      <AutaFloatingButton />
    </div>
  );
}
