'use client';

import { ReactNode } from 'react';
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
  Activity
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
  { name: 'Historial Médico', href: '/medical-history', icon: FileText },
  { name: 'Salud Preventiva', href: '/preventive-health', icon: Heart },
  { name: 'Prevención Embarazo', href: '/pregnancy-prevention', icon: ShieldCheck },
  { name: 'Perfil', href: '/profile', icon: User },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();

  // Obtener sesión de paciente
  const { user, profile, loading, signOut } = usePatientSession();

  // Datos del usuario con fallbacks personalizados
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
    // Redirigir al auth centralizado después de cerrar sesión
    const defaultAuthOrigin = window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : 'https://www.autamedica.com';
    const authOrigin = getClientEnvOrDefault('NEXT_PUBLIC_APP_URL', defaultAuthOrigin);
    const loginUrl = new URL('/auth/login', authOrigin);
    loginUrl.searchParams.set('portal', 'patients');
    window.location.href = loginUrl.toString();
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC]">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col z-10">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Activity className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">AutaMedica</h1>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1.5 scrollbar-hide" aria-label="Navegación principal">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.name}
                href={item.href}
                aria-label={`Ir a ${item.name}`}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-5 w-5 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} aria-hidden="true" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-4" role="group" aria-label="Información del usuario">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 font-semibold text-sm">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {userName}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {userEmail}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            disabled={loading}
            aria-label="Cerrar sesión y salir del portal"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main id="main-content" className="flex-1 overflow-hidden relative" role="main">
        {children}
      </main>

      {/* Tour Hub - Guías interactivas flotantes */}
      <TourHub />

      {/* Auta AI - Asistente flotante */}
      <AutaFloatingButton />
    </div>
  );
}
