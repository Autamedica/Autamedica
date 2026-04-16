"use client";

import { OnboardingReminder } from "@/components/doctors/OnboardingReminder";
import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { useCheckDoctorExists } from "@/hooks/doctors/useCheckDoctorExists";
import { useDoctorStats } from "@/hooks/doctors/useDoctorStats";
import { useCurrentDoctor } from "@/hooks/doctors/useRealDoctors";
import type { Locale } from "@/i18n/index";
import { getOnboardingStatus } from "@/lib/onboarding-grace";
import {
  ArrowRight,
  ArrowUpRight,
  Calendar,
  FileText,
  Stethoscope,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
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

const EDITORIAL_EASE = [0.25, 0.46, 0.45, 0.94] as const;

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.1 + i * 0.08, ease: EDITORIAL_EASE },
  }),
};

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
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="group relative overflow-hidden rounded-2xl border border-neutral-200/60 bg-white p-6 transition-shadow hover:shadow-md"
    >
      <div className="mb-5 flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-900 text-white">
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </div>
        {trend ? (
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
            {trend}
          </span>
        ) : null}
      </div>
      <p className="text-[13px] font-medium tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-4xl font-light tracking-tight text-neutral-900">{value}</p>
      <p className="mt-3 text-[13px] leading-relaxed text-neutral-400">{subtitle}</p>
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
      title="Dashboard"
      description="Tu resumen clínico y agenda diaria."
      activeSection="dashboard"
      hideDefaultHeader={true}
    >
      {/* ── Dark editorial hero ── */}
      <div className="-mx-6 -mt-6 mb-8 overflow-hidden rounded-t-[24px] bg-neutral-950 px-8 py-10 md:px-10 md:py-14">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EDITORIAL_EASE }}
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
            <Stethoscope className="h-3.5 w-3.5 text-cyan-400" strokeWidth={1.5} />
            <span className="text-[11px] font-medium uppercase tracking-widest text-white/50">
              Portal médico
            </span>
          </div>
          <h1 className="text-3xl font-light tracking-tight text-white md:text-5xl">
            Bienvenido, <span className="text-cyan-400">{doctorName}</span>
          </h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/40">
            Tu agenda clínica de hoy con accesos rápidos a pacientes, consultas y teleconsulta.
          </p>
        </motion.div>
      </div>

      {/* ── Stat cards ── */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

      {/* ── Próximas consultas ── */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="rounded-2xl border border-neutral-200/60 bg-white p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-normal tracking-tight text-neutral-900">
              Próximas consultas
            </h2>
            <p className="mt-1 text-[13px] text-neutral-400">
              Gestiona agenda, pacientes e historial desde accesos rápidos.
            </p>
          </div>
          <a
            href="/doctors/agenda"
            className="group inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Ver agenda
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        </div>

        <div className="mt-6 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 p-6">
          {stats?.nextAppointment ? (
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {stats.nextAppointment.patientName}
                </p>
                <p className="mt-1 text-[13px] text-neutral-500">
                  Consulta programada para las {stats.nextAppointment.time}.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href="/doctors/agenda"
                  className="inline-flex items-center justify-center rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-[13px] font-medium text-neutral-700 transition-colors hover:border-neutral-300"
                >
                  Ver detalles
                </a>
                <a
                  href="/doctors/call/index"
                  className="inline-flex items-center justify-center rounded-full bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
                >
                  Abrir teleconsulta
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  No hay consultas cargadas para hoy.
                </p>
                <p className="mt-1 text-[13px] text-neutral-500">
                  Aprovecha para revisar expedientes, actualizar notas o abrir tu agenda.
                </p>
              </div>
              <a
                href="/doctors/patients"
                className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
              >
                Ir a pacientes
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>
      </motion.section>

      {onboardingStatus.state === "grace_period" ? (
        <div className="mt-6">
          <OnboardingReminder daysRemaining={onboardingStatus.daysRemaining} />
        </div>
      ) : null}

      {statsLoading ? (
        <p className="mt-4 text-[13px] text-neutral-400">Actualizando métricas...</p>
      ) : null}
    </DoctorsPortalFrame>
  );
}
