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
  Calculator,
  Calendar,
  CreditCard,
  FileText,
  Home,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
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
  | "prescriptions"
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
    [doctorProfile?.first_name, doctorProfile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    userProfile?.fullName?.trim() ||
    [userProfile?.firstName, userProfile?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

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

function MobileNavBar({
  activeSection,
  primaryLinks,
  platformLinks,
}: {
  activeSection: ActiveSection;
  primaryLinks: NavigationItem[];
  platformLinks: NavigationItem[];
}) {
  const allLinks = [...primaryLinks, ...platformLinks];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200/60 bg-white/95 pb-safe pt-2 backdrop-blur-xl md:hidden">
      <div className="flex items-center justify-around px-2">
        {allLinks.slice(0, 5).map((item) => {
          const isActive = item.key === activeSection;
          return (
            <a
              key={item.key}
              href={item.href}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition-colors ${
                isActive ? "text-neutral-900" : "text-neutral-400"
              }`}
            >
              <div className="relative">
                <item.icon
                  className="h-5 w-5"
                  strokeWidth={isActive ? 2 : 1.5}
                />
                {item.badge ? (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                    {item.badge}
                  </span>
                ) : null}
              </div>
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
  children,
}: DoctorsPortalFrameProps): JSX.Element {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | null>(
    null,
  );

  const currentTime = useClock();
  const currentDate = new Date();
  const { user, loading: authLoading } = useAuthenticatedUser();
  const { doctor } = useCurrentDoctor(user?.id);
  const { stats } = useDoctorStats(doctor?.id, user?.id);
  const { exists: _doctorExists } = useCheckDoctorExists(user?.id);

  const onboardingStatus = useMemo(
    () => getOnboardingStatus(user?.onboardingCompletedAt, user?.createdAt),
    [user?.createdAt, user?.onboardingCompletedAt],
  );

  const doctorName = getDoctorDisplayName(doctor, user);
  const doctorInitials = getInitials(doctorName);
  const doctorSpecialty = doctor?.specialty || "Especialidad pendiente";

  const doctorProfile = doctor?.profile as
    | { avatar_url?: string | null; avatarUrl?: string | null }
    | undefined;
  const userProfile = user?.profile as
    | { avatar?: string | null; avatar_url?: string | null }
    | undefined;
  const avatarUrl =
    uploadedAvatarUrl ||
    doctorProfile?.avatar_url ||
    doctorProfile?.avatarUrl ||
    userProfile?.avatar_url ||
    userProfile?.avatar ||
    null;

  const primaryLinks = useMemo<NavigationItem[]>(
    () => [
      {
        href: "/doctors/dashboard",
        label: "Dashboard",
        icon: Home,
        key: "dashboard",
      },
      {
        href: "/doctors/patients",
        label: "Pacientes",
        icon: Users,
        key: "patients",
      },
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
      {
        href: "/doctors/prescriptions",
        label: "Recetas",
        icon: Pill,
        key: "prescriptions",
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
        badge: stats?.unreadCommunityCount
          ? String(stats.unreadCommunityCount)
          : undefined,
      },
      {
        href: "/doctors/accounting",
        label: "Contabilidad",
        icon: Calculator,
        key: "accounting",
      },
      {
        href: "/doctors/subscription",
        label: "Suscripción",
        icon: CreditCard,
        key: "subscription",
      },
      {
        href: "/doctors/perfil",
        label: "Configuración",
        icon: Settings,
        key: "profile",
      },
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

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoUpload = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
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
      const result = await fetchApi<{ avatarUrl: string }>(
        "/api/doctors/profile/photo",
        {
          body: { image },
        },
      );
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
            <p className="text-sm font-medium text-neutral-900">
              Cargando portal médico
            </p>
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
            Esta sección usa el portal real de doctores y requiere
            autenticación.
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
              <div className="text-base font-semibold text-neutral-900 md:text-lg">
                AutaMedica
              </div>
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
                <a
                  href="/doctors/profile"
                  className="group/avatar relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-neutral-900 text-[13px] font-semibold text-white ring-1 ring-neutral-200 transition hover:ring-neutral-400"
                  title={
                    avatarUrl
                      ? "Editar foto profesional"
                      : "Subir foto profesional"
                  }
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={doctorName}
                      className="h-full w-full object-cover transition duration-300 group-hover/avatar:scale-110"
                    />
                  ) : (
                    <>
                      <span className="transition duration-300 group-hover/avatar:scale-110">
                        {doctorInitials}
                      </span>
                      <span className="absolute inset-x-0 bottom-0 bg-amber-400 py-0.5 text-center text-[8px] font-black uppercase tracking-wide text-neutral-950">
                        Foto
                      </span>
                    </>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover/avatar:opacity-100">
                    <Settings className="h-4 w-4 text-white" />
                  </div>
                </a>
                {!isSidebarCollapsed ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-neutral-900">
                      {doctorName}
                    </p>
                    <p className="truncate text-[11px] text-neutral-400">
                      {doctorSpecialty}
                    </p>
                    {!avatarUrl ? (
                      <a
                        href="/doctors/profile"
                        className="mt-1 inline-flex text-[10px] font-bold uppercase tracking-wide text-amber-700 hover:text-amber-800"
                      >
                        Subir foto profesional
                      </a>
                    ) : null}
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
                    <p className="mt-2 text-[11px] leading-relaxed text-red-600">
                      {photoError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Primary Nav */}
            <div className="flex-1 space-y-1 p-3">
              {primaryLinks.map((item) => {
                const isActive = item.key === activeSection;
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${
                      isActive
                        ? "bg-neutral-100 text-neutral-900"
                        : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-neutral-900" : "text-neutral-400 group-hover:text-neutral-600"}`}
                      />
                      {!isSidebarCollapsed && <span>{item.label}</span>}
                    </div>
                    {!isSidebarCollapsed && item.badge && (
                      <span className="flex h-5 items-center justify-center rounded-md bg-neutral-900 px-1.5 text-[10px] font-bold text-white">
                        {item.badge}
                      </span>
                    )}
                  </a>
                );
              })}
            </div>

            {/* Platform Links */}
            <div className="border-t border-neutral-100 p-3">
              <div className="space-y-1">
                {platformLinks.map((item) => {
                  const isActive = item.key === activeSection;
                  return (
                    <a
                      key={item.key}
                      href={item.href}
                      className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${
                        isActive
                          ? "bg-neutral-100 text-neutral-900"
                          : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon
                          className={`h-4 w-4 ${isActive ? "text-neutral-900" : "text-neutral-400 group-hover:text-neutral-600"}`}
                        />
                        {!isSidebarCollapsed && <span>{item.label}</span>}
                      </div>
                      {!isSidebarCollapsed && item.badge && (
                        <span className="flex h-5 items-center justify-center rounded-md bg-neutral-900 px-1.5 text-[10px] font-bold text-white">
                          {item.badge}
                        </span>
                      )}
                    </a>
                  );
                })}
              </div>

              {/* Bottom Actions */}
              <div className="mt-4 space-y-1">
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
                >
                  <Menu className="h-4 w-4 text-neutral-400" />
                  {!isSidebarCollapsed && <span>Ocultar menú</span>}
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  {!isSidebarCollapsed && (
                    <span>
                      {signingOut ? "Cerrando sesión..." : "Cerrar sesión"}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-x-hidden">
          {!hideDefaultHeader && (
            <div className="border-b border-neutral-200/60 bg-white/50 px-6 py-8 md:px-10 lg:py-10">
              <div className="mx-auto max-w-5xl">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-900 md:text-3xl">
                      {title}
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500">
                      {description}
                    </p>
                  </div>
                  {onboardingStatus.state !== "completed" && (
                    <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Completar perfil profesional</span>
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <div
            className={`p-6 md:p-10 ${!hideDefaultHeader ? "mx-auto max-w-5xl" : ""}`}
          >
            {children}
          </div>
        </main>
      </div>

      {/* Mobile nav indicator */}
      <button
        type="button"
        onClick={() => setMobileMenuOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-xl transition-transform hover:scale-105 active:scale-95 md:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Mobile Navigation Bar */}
      <MobileNavBar
        activeSection={activeSection}
        primaryLinks={primaryLinks}
        platformLinks={platformLinks}
      />
    </div>
  );
}
