"use client";

import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { useCheckDoctorExists } from "@/hooks/doctors/useCheckDoctorExists";
import { useClock } from "@/hooks/doctors/useClock";
import { useDoctorStats } from "@/hooks/doctors/useDoctorStats";
import { useCurrentDoctor } from "@/hooks/doctors/useRealDoctors";
import { signOutLocal } from "@/lib/auth/service";
import { getOnboardingStatus } from "@/lib/onboarding-grace";
import {
  Activity,
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle2,
  Clock3,
  FileText,
  Heart,
  Home,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
  Star,
  Trophy,
  Users,
  X,
} from "lucide-react";
import type { JSX, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type ActiveSection =
  | "dashboard"
  | "patients"
  | "appointments"
  | "consultations"
  | "community"
  | "profile";

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof Home;
  key: ActiveSection;
  badge?: string;
};

interface DoctorsPortalFrameProps {
  title: string;
  description: string;
  activeSection: ActiveSection;
  children: ReactNode;
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

function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase() ?? "")
      .join("") || "DR"
  );
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function SidebarLink({
  item,
  isCollapsed,
  isActive,
}: {
  item: NavigationItem;
  isCollapsed: boolean;
  isActive: boolean;
}): JSX.Element {
  const Icon = item.icon;

  return (
    <a
      href={item.href}
      title={isCollapsed ? item.label : undefined}
      className={`group relative mx-1 flex items-center rounded-xl px-3 py-2.5 text-sm transition-all duration-150 ${
        isCollapsed ? "justify-center" : "gap-3"
      } ${
        isActive
          ? "bg-am-doctor-50 text-am-doctor-600 ring-1 ring-am-doctor-200"
          : "text-am-surface-700 hover:bg-am-surface-50 hover:text-am-doctor-600"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-105" />
      {!isCollapsed ? <span className="flex-1 font-medium">{item.label}</span> : null}
      {!isCollapsed && item.badge ? (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isActive ? "bg-white text-am-doctor-600" : "bg-am-doctor-500 text-white"}`}
        >
          {item.badge}
        </span>
      ) : null}
    </a>
  );
}

function MobileNav({
  onMenuClick,
  activeSection,
}: {
  onMenuClick: () => void;
  activeSection: ActiveSection;
}): JSX.Element {
  const navItems: Array<{ href: string; label: string; icon: typeof Home; key: ActiveSection }> = [
    { href: "/doctors/dashboard", label: "Inicio", icon: Home, key: "dashboard" },
    { href: "/doctors/patients", label: "Pacientes", icon: Users, key: "patients" },
    { href: "/doctors/agenda", label: "Agenda", icon: Calendar, key: "appointments" },
    { href: "/doctors/community", label: "Ranking", icon: Trophy, key: "community" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-am-surface-200/80 bg-white/95 backdrop-blur-xl md:hidden">
      <div className="grid h-16 grid-cols-5">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex flex-col items-center justify-center gap-1 text-am-surface-700 transition-colors active:bg-am-surface-50"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium">Menú</span>
        </button>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeSection;
          return (
            <a
              key={item.key}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-1 ${
                isActive ? "text-am-doctor-500" : "text-am-surface-700"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {isActive ? (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-am-doctor-500" />
              ) : null}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

export function DoctorsPortalFrame({
  title,
  description,
  activeSection,
  children,
}: DoctorsPortalFrameProps): JSX.Element {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const currentTime = useClock();
  const currentDate = new Date();
  const { user, loading: authLoading } = useAuthenticatedUser();
  const { doctor } = useCurrentDoctor(user?.id);
  const { stats } = useDoctorStats(doctor?.id, user?.id);
  const { exists: doctorExists } = useCheckDoctorExists(user?.id);

  const onboardingStatus = useMemo(
    () => getOnboardingStatus(user?.onboardingCompletedAt, user?.createdAt),
    [user?.createdAt, user?.onboardingCompletedAt],
  );

  const doctorName = getDoctorDisplayName(doctor, user);
  const doctorInitials = getInitials(doctorName);
  const doctorSpecialty = doctor?.specialty || "Especialidad pendiente";

  const primaryLinks = useMemo<NavigationItem[]>(
    () => [
      { href: "/doctors/dashboard", label: "Dashboard", icon: Home, key: "dashboard" },
      { href: "/doctors/patients", label: "Pacientes", icon: Users, key: "patients" },
      {
        href: "/doctors/agenda",
        label: "Citas",
        icon: Calendar,
        key: "appointments",
        badge: stats?.todayCount ? String(stats.todayCount) : undefined,
      },
      {
        href: "/doctors/consultations",
        label: "Historiales",
        icon: FileText,
        key: "consultations",
      },
    ],
    [stats?.todayCount],
  );

  const platformLinks = useMemo<NavigationItem[]>(
    () => [
      {
        href: "/doctors/community",
        label: "Comunidad",
        icon: Trophy,
        key: "community",
        badge: stats?.unreadCommunityCount ? String(stats.unreadCommunityCount) : undefined,
      },
      { href: "/doctors/perfil", label: "Configuración", icon: Settings, key: "profile" },
    ],
    [stats?.unreadCommunityCount],
  );

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [mobileMenuOpen]);

  const handleSignOut = async (): Promise<void> => {
    setSigningOut(true);
    try {
      await signOutLocal();
      window.location.href = "/auth/login?portal=doctors";
    } catch {
      setSigningOut(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-am-surface-50 p-6">
        <div className="flex flex-col items-center gap-4 rounded-[28px] border border-am-surface-200 bg-white px-10 py-12 shadow-sm">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-am-doctor-500 to-blue-600 text-white">
            <Activity className="h-6 w-6" />
            <span className="absolute -bottom-1 -right-1 h-4 w-4 animate-spin rounded-full border-2 border-am-doctor-100 border-t-white" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-am-surface-900">Cargando portal médico</p>
            <p className="mt-1 text-sm text-am-surface-500">
              Verificando sesión y perfil profesional.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-am-surface-50 p-6">
        <div className="w-full max-w-md rounded-[28px] border border-am-surface-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight text-am-surface-900">
            Inicia sesión para continuar
          </h1>
          <p className="mt-3 text-sm leading-6 text-am-surface-600">
            Esta sección usa el portal real de doctores y requiere autenticación.
          </p>
          <a
            href="/auth/login?portal=doctors"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-am-doctor-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-am-doctor-600"
          >
            Ir a login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-am-surface-50 text-am-surface-900">
      {mobileMenuOpen ? (
        <button
          type="button"
          aria-label="Cerrar navegación"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm md:hidden"
        />
      ) : null}

      <header className="sticky top-0 z-30 border-b border-am-surface-200/60 bg-white/95 px-4 py-3 backdrop-blur-xl md:px-8 md:py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="AutaMedica"
                className="h-8 w-8 object-contain md:h-9 md:w-9"
              />
              <div>
                <div className="text-base font-bold text-am-surface-900 md:text-lg">AutaMedica</div>
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-am-doctor-500">
                  Portal médico
                </div>
              </div>
            </a>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <button
              type="button"
              className="group flex items-center gap-2 rounded-[10px] border border-am-surface-200/70 bg-am-surface-50 px-3 py-2 transition-all hover:border-am-doctor-300 hover:bg-white hover:shadow-sm"
              aria-label="Buscar"
            >
              <Search className="h-[18px] w-[18px] text-am-surface-400 transition-colors group-hover:text-am-doctor-500" />
              <span className="hidden text-[13px] font-medium text-am-surface-500 sm:inline">
                Buscar paciente o consulta...
              </span>
            </button>

            <button
              type="button"
              className="relative rounded-[10px] p-2.5 transition-colors hover:bg-am-surface-50"
              aria-label="Notificaciones"
            >
              <Bell className="h-[18px] w-[18px] text-am-surface-400" />
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
            </button>

            <div className="hidden text-right md:block">
              <time className="block font-mono text-sm font-bold text-am-surface-900">
                {currentTime || "--:--"}
              </time>
              <time className="text-xs capitalize text-am-surface-500">
                {formatDateLabel(currentDate)}
              </time>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-73px)]">
        <aside
          className={`fixed left-0 top-[73px] z-50 h-[calc(100vh-73px)] border-r border-am-surface-200/70 bg-white transition-transform duration-300 md:sticky md:translate-x-0 ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          } ${isSidebarCollapsed ? "w-20" : "w-[240px]"}`}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-am-surface-200/60 p-4">
              <div
                className={`flex items-center ${isSidebarCollapsed ? "justify-center" : "gap-3"}`}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-am-doctor-500 to-blue-600 text-sm font-bold text-white">
                  {doctorInitials}
                </div>
                {!isSidebarCollapsed ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-am-surface-900">
                      {doctorName}
                    </p>
                    <p className="truncate text-xs text-am-surface-500">{doctorSpecialty}</p>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-2 text-am-surface-500 hover:bg-am-surface-50 md:hidden"
                  aria-label="Cerrar menú"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-6">
              {!isSidebarCollapsed ? (
                <p className="px-4 pb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-am-surface-400">
                  Clínica
                </p>
              ) : null}
              <nav className="space-y-1">
                {primaryLinks.map((item) => (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    isCollapsed={isSidebarCollapsed}
                    isActive={item.key === activeSection}
                  />
                ))}
              </nav>

              {!isSidebarCollapsed ? (
                <>
                  <div className="mx-4 my-4 h-px bg-am-surface-200" />
                  <p className="px-4 pb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-am-surface-400">
                    Plataforma
                  </p>
                </>
              ) : (
                <div className="mx-auto my-4 h-px w-8 bg-am-surface-200" />
              )}

              <nav className="space-y-1">
                {platformLinks.map((item) => (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    isCollapsed={isSidebarCollapsed}
                    isActive={item.key === activeSection}
                  />
                ))}
              </nav>
            </div>

            <div className="border-t border-am-surface-200/60 p-4">
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className={`flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-am-surface-700 transition-colors hover:bg-am-surface-50 hover:text-am-doctor-600 ${
                  isSidebarCollapsed ? "justify-center" : "gap-3"
                }`}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {!isSidebarCollapsed ? (
                  <span>{signingOut ? "Saliendo..." : "Cerrar sesión"}</span>
                ) : null}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              className="absolute -right-3 top-6 hidden h-7 w-7 items-center justify-center rounded-full border border-am-surface-200 bg-white shadow-sm transition-colors hover:border-am-doctor-300 hover:text-am-doctor-600 md:flex"
              aria-label={isSidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-x-hidden">
          <div className="grid min-h-full grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="flex min-h-full flex-col">
              <div className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
                {onboardingStatus.state === "expired" ? (
                  <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Tu período de gracia expiró. Completa el onboarding para recuperar acceso total.
                  </div>
                ) : null}

                {doctorExists === false ? (
                  <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                    Tu perfil profesional todavía no está completo. Puedes terminarlo desde
                    configuración.
                  </div>
                ) : null}

                <div className="mb-8">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-am-doctor-500/20 bg-gradient-to-r from-am-doctor-50 to-cyan-50 px-3 py-1.5 shadow-sm">
                    <Activity className="h-3.5 w-3.5 text-am-doctor-500" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-am-doctor-600">
                      Workspace médico
                    </span>
                  </div>

                  <h1 className="text-4xl font-bold tracking-tight text-am-surface-900">{title}</h1>
                  <p className="mt-3 max-w-3xl text-base text-am-surface-600">{description}</p>
                </div>

                <div className="rounded-[24px] border border-am-surface-200/80 bg-white p-6 shadow-sm">
                  {children}
                </div>
              </div>
            </section>

            <aside className="border-l border-am-surface-200/60 bg-gradient-to-b from-am-surface-50 via-white to-am-surface-50/40 p-4 pb-24 lg:p-5 lg:pb-5">
              <div className="space-y-4">
                <section className="rounded-[18px] border border-green-200/50 bg-gradient-to-br from-green-50 via-emerald-50/80 to-teal-50/40 p-5 shadow-sm">
                  <div className="flex flex-col items-center text-center">
                    <div className="relative mb-3.5 h-14 w-14">
                      <div className="absolute inset-0 rounded-full bg-green-500/10 animate-ping" />
                      <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white shadow-lg shadow-green-500/25">
                        <CheckCircle2 className="h-7 w-7" />
                      </div>
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-green-900">
                      Sin mandatos activos
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-green-700/80">
                      La cola prioritaria está despejada en este momento.
                    </p>
                  </div>
                </section>

                <section className="rounded-[18px] border border-am-surface-200/70 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-start gap-3.5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-gradient-to-br from-am-doctor-50 to-am-doctor-100 text-am-doctor-500">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-am-surface-900">Expedientes</h3>
                      <p className="mt-1 text-xs leading-relaxed text-am-surface-500">
                        Accede al historial médico y al contexto clínico de tus pacientes.
                      </p>
                    </div>
                  </div>
                  <a
                    href="/doctors/patients"
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-am-doctor-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-am-doctor-600 hover:shadow-md"
                  >
                    Ir a pacientes
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </a>
                </section>

                <section className="rounded-[18px] border border-am-surface-200/70 bg-white p-5 shadow-sm">
                  <div className="mb-3.5 flex items-start gap-3.5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-gradient-to-br from-purple-50 to-purple-100 text-purple-500">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-am-surface-900">Calendario</h3>
                      <p className="mt-1 text-xs leading-relaxed text-am-surface-500">
                        Gestiona tus citas y revisa la siguiente ventana disponible.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-am-surface-100 pt-3 text-xs">
                    <span className="font-medium text-am-surface-500">Próxima disponibilidad</span>
                    <span className="font-bold text-purple-600">
                      {stats?.nextAppointment ? stats.nextAppointment.time : "Mañana 09:00"}
                    </span>
                  </div>
                </section>

                <section className="rounded-[18px] border border-am-surface-200/70 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-gradient-to-br from-amber-50 to-orange-50 text-amber-500">
                      <Sparkles className="h-[18px] w-[18px]" />
                    </div>
                    <h3 className="text-sm font-bold text-am-surface-900">Rendimiento semanal</h3>
                  </div>
                  <div className="space-y-0">
                    <div className="flex items-center justify-between border-b border-am-surface-100 py-2.5">
                      <span className="text-xs font-medium text-am-surface-600">
                        Consultas activas
                      </span>
                      <span className="text-sm font-bold text-am-surface-900">
                        {stats?.activeCount ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-am-surface-100 py-2.5">
                      <span className="text-xs font-medium text-am-surface-600">
                        Tiempo promedio
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5 text-am-doctor-500" />
                        <span className="text-sm font-bold text-am-surface-900">28 min</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-b border-am-surface-100 py-2.5">
                      <span className="text-xs font-medium text-am-surface-600">Satisfacción</span>
                      <div className="flex items-center gap-1.5 text-amber-400">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star key={index} className="h-3 w-3 fill-current" />
                        ))}
                        <span className="ml-1 text-sm font-bold text-green-600">98%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-xs font-medium text-am-surface-600">Comunidad</span>
                      <span className="text-sm font-bold text-am-surface-900">
                        {stats?.unreadCommunityCount ?? 0} pendientes
                      </span>
                    </div>
                  </div>
                </section>

                <section className="relative overflow-hidden rounded-[18px] bg-gradient-to-br from-am-doctor-500 via-am-doctor-600 to-blue-700 p-6 text-white shadow-xl shadow-am-doctor-500/20">
                  <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/3 translate-x-1/3 rounded-full bg-white/10 blur-3xl" />
                  <div className="absolute bottom-0 left-0 h-24 w-24 -translate-x-1/3 translate-y-1/3 rounded-full bg-blue-300/10 blur-2xl" />
                  <div className="relative">
                    <div className="mb-4 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/15 backdrop-blur-sm">
                        <Heart className="h-[18px] w-[18px]" />
                      </div>
                      <h3 className="text-sm font-bold tracking-wide">PUNTUACIÓN DE CALIDAD</h3>
                    </div>
                    <div className="mb-3 flex items-end gap-2">
                      <div className="text-6xl font-bold tracking-tight">9.4</div>
                      <div className="mb-2 text-base font-semibold text-white/70">/10</div>
                    </div>
                    <p className="text-xs leading-relaxed text-white/85">
                      Excelente desempeño. Mantén la calidad de atención y el tiempo de respuesta.
                    </p>
                    <div className="mt-4 border-t border-white/15 pt-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/70">Ranking nacional</span>
                        <div className="flex items-center gap-1.5 font-bold">
                          <Trophy className="h-3.5 w-3.5" />
                          <span>
                            {stats?.rankingPosition ? `#${stats.rankingPosition}` : "Sin ranking"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </aside>
          </div>
        </main>
      </div>

      <MobileNav onMenuClick={() => setMobileMenuOpen(true)} activeSection={activeSection} />
    </div>
  );
}
