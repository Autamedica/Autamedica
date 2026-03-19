'use client';

import { DynamicRightPanel } from '@/components/layout/DynamicRightPanel';
import { usePatientSession } from '@/hooks/usePatientSession';
import {
    Calendar,
    FileText,
    Heart,
    MessageSquare,
    Video,
    ChevronRight,
    Activity
} from 'lucide-react';
import Link from 'next/link';

function getPatientName(
  profile: ReturnType<typeof usePatientSession>['profile'],
  user: ReturnType<typeof usePatientSession>['user']
): string {
  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
  const metadata = user?.user_metadata as Record<string, unknown> | undefined;
  const metadataName = [metadata?.first_name, metadata?.last_name].filter(Boolean).join(' ').trim() || undefined;
  const emailLocal = user?.email?.split('@')[0];

  return profileName || metadataName || emailLocal || 'Paciente';
}

export default function DashboardPage() {
  const { user, profile } = usePatientSession();
  const userName = getPatientName(profile, user);

  const todayLabel = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F8FAFC]">
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Header Section */}
        <header className="bg-white border-b border-slate-200 px-8 py-10">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                <Activity className="h-3.5 w-3.5" />
                Portal de Paciente
              </span>
              <span className="text-sm font-medium text-slate-500 capitalize tracking-wide">
                {todayLabel}
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Hola, {userName}
            </h1>
            <p className="mt-3 text-base text-slate-600 max-w-2xl leading-relaxed">
              Bienvenido a tu panel de salud. Aquí puedes gestionar tus consultas, revisar tu historial clínico y completar tu información médica.
            </p>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-8 py-10 max-w-5xl mx-auto w-full">
          
          {/* Priority Cards */}
          <div className="grid gap-6 md:grid-cols-2 mb-10">
            {/* Próxima Consulta */}
            <article className="relative flex flex-col bg-white rounded-2xl border border-slate-200 p-6 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Calendar className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">Próxima consulta</h3>
              </div>
              <p className="text-sm text-slate-600 flex-1">
                No tienes videollamadas programadas en este momento.
              </p>
              <Link
                href="/appointments"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
              >
                Ver agenda
                <ChevronRight className="h-4 w-4" />
              </Link>
            </article>

            {/* Consultas */}
            <Link
              href="/appointments"
              className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600">
                  <Video className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">Consultas</h3>
              </div>
              <p className="text-sm text-slate-600 flex-1">
                Agenda una cita o ingresa a una consulta desde tu panel principal.
              </p>
              <span className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors group-hover:bg-slate-50 group-hover:text-slate-900">
                Agendar o ingresar
                <ChevronRight className="h-4 w-4" />
              </span>
            </Link>

          </div>

          {/* Quick Actions */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Servicios disponibles</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Link
                href="/results"
                className="group flex flex-col items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-600 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-900">Resultados</h4>
                  <p className="mt-1 text-xs text-slate-500">Laboratorio, estudios e informes</p>
                </div>
              </Link>

              <Link
                href="/preventive-health"
                className="group flex flex-col items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-600 transition-colors group-hover:bg-emerald-50 group-hover:text-emerald-600">
                  <Heart className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-900">Prevención</h4>
                  <p className="mt-1 text-xs text-slate-500">Chequeos de salud</p>
                </div>
              </Link>

              <Link
                href="/community"
                className="group flex flex-col items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-600 transition-colors group-hover:bg-pink-50 group-hover:text-pink-600">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-900">Comunidad</h4>
                  <p className="mt-1 text-xs text-slate-500">Foros y artículos</p>
                </div>
              </Link>
            </div>
          </section>

        </main>
      </div>

      <DynamicRightPanel context="dashboard" />
    </div>
  );
}
