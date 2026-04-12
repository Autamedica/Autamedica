"use client";

import { OnboardingReminder } from "@/components/doctors/OnboardingReminder";
import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { useCheckDoctorExists } from "@/hooks/doctors/useCheckDoctorExists";
import { useDoctorStats } from "@/hooks/doctors/useDoctorStats";
import { useCurrentDoctor } from "@/hooks/doctors/useRealDoctors";
import type { Locale } from "@/i18n/index";
import { getOnboardingStatus } from "@/lib/onboarding-grace";
import { ArrowRight, ArrowUpRight, Calendar, FileText, Users } from "lucide-react";
import { motion } from "framer-motion";
import type { JSX } from "react";
import { useMemo } from "react";

interface DoctorsDashboardPageProps {
  locale?: Locale;
}

function getDoctorDisplayName(
  doctor: ReturnType<typeof useCurrentDoctor>["doctor"],
  user: ReturnType<typeof useAuthenticatedUser>["user"],
): string {
  const doctorProfile = doctor?.profile as
    | {
        full_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
      }
    | undefined;

  const userProfile = user?.profile;

  const fullName =
    doctorProfile?.full_name?.trim() ||
    [doctorProfile?.first_name, doctorProfile?.last_name].filter(Boolean).join(" ").trim() ||
    userProfile?.fullName?.trim() ||
    [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(" ").trim();

  return fullName || "Doctor/a";
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  trend,
  index,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  subtitle: string;
  trend?: string | null;
  index: number;
}): JSX.Element {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
      className="rounded-[22px] border border-am-surface-200/80 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-am-doctor-50 to-cyan-50 text-am-doctor-600">
          <Icon className="h-5 w-5" />
        </div>
        {trend ? (
          <span className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700">
            {trend}
          </span>
        ) : null}
      </div>
      <p className="text-sm font-medium text-am-surface-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-am-surface-900">{value}</p>
      <p className="mt-2 text-sm text-am-surface-600">{subtitle}</p>
    </motion.article>
  );
}

export function DoctorsDashboardPage({ locale: _locale }: DoctorsDashboardPageProps): JSX.Element {
  const { user } = useAuthenticatedUser();
  const { doctor } = useCurrentDoctor(user?.id);
  const { stats, loading: statsLoading } = useDoctorStats(doctor?.id, user?.id);
  const { exists: doctorExists } = useCheckDoctorExists(user?.id);

  const onboardingStatus = useMemo(
    () => getOnboardingStatus(user?.onboardingCompletedAt, user?.createdAt),
    [user?.createdAt, user?.onboardingCompletedAt],
  );

  const doctorName = getDoctorDisplayName(doctor, user);

  const statsCards = useMemo(
    () => [
      {
        label: "Consultas hoy",
        value: String(stats?.todayCount ?? 0),
        subtitle: stats?.nextAppointment
          ? `Próxima: ${stats.nextAppointment.time} con ${stats.nextAppointment.patientName}`
          : "Agenda despejada por ahora",
        trend: stats?.activeCount ? `${stats.activeCount} activas` : null,
        icon: Calendar,
      },
      {
        label: "Pacientes activos",
        value: String(stats?.patientsCount ?? 0),
        subtitle: "Seguimiento y continuidad asistencial",
        trend: doctorExists === false ? "Onboarding pendiente" : null,
        icon: Users,
      },
      {
        label: "Historiales",
        value: String(stats?.historyCount ?? 0),
        subtitle: "Registros clínicos disponibles",
        trend: stats?.rankingPosition ? `#${stats.rankingPosition}` : null,
        icon: FileText,
      },
    ],
    [doctorExists, stats],
  );

  return (
    <DoctorsPortalFrame
      title={`Dashboard de ${doctorName}`}
      description="Tu agenda clínica de hoy, con accesos rápidos a agenda, pacientes y teleconsulta desde una sola vista."
      activeSection="dashboard"
    >
      <div className="space-y-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {statsCards.map((item, index) => (
            <StatCard
              key={item.label}
              icon={item.icon}
              label={item.label}
              value={item.value}
              subtitle={item.subtitle}
              trend={item.trend}
              index={index}
            />
          ))}
        </div>

        <section className="rounded-[24px] border border-am-surface-200/80 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-am-surface-900">
                Próximas consultas
              </h2>
              <p className="mt-1 text-sm text-am-surface-500">
                Gestiona agenda, pacientes e historial desde accesos rápidos.
              </p>
            </div>
            <a
              href="/doctors/agenda"
              className="group inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-sm font-semibold text-am-doctor-600 transition-all hover:bg-am-doctor-50 hover:text-am-doctor-700"
            >
              Ver agenda completa
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </div>

          <div className="mt-6 rounded-[20px] border border-dashed border-am-surface-200 bg-am-surface-50/70 p-6">
            {stats?.nextAppointment ? (
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-am-surface-900">
                    {stats.nextAppointment.patientName}
                  </p>
                  <p className="mt-1 text-sm text-am-surface-600">
                    Consulta programada para las {stats.nextAppointment.time}.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="/doctors/agenda"
                    className="inline-flex items-center justify-center rounded-xl border border-am-surface-200 bg-white px-4 py-2.5 text-sm font-medium text-am-surface-700 transition-colors hover:border-am-doctor-300 hover:text-am-surface-900"
                  >
                    Ver detalles
                  </a>
                  <a
                    href="/doctors/call/index"
                    className="inline-flex items-center justify-center rounded-xl bg-am-doctor-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-am-doctor-600"
                  >
                    Abrir teleconsulta
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-am-surface-900">
                    No hay consultas cargadas para hoy.
                  </p>
                  <p className="mt-1 text-sm text-am-surface-600">
                    Aprovecha para revisar expedientes, actualizar notas o abrir tu agenda.
                  </p>
                </div>
                <a
                  href="/doctors/patients"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-am-doctor-600 shadow-sm ring-1 ring-am-surface-200 transition-colors hover:bg-am-doctor-50"
                >
                  Ir a pacientes
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            )}
          </div>
        </section>

        {onboardingStatus.state === "grace_period" ? (
          <div>
            <OnboardingReminder daysRemaining={onboardingStatus.daysRemaining} />
          </div>
        ) : null}

        {statsLoading ? (
          <p className="text-sm text-am-surface-500">Actualizando métricas del dashboard...</p>
        ) : null}
      </div>
    </DoctorsPortalFrame>
  );
}
