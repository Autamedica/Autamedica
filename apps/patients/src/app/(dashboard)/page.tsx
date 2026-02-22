'use client';

import Link from 'next/link';
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  FileText,
  Heart,
  MessageSquare,
  Video,
} from 'lucide-react';
import { DynamicRightPanel } from '@/components/layout/DynamicRightPanel';
import { usePatientSession } from '@/hooks/usePatientSession';

function getPatientName(
  profile: ReturnType<typeof usePatientSession>['profile'],
  user: ReturnType<typeof usePatientSession>['user']
): string {
  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
  const metadata = user?.user_metadata as Record<string, unknown> | undefined;
  const metadataName = typeof metadata?.full_name === 'string' ? metadata.full_name : undefined;
  const emailLocal = user?.email?.split('@')[0];

  return profileName || metadataName || emailLocal || 'Paciente';
}

export default function DashboardPage() {
  const { user, profile, patient } = usePatientSession();
  const userName = getPatientName(profile, user);

  const todayLabel = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const hasBirthDate = Boolean(patient?.birthDate);
  const hasGender = Boolean(patient?.gender);
  const hasEmergencyContact = Boolean(patient?.emergencyContact);
  const profileCompletion = Math.round(
    ([hasBirthDate, hasGender, hasEmergencyContact].filter(Boolean).length / 3) * 100
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-ivory-base">
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="border-b border-stone-200 bg-white px-6 py-5">
          <p className="editorial-kicker">Panel de paciente</p>
          <h1 className="editorial-title mt-2 text-3xl text-stone-900">Resumen de salud de {userName}</h1>
          <p className="editorial-lede mt-2 text-sm text-stone-600">
            {todayLabel}. Priorizamos contexto clinico y acciones claras para tu seguimiento.
          </p>
        </div>

        <div className="grid gap-4 px-6 py-6 md:grid-cols-3">
          <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-stone-700">
              <Calendar className="h-5 w-5" />
              <p className="text-sm font-semibold">Proxima consulta</p>
            </div>
            <p className="mt-3 text-sm text-stone-600">No hay una videollamada activa en este momento.</p>
            <Link
              href="/appointments"
              className="mt-4 inline-flex items-center rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-stone-700"
            >
              Ver agenda
            </Link>
          </article>

          <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-stone-700">
              <ClipboardList className="h-5 w-5" />
              <p className="text-sm font-semibold">Anamnesis</p>
            </div>
            <p className="mt-3 text-sm text-stone-600">
              Completa y actualiza tu historia clinica para mejorar cada consulta.
            </p>
            <Link
              href="/anamnesis"
              className="mt-4 inline-flex items-center rounded-lg bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-900 transition hover:bg-stone-200"
            >
              Continuar anamnesis
            </Link>
          </article>

          <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-stone-700">
              <CheckCircle2 className="h-5 w-5" />
              <p className="text-sm font-semibold">Perfil clinico</p>
            </div>
            <p className="mt-3 text-3xl font-bold text-stone-900">{profileCompletion}%</p>
            <p className="mt-1 text-sm text-stone-600">de campos clave completados</p>
            {profileCompletion < 100 && (
              <Link
                href="/profile"
                className="mt-4 inline-flex items-center rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-200"
              >
                Completar perfil
              </Link>
            )}
          </article>
        </div>

        <div className="px-6 pb-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-stone-900">Acciones rapidas</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Link
                href="/appointments"
                className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-800 transition hover:bg-stone-100"
              >
                <Video className="h-4 w-4" />
                Gestionar citas
              </Link>
              <Link
                href="/medical-history"
                className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-800 transition hover:bg-stone-100"
              >
                <FileText className="h-4 w-4" />
                Ver historial
              </Link>
              <Link
                href="/preventive-health"
                className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-800 transition hover:bg-stone-100"
              >
                <Heart className="h-4 w-4" />
                Salud preventiva
              </Link>
              <Link
                href="/community"
                className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-800 transition hover:bg-stone-100"
              >
                <MessageSquare className="h-4 w-4" />
                Comunidad
              </Link>
            </div>
          </div>
        </div>
      </div>

      <DynamicRightPanel context="dashboard" />
    </div>
  );
}
