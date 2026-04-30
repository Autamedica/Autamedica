"use client";

import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { useCheckDoctorExists } from "@/hooks/doctors/useCheckDoctorExists";
import { useClock } from "@/hooks/doctors/useClock";
import { useDoctorStats } from "@/hooks/doctors/useDoctorStats";
import { useCurrentDoctor } from "@/hooks/doctors/useRealDoctors";
import { fetchApi } from "@/lib/api-client";
import { signOutLocal } from "@/lib/auth/service";
import { getOnboardingStatus } from "@/lib/onboarding-grace";
import DoctorNotificationsBell from "@/components/doctors/DoctorNotificationsBell";
import {
  Activity,
  ArrowRight,
  Bell,
  Calculator,
  Calendar,
  CheckCircle2,
  Clock3,
  CreditCard,
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
import type { ChangeEvent, JSX, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type ActiveSection =
  | "dashboard"
  | "patients"
  | "appointments"
  | "consultations"
  | "community"
  | "accounting"
  | "subscription"
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
  hideDefaultHeader?: boolean;
  hideRightSidebar?: boolean;
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("invalid_file_reader_result"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("file_read_failed"));
    reader.readAsDataURL(file);
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
      className={`group relative mx-2 flex items-center rounded-lg px-3 py-2.5 text-[13px] transition-all duration-150 ${
        isCollapsed ? "justify-center" : "gap-3"
      } ${
        isActive
          ? "bg-neutral-900 text-white"
          : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
      {!isCollapsed ? <span className="flex-1 font-medium">{item.label}</span> : null}
      {!isCollapsed && item.badge ? (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            isActive
              ? "bg-white/20 text-white"
              : "bg-neutral-900 text-white"
          }`}
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
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur-xl md:hidden">
      <div className="grid h-16 grid-cols-5">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex flex-col items-center justify-center gap-1 text-neutral-400 transition-colors active:bg-neutral-50"
        >
          <Menu className="h-5 w-5" strokeWidth={1.5} />
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
                isActive ? "text-neutral-900" : "text-neutral-400"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={1.5} />
              <span className="text-[10px] font-medium">{item.label}</span>
              {isActive ? (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-neutral-900" />
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
  hideDefaultHeader = false,
  hideRightSidebar = false,
  children,
}: DoctorsPortalFrameProps): JSX.Element {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | null>(null);

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
  const doctorProfile = doctor?.profile as { avatar_url?: string | null; avatarUrl?: string | null } | undefined;
  const userProfile = user?.profile as { avatar?: string | null; avatar_url?: string | null } | undefined;
  const avatarUrl =
    uploadedAvatarUrl ||
    doctorProfile?.avatar_url ||
    doctorProfile?.avatarUrl ||
    userProfile?.avatar_url ||
    userProfile?.avatar ||
    null;

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
      { href: "/doctors/accounting", label: "Contabilidad", icon: Calculator, key: "accounting" },
      { href: "/doctors/subscription", label: "Suscripción", icon: CreditCard, key: "subscription" },
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

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPhotoError(null);

    if (!["image/png", "image/webp", "image/jpeg"].includes(file.type)) {
      setPhotoError("Formato no soportado. Usá PNG, WebP o JPEG.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("La foto no puede superar 2MB.");
      return;
    }

    setUploadingPhoto(true);
    try {
      const image = await readFileAsDataUrl(file);
      const result = await fetchApi<{ avatarUrl: string }>("/api/doctors/profile/photo", {
        body: { image },
      });
      setUploadedAvatarUrl(result.avatarUrl);
    } catch {
      setPhotoError("No pudimos actualizar la foto profesional.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-neutral-200 bg-white px-10 py-12">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-neutral-900 text-white">
            <Activity className="h-5 w-5" strokeWidth={1.5} />
            <span className="absolute -bottom-1 -right-1 h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-neutral-900">Cargando portal médico</p>
            <p className="mt-1 text-[13px] text-neutral-400">
              Verificando sesión y perfil profesional.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center">
          <h1 className="text-2xl font-light tracking-tight text-neutral-900">
            Inicia sesión para continuar
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-neutral-500">
            Esta sección usa el portal real de doctores y requiere autenticación.
          </p>
          <a
            href="/auth/login?portal=doctors"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-neutral-900 px-5 py-3 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Ir a login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {mobileMenuOpen ? (
        <button
          type="button"
          aria-label="Cerrar navegación"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
        />
      ) : null}

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-neutral-200/60 bg-white/95 px-4 py-3 backdrop-blur-xl md:px-8">
        <div className="flex items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="AutaMedica"
              className="h-8 w-8 object-contain md:h-9 md:w-9"
            />
            <div>
              <div className="text-base font-semibold text-neutral-900 md:text-lg">AutaMedica</div>
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
                Portal médico
              </div>
            </div>
          </a>

          <div className="flex items-center gap-2 md:gap-3">
            <button
              type="button"
              className="group flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3.5 py-2 transition-all hover:border-neutral-300 hover:bg-white"
              aria-label="Buscar"
            >
              <Search className="h-4 w-4 text-neutral-400" strokeWidth={1.5} />
              <span className="hidden text-[13px] text-neutral-400 sm:inline">
                Buscar...
              </span>
            </button>

            <DoctorNotificationsBell />

            <div className="hidden text-right md:block">
              <time className="block font-mono text-sm font-medium text-neutral-900">
                {currentTime || "--:--"}
              </time>
              <time className="text-[11px] capitalize text-neutral-400">
                {formatDateLabel(currentDate)}
              </time>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-57px)]">
        {/* ── Sidebar ── */}
        <aside
          className={`fixed left-0 top-[57px] z-50 h-[calc(100vh-57px)] border-r border-neutral-200/60 bg-white transition-transform duration-300 md:sticky md:translate-x-0 ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          } ${isSidebarCollapsed ? "w-[72px]" : "w-[232px]"}`}
        >
          <div className="flex h-full flex-col">
            {/* Doctor profile */}
            <div className="border-b border-neutral-100 p-4">
              <div
                className={`flex items-center ${isSidebarCollapsed ? "justify-center" : "gap-3"}`}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={doctorName}
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-[13px] font-semibold text-white">
                    {doctorInitials}
                  </div>
                )}
                {!isSidebarCollapsed ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-neutral-900">
                      {doctorName}
                    </p>
                    <p className="truncate text-[11px] text-neutral-400">{doctorSpecialty}</p>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 md:hidden"
                  aria-label="Cerrar menú"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {!isSidebarCollapsed ? (
                <div className="mt-3">
                  <label className="inline-flex cursor-pointer items-center rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50">
                    {uploadingPhoto ? "Subiendo..." : "Subir foto profesional"}
                    <input
                      type="file"
                      accept="image/png,image/webp,image/jpeg"
                      className="hidden"
                      disabled={uploadingPhoto}
                      onChange={(event) => void handlePhotoUpload(event)}
                    />
                  </label>
                  {photoError ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-red-600">{photoError}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto py-5">
              {!isSidebarCollapsed ? (
                <p className="px-4 pb-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-300">
                  Clínica
                </p>
              ) : null}
              <nav className="space-y-0.5">
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
                  <div className="mx-4 my-4 h-px bg-neutral-100" />
                  <p className="px-4 pb-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-300">
                    Plataforma
                  </p>
                </>
              ) : (
                <div className="mx-auto my-4 h-px w-6 bg-neutral-100" />
              )}

              <nav className="space-y-0.5">
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

            {/* Sign out */}
            <div className="border-t border-neutral-100 p-4">
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className={`flex w-full items-center rounded-lg px-3 py-2.5 text-[13px] font-medium text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900 ${
                  isSidebarCollapsed ? "justify-center" : "gap-3"
                }`}
              >
                <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                {!isSidebarCollapsed ? (
                  <span>{signingOut ? "Saliendo..." : "Cerrar sesión"}</span>
                ) : null}
              </button>
            </div>

            {/* Collapse toggle */}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              className="absolute -right-3 top-6 hidden h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white shadow-sm transition-colors hover:bg-neutral-100 md:flex"
              aria-label={isSidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
            >
              <Menu className="h-3.5 w-3.5 text-neutral-400" strokeWidth={1.5} />
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="min-w-0 flex-1 overflow-x-hidden">
          <div
            className={`grid min-h-full grid-cols-1 gap-0 ${
              hideRightSidebar ? "" : "lg:grid-cols-[minmax(0,1fr)_340px]"
            }`}
          >
            <section className="flex min-h-full flex-col">
              <div className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
                {onboardingStatus.state === "expired" ? (
                  <div className="mb-6 rounded-xl border border-amber-200/60 bg-amber-50 p-4 text-[13px] text-amber-800">
                    Tu período de gracia expiró. Completa el onboarding para recuperar acceso total.
                  </div>
                ) : null}

                {doctorExists === false ? (
                  <div className="mb-6 rounded-xl border border-cyan-200/60 bg-cyan-50 p-4 text-[13px] text-cyan-800">
                    Tu perfil profesional todavía no está completo. Puedes terminarlo desde
                    configuración.
                  </div>
                ) : null}

                {!hideDefaultHeader ? (
                  <div className="mb-6">
                    <h1 className="text-2xl font-light tracking-tight text-neutral-900 md:text-3xl">
                      {title}
                    </h1>
                    <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-neutral-400">
                      {description}
                    </p>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-sm">
                  {children}
                </div>
              </div>
            </section>

            {/* ── Right sidebar ── */}
            {!hideRightSidebar ? (
            <aside className="hidden border-l border-neutral-200/60 bg-neutral-50/50 p-5 lg:block">
              <div className="space-y-4">
                {/* Mandatos: clarifications + clinical triage */}
                {(() => {
                  const clarifications = stats?.pendingClarifications ?? 0
                  const triageMandates = stats?.pendingTriageMandates ?? 0
                  const totalActive = clarifications + triageMandates
                  const hasActive = totalActive > 0

                  return (
                    <section className={`rounded-xl border p-5 ${
                      hasActive
                        ? "border-amber-200/50 bg-amber-50/50"
                        : "border-neutral-200/60 bg-white"
                    }`}>
                      <div className="flex flex-col items-center text-center">
                        <div className="mb-3">
                          {hasActive ? (
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                              <Bell className="h-5 w-5" strokeWidth={1.5} />
                            </div>
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
                              <CheckCircle2 className="h-5 w-5" strokeWidth={1.5} />
                            </div>
                          )}
                        </div>
                        {hasActive ? (
                          <div className="space-y-1.5">
                            <h3 className="text-[13px] font-semibold text-amber-900">
                              {totalActive} {totalActive === 1 ? "mandato activo" : "mandatos activos"}
                            </h3>
                            {clarifications > 0 && (
                              <p className="text-[11px] leading-relaxed text-amber-700/70">
                                {clarifications} {clarifications === 1 ? "aclaracion de farmacia" : "aclaraciones de farmacia"}
                              </p>
                            )}
                            {triageMandates > 0 && (
                              <p className="text-[11px] leading-relaxed text-amber-700/70">
                                {triageMandates} {triageMandates === 1 ? "resolucion clinica pendiente" : "resoluciones clinicas pendientes"}
                              </p>
                            )}
                          </div>
                        ) : (
                          <>
                            <h3 className="text-[13px] font-semibold text-neutral-600">
                              Sin mandatos activos
                            </h3>
                            <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">
                              La cola prioritaria esta despejada.
                            </p>
                          </>
                        )}
                      </div>
                    </section>
                  )
                })()}

                {/* Expedientes */}
                <section className="rounded-xl border border-neutral-200/60 bg-white p-5">
                  <div className="mb-4 flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                      <FileText className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[13px] font-semibold text-neutral-900">Expedientes</h3>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">
                        Historial médico y contexto clínico.
                      </p>
                    </div>
                  </div>
                  <a
                    href="/doctors/patients"
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
                  >
                    Ir a pacientes
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </a>
                </section>

                {/* Calendar */}
                <section className="rounded-xl border border-neutral-200/60 bg-white p-5">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                      <Calendar className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[13px] font-semibold text-neutral-900">Calendario</h3>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">
                        Gestiona tus citas y disponibilidad.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-neutral-100 pt-3 text-[11px]">
                    <span className="text-neutral-400">Próxima disponibilidad</span>
                    <span className="font-semibold text-neutral-900">
                      {stats?.nextAppointment ? stats.nextAppointment.time : "Mañana 09:00"}
                    </span>
                  </div>
                </section>

                {/* Weekly performance */}
                <section className="rounded-xl border border-neutral-200/60 bg-white p-5">
                  <div className="mb-4 flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                      <Sparkles className="h-4 w-4" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-[13px] font-semibold text-neutral-900">Rendimiento semanal</h3>
                  </div>
                  <div className="space-y-0">
                    <div className="flex items-center justify-between border-b border-neutral-100 py-2.5">
                      <span className="text-[11px] text-neutral-500">Consultas activas</span>
                      <span className="text-[13px] font-semibold text-neutral-900">
                        {stats?.activeCount ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-neutral-100 py-2.5">
                      <span className="text-[11px] text-neutral-500">Tiempo promedio</span>
                      <div className="flex items-center gap-1.5">
                        <Clock3 className="h-3 w-3 text-neutral-400" strokeWidth={1.5} />
                        <span className="text-[13px] font-semibold text-neutral-900">
                          {stats?.avgConsultationTimeMins ? `${stats.avgConsultationTimeMins} min` : '-'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-b border-neutral-100 py-2.5">
                      <span className="text-[11px] text-neutral-500">Satisfacción</span>
                      <div className="flex items-center gap-1.5 text-amber-400">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star
                            key={index}
                            className={`h-3 w-3 ${
                              stats?.avgRating && index < Math.round(stats.avgRating)
                                ? "fill-current"
                                : "text-neutral-200"
                            }`}
                          />
                        ))}
                        <span className="ml-1 text-[13px] font-semibold text-green-600">
                          {stats?.satisfactionRate ? `${stats.satisfactionRate}%` : '-'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-[11px] text-neutral-500">Comunidad</span>
                      <span className="text-[13px] font-semibold text-neutral-900">
                        {stats?.unreadCommunityCount ?? 0} pendientes
                      </span>
                    </div>
                  </div>
                </section>

                {/* Quality score */}
                <section className="relative overflow-hidden rounded-xl bg-neutral-900 p-6 text-white">
                  <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/3 translate-x-1/3 rounded-full bg-white/5 blur-3xl" />
                  <div className="relative">
                    <div className="mb-4 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                        <Heart className="h-4 w-4" strokeWidth={1.5} />
                      </div>
                      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                        Puntuación de calidad
                      </h3>
                    </div>
                    <div className="mb-3 flex items-end gap-2">
                      <div className="text-5xl font-light tracking-tight">
                        {stats?.qualityScore ? stats.qualityScore.toFixed(1) : '-'}
                      </div>
                      <div className="mb-1.5 text-base text-white/30">/10</div>
                    </div>
                    <p className="text-[11px] leading-relaxed text-white/40">
                      {stats?.qualityMessage || 'Calculando tu desempeño basado en tus atenciones recientes...'}
                    </p>
                    <div className="mt-4 border-t border-white/10 pt-3">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-white/40">Ranking nacional</span>
                        <div className="flex items-center gap-1.5 font-semibold text-white/80">
                          <Trophy className="h-3 w-3" strokeWidth={1.5} />
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
            ) : null}
          </div>
        </main>
      </div>

      <MobileNav onMenuClick={() => setMobileMenuOpen(true)} activeSection={activeSection} />
    </div>
  );
}
