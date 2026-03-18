"use client"

import { DynamicRightPanel } from '@/components/patients/layout/DynamicRightPanel'
import { usePatientSession } from '@/hooks/patients/usePatientSession'
import {
    Calendar,
    CheckCircle2,
    ClipboardList,
    FileText,
    Heart,
    MessageSquare,
    Video,
} from 'lucide-react'

function getPatientName(
  profile: ReturnType<typeof usePatientSession>['profile'],
  user: ReturnType<typeof usePatientSession>['user']
): string {
  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim()
  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  const metadataName = typeof metadata?.full_name === 'string' ? metadata.full_name : undefined
  const emailLocal = user?.email?.split('@')[0]

  return profileName || metadataName || emailLocal || 'Paciente'
}

export default function PatientsHomePage() {
  const { user, profile, patient } = usePatientSession()
  const userName = getPatientName(profile, user)

  const todayLabel = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  const hasBirthDate = Boolean(patient?.birthDate)
  const hasGender = Boolean(patient?.gender)
  const hasEmergencyContact = Boolean(patient?.emergencyContact)
  const profileCompletion = Math.round(
    ([hasBirthDate, hasGender, hasEmergencyContact].filter(Boolean).length / 3) * 100
  )

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/30">
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="relative overflow-hidden border-b border-white/40 bg-white/60 px-8 py-10 backdrop-blur-xl">
          <img 
            src="/portals/portal-pacientes.webp"
            alt="" 
            className="absolute right-0 top-0 h-full w-1/3 object-cover opacity-10 mix-blend-multiply transition-opacity duration-1000" 
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-indigo-600/5" />
          <div className="relative">
            <p className="inline-flex rounded-full bg-blue-100/50 px-3 py-1 text-xs font-semibold tracking-wide text-blue-800">Panel de paciente</p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">Resumen de salud de <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">{userName}</span></h1>
            <p className="mt-3 text-base font-medium text-slate-600 max-w-2xl">
              {todayLabel}. Priorizamos contexto clínico y acciones claras para tu seguimiento.
            </p>
          </div>
        </div>

        <div className="grid gap-6 px-8 py-8 md:grid-cols-3">
          <article className="group relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/5">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                <Calendar className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">Próxima consulta</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">No hay una videollamada activa en este momento.</p>
              <a
                href="/patients/appointments"
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-600 hover:shadow-md hover:shadow-blue-500/25 active:scale-95"
              >
                Ver agenda
              </a>
            </div>
          </article>

          <article className="group relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-900/5">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                <ClipboardList className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">Anamnesis</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Completa y actualiza tu historia clínica para mejorar cada consulta.
              </p>
              <a
                href="/patients/anamnesis"
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition-all hover:bg-indigo-100 hover:text-indigo-900 active:scale-95"
              >
                Continuar anamnesis
              </a>
            </div>
          </article>

          <article className="group relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-900/5">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="flex items-end text-3xl font-extrabold tracking-tight text-slate-900">
                  {profileCompletion}<span className="mb-1 ml-1 text-sm font-semibold text-slate-500">%</span>
                </div>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">Perfil clínico</h3>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-1000 ease-out" style={{ width: `${profileCompletion}%` }} />
              </div>
              <p className="mt-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Completado</p>

              {profileCompletion < 100 && (
                <a
                  href="/patients/profile"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-all hover:bg-emerald-100 hover:text-emerald-900 active:scale-95"
                >
                  Completar perfil
                </a>
              )}
            </div>
          </article>
        </div>

        <div className="px-8 pb-10">
          <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-8 shadow-sm backdrop-blur-xl">
            <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-gradient-to-br from-blue-100/40 to-indigo-100/40 blur-3xl" />
            <div className="relative">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Acciones rápidas</h2>
              <p className="mt-1 text-sm text-slate-500">Accede directamente a los servicios principales de AutaMedica.</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <a
                  href="/patients/appointments"
                  className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-transparent bg-slate-50 px-4 py-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-blue-100 hover:bg-blue-50/50 hover:shadow-lg hover:shadow-blue-500/5 active:scale-95"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                    <Video className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-slate-800 transition-colors group-hover:text-blue-900">Gestionar citas</span>
                </a>

                <a
                  href="/patients/medical-history"
                  className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-transparent bg-slate-50 px-4 py-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-indigo-100 hover:bg-indigo-50/50 hover:shadow-lg hover:shadow-indigo-500/5 active:scale-95"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                    <FileText className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-slate-800 transition-colors group-hover:text-indigo-900">Ver historial</span>
                </a>

                <a
                  href="/patients/preventive-health"
                  className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-transparent bg-slate-50 px-4 py-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-emerald-100 hover:bg-emerald-50/50 hover:shadow-lg hover:shadow-emerald-500/5 active:scale-95"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                    <Heart className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-slate-800 transition-colors group-hover:text-emerald-900">Salud preventiva</span>
                </a>

                <a
                  href="/patients/community"
                  className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-transparent bg-slate-50 px-4 py-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-pink-100 hover:bg-pink-50/50 hover:shadow-lg hover:shadow-pink-500/5 active:scale-95"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100 text-pink-600 transition-colors group-hover:bg-pink-600 group-hover:text-white">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-slate-800 transition-colors group-hover:text-pink-900">Comunidad</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DynamicRightPanel context="dashboard" />
    </div>
  )
}
