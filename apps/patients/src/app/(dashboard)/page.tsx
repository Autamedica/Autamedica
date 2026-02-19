'use client';

import dynamic from 'next/dynamic';
import { DynamicRightPanel } from '@/components/layout/DynamicRightPanel';
import { usePatientSession } from '@/hooks/usePatientSession';

const RealVideoCall = dynamic(
  () => import('@/components/telemedicine/RealVideoCall').then(mod => ({ default: mod.RealVideoCall })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-stone-900">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-white"></div>
      </div>
    ),
  }
);

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
  const { user, profile } = usePatientSession();
  const userName = getPatientName(profile, user);
  const nextAppointment: string | null = null;
  const roomId = `patient-room-${user?.id || 'demo'}`;
  const todayLabel = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="flex h-screen w-full overflow-hidden bg-ivory-base">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-stone-200 bg-white px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="editorial-kicker">Panel de paciente</p>
              <h1 className="editorial-title mt-2 text-3xl text-stone-900">Resumen de salud de {userName}</h1>
              <p className="editorial-lede mt-2 text-sm text-stone-600">
                {todayLabel}. Entregamos contexto clinico para decisiones informadas, sin presion comercial.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600"></span>
                <span className="text-xs font-medium text-emerald-700">Sesion segura activa</span>
              </div>
              {nextAppointment && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5">
                  <span className="text-xs font-medium text-blue-700">Proxima cita: {nextAppointment}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <RealVideoCall roomId={roomId} className="h-full w-full" />
        </div>
      </div>

      <DynamicRightPanel context="dashboard" />
    </div>
  );
}
