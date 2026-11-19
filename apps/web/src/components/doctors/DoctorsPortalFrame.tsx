"use client";

import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { useCheckDoctorExists } from "@/hooks/doctors/useCheckDoctorExists";
import { useClock } from "@/hooks/doctors/useClock";
import { useDoctorStats } from "@/hooks/doctors/useDoctorStats";
import { useCurrentDoctor } from "@/hooks/doctors/useRealDoctors";
import { fetchApi } from "@/lib/api-client";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { signOutLocal } from "@/lib/auth/service";
import { getOnboardingStatus } from "@/lib/onboarding-grace";
import DoctorNotificationsBell from "@/components/doctors/DoctorNotificationsBell";
import {
  Activity,
  ArrowRight,
  Calculator,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Home,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Trophy,
  Users,
  Pill,
  X,
  HelpCircle,
} from "lucide-react";
import type { ChangeEvent, JSX, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type ActiveSection =
  | "dashboard"
  | "patients"
  | "appointments"
  | "consultations"
  | "prescriptions"
  | "medical-orders"
  | "community"
  | "accounting"
  | "subscription"
  | "profile"
  | "faq";

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

function formatDateLabel(date: Date, locale = "es-AR"): string {
  return date.toLocaleDateString(locale, {
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
  const allLinks = [
    primaryLinks.find((item) => item.key === "dashboard"),
    primaryLinks.find((item) => item.key === "appointments"),
    primaryLinks.find((item) => item.key === "patients"),
    primaryLinks.find((item) => item.key === "prescriptions"),
    platformLinks.find((item) => item.key === "profile"),
  ].filter((item): item is NavigationItem => Boolean(item));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 min-h-[3.75rem] border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-8px_24px_rgba(15,37,55,0.06)] backdrop-blur-xl md:hidden">
      <div className="flex items-center justify-around px-2">
        {allLinks.map((item) => {
          const isActive = item.key === activeSection;
          return (
            <a
              key={item.key}
              href={item.href}
              className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors ${
                isActive ? "text-[#0284C7]" : "text-slate-500"
              }`}
            >
              <div className="relative">
                <item.icon className="h-5 w-5" strokeWidth={isActive ? 2 : 1.5} />
                {item.badge ? (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                    {item.badge}
                  </span>
                ) : null}
              </div>
              <span className="max-w-full whitespace-normal break-words text-center text-[9px] font-semibold leading-tight">
                {item.label}
              </span>
              {isActive ? (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-[#0284C7]" />
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
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | null>(null);

  const [cachedProfile, setCachedProfile] = useState<{
    doctorName?: string;
    doctorInitials?: string;
    doctorSpecialty?: string;
    avatarUrl?: string | null;
    isValidOrExempt?: boolean;
  } | null>(null);

  useEffect(() => {
    try {
      const val = localStorage.getItem("autamedica_doctor_profile_cache");
      if (val) {
        setCachedProfile(JSON.parse(val));
      }
    } catch {
      // Ignore
    }
  }, []);

  const currentTime = useClock();
  const currentDate = new Date();
  const { user, loading: authLoading } = useAuthenticatedUser();
  // Renew authenticated online presence across every doctor-portal section.
  // This does not activate clinical duty; the server TTL expires after 90 seconds.
  useEffect(() => {
    if (!user?.id) return;

    const sendPresenceHeartbeat = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await fetchApi("/api/doctors/presence/heartbeat", { method: "POST" });
      } catch {
        // Missed pings expire naturally without changing the doctor's duty state.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void sendPresenceHeartbeat();
    };

    void sendPresenceHeartbeat();
    const interval = window.setInterval(() => void sendPresenceHeartbeat(), 30000);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user?.id]);

  const { doctor, refetch: refetchDoctor } = useCurrentDoctor(user?.id);
  const { stats } = useDoctorStats(doctor?.id, user?.id);
  const { exists: _doctorExists } = useCheckDoctorExists(user?.id);

  const onboardingStatus = useMemo(
    () => getOnboardingStatus(user?.onboardingCompletedAt, user?.createdAt),
    [user?.createdAt, user?.onboardingCompletedAt],
  );

  const doctorName = getDoctorDisplayName(doctor, user);
  const doctorInitials = getInitials(doctorName);
  const doctorCredential = doctor as
    | (NonNullable<typeof doctor> & { care_country?: string; uf_brazil?: string })
    | null;
  const isBrazilianPortal = doctorCredential?.care_country === "BR";
  const doctorSpecialty =
    doctor?.specialty || (isBrazilianPortal ? "Especialidade pendente" : "Especialidad pendiente");
  const [cfmCredentialVerified, setCfmCredentialVerified] = useState(false);
  const credentialLabel =
    doctorCredential?.care_country === "BR"
      ? `CRM${doctorCredential.uf_brazil ? `-${doctorCredential.uf_brazil}` : ""} ${doctorCredential.license_number}`
      : doctorCredential?.care_country === "AR"
        ? `MN/MP ${doctorCredential.profile?.matricula_nacional || doctorCredential.license_number}`
        : null;

  useEffect(() => {
    if (!doctor?.id || doctorCredential?.care_country !== "BR") {
      setCfmCredentialVerified(false);
      return;
    }
    let active = true;
    void getBrowserSupabaseClient()
      .from("doctor_licenses")
      .select(
        "license_number, uf_brazil, cfm_evidence_path, cfm_review_notes, cfm_reviewed_by, cfm_reviewed_at, cfm_last_checked_at",
      )
      .eq("doctor_id", doctor.id)
      .eq("license_type", "CRM")
      .eq("status", "active")
      .eq("cfm_validation_status", "valid")
      .limit(20)
      .then(
        ({ data, error }) => {
          if (!active) return;
          const verified =
            !error &&
            Boolean(
              data?.some(
                (license) =>
                  String(license.license_number ?? "").replace(/\D/g, "") ===
                    String(doctorCredential.license_number ?? "").replace(/\D/g, "") &&
                  license.uf_brazil?.toUpperCase() === doctorCredential.uf_brazil?.toUpperCase() &&
                  Boolean(license.cfm_evidence_path?.trim()) &&
                  (license.cfm_review_notes?.trim().length ?? 0) >= 10 &&
                  Boolean(
                    license.cfm_reviewed_by &&
                    license.cfm_reviewed_at &&
                    license.cfm_last_checked_at,
                  ),
              ),
            );
          setCfmCredentialVerified(verified);
        },
        () => {
          if (active) setCfmCredentialVerified(false);
        },
      );
    return () => {
      active = false;
    };
  }, [
    doctor?.id,
    doctorCredential?.care_country,
    doctorCredential?.license_number,
    doctorCredential?.uf_brazil,
  ]);

  const sssStatus =
    (doctor?.profile as { sssValidationStatus?: string | null } | undefined)?.sssValidationStatus ??
    "pending";
  const isValidOrExempt =
    doctorCredential?.care_country === "BR"
      ? cfmCredentialVerified
      : sssStatus === "valid" || sssStatus === "exempt";

  const doctorProfile = doctor?.profile as
    | {
        avatar_url?: string | null;
        avatarUrl?: string | null;
        updated_at?: string | null;
        updatedAt?: string | null;
      }
    | undefined;
  const userProfile = user?.profile as
    | {
        avatar?: string | null;
        avatar_url?: string | null;
        updated_at?: string | null;
        updatedAt?: string | null;
      }
    | undefined;
  const baseAvatarUrl =
    uploadedAvatarUrl ||
    doctorProfile?.avatar_url ||
    doctorProfile?.avatarUrl ||
    userProfile?.avatar_url ||
    userProfile?.avatar ||
    null;

  const avatarUrl = useMemo(() => {
    if (!baseAvatarUrl) return null;
    if (baseAvatarUrl.startsWith("data:") || baseAvatarUrl.includes("?t=")) {
      return baseAvatarUrl;
    }
    const updatedAt =
      doctorProfile?.updated_at ||
      doctorProfile?.updatedAt ||
      userProfile?.updated_at ||
      userProfile?.updatedAt;
    if (updatedAt) {
      const ts = new Date(updatedAt).getTime();
      return `${baseAvatarUrl}?t=${ts}`;
    }
    return baseAvatarUrl;
  }, [
    baseAvatarUrl,
    doctorProfile?.updated_at,
    doctorProfile?.updatedAt,
    userProfile?.updated_at,
    userProfile?.updatedAt,
  ]);

  useEffect(() => {
    if (!authLoading && user && doctor) {
      const cache = {
        doctorName,
        doctorInitials,
        doctorSpecialty,
        avatarUrl,
        isValidOrExempt,
      };
      try {
        localStorage.setItem("autamedica_doctor_profile_cache", JSON.stringify(cache));
        setCachedProfile(cache);
      } catch (err) {
        // Ignore quota/storage errors
      }
    }
  }, [
    authLoading,
    user,
    doctor,
    doctorName,
    doctorInitials,
    doctorSpecialty,
    avatarUrl,
    isValidOrExempt,
  ]);

  const primaryLinks = useMemo<NavigationItem[]>(
    () => [
      {
        href: "/doctors/dashboard",
        label: isBrazilianPortal ? "Início" : "Inicio",
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
        label: "Agenda",
        icon: Calendar,
        key: "appointments",
        badge: stats?.todayCount ? String(stats.todayCount) : undefined,
      },
      {
        href: "/doctors/consultations",
        label: isBrazilianPortal ? "Prontuários" : "Historiales",
        icon: FileText,
        key: "consultations",
      },
      {
        href: "/doctors/prescriptions",
        label: isBrazilianPortal ? "Receitas / Atestados" : "Recetas / Atestados",
        icon: Pill,
        key: "prescriptions",
      },
      {
        href: "/doctors/medical-orders",
        label: isBrazilianPortal ? "Exames" : "Exámenes",
        icon: ClipboardList,
        key: "medical-orders",
      },
    ],
    [stats?.todayCount, isBrazilianPortal],
  );

  const platformLinks = useMemo<NavigationItem[]>(
    () => [
      {
        href: "/doctors/community",
        label: isBrazilianPortal ? "Comunidade" : "Comunidad",
        icon: Trophy,
        key: "community",
        badge: stats?.unreadCommunityCount ? String(stats.unreadCommunityCount) : undefined,
      },
      {
        href: "/doctors/accounting",
        label: isBrazilianPortal ? "Financeiro" : "Contabilidad",
        icon: Calculator,
        key: "accounting",
      },
      {
        href: "/doctors/subscription",
        label: isBrazilianPortal ? "Assinatura" : "Suscripción",
        icon: CreditCard,
        key: "subscription",
      },
      {
        href: "/doctors/perfil",
        label: "Perfil",
        icon: Settings,
        key: "profile",
      },
      {
        href: "/doctors/faq",
        label: isBrazilianPortal ? "Ajuda" : "Ayuda",
        icon: HelpCircle,
        key: "faq",
      },
    ],
    [stats?.unreadCommunityCount, isBrazilianPortal],
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
      setUploadedAvatarUrl(`${result.avatarUrl}?t=${Date.now()}`);
      await refetchDoctor().catch(() => null);
    } catch {
      setPhotoError("No pudimos actualizar la foto profesional.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (authLoading) {
    if (cachedProfile) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
          <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-neutral-200 bg-white px-8 py-10 text-center shadow-sm">
            {/* Avatar with Golden Badge */}
            <div className="relative mb-5 flex-shrink-0">
              <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#0284C7] text-base font-semibold text-white ring-2 ring-[#0284C7]/70 shadow-inner">
                {cachedProfile.avatarUrl ? (
                  <img
                    src={cachedProfile.avatarUrl}
                    alt={cachedProfile.doctorName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{cachedProfile.doctorInitials || "DR"}</span>
                )}
              </div>
              {cachedProfile.isValidOrExempt && (
                <div
                  className="absolute -bottom-1 -right-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#0284C7] text-white ring-2 ring-white shadow-sm"
                  title={
                    doctorCredential?.care_country === "BR"
                      ? "CRM validado por CFM"
                      : "Matrícula validada en SSS / REFEPS"
                  }
                >
                  <Check className="h-3 w-3 text-white" strokeWidth={3.5} />
                </div>
              )}
            </div>

            {/* Doctor Name with Verified icon */}
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-[#0F2537]">
              {cachedProfile.doctorName}
              {cachedProfile.isValidOrExempt && (
                <span
                  className="inline-flex items-center justify-center text-[#0284C7]"
                  title="Matrícula validada en SSS / REFEPS"
                >
                  <CheckCircle2 className="h-4 w-4 fill-am-primary-50 text-[#0284C7]" />
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{cachedProfile.doctorSpecialty}</p>

            <hr className="my-5 w-full border-neutral-100" />

            {/* Loading text and indicator */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
                <span className="text-sm font-medium text-neutral-900">
                  Verificando credenciales
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Iniciando sesión segura en AutaMedica...
              </p>
            </div>
          </div>
        </div>
      );
    }

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
    <div className="portal-doctor min-h-[100dvh] min-w-0 overflow-x-clip bg-[#F8FAFC] text-[#0F2537]">
      {mobileMenuOpen ? (
        <button
          type="button"
          aria-label="Cerrar navegación"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
        />
      ) : null}

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur-xl sm:px-4 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="AutaMedica"
              className="h-8 w-8 object-contain md:h-9 md:w-9"
            />
            <div>
              <div className="text-base font-bold tracking-tight text-[#0F2537] md:text-lg">
                AutaMedica
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0284C7]">
                {doctorCredential?.care_country === "BR" ? "Portal Médico" : "Portal Médico"}
              </div>
            </div>
          </a>

          <div className="flex items-center gap-2 md:gap-3">
            <DoctorNotificationsBell />

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              aria-label={isBrazilianPortal ? "Sair da conta" : "Cerrar sesión"}
              title={isBrazilianPortal ? "Sair da conta" : "Cerrar sesión"}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-[12px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">
                {signingOut
                  ? isBrazilianPortal ? "Saindo..." : "Cerrando sesión..."
                  : isBrazilianPortal ? "Sair" : "Cerrar sesión"}
              </span>
            </button>

            <div className="flex min-w-0 items-center gap-2">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[#0284C7] text-xs font-semibold text-white ring-2 ring-emerald-500/70">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={doctorName} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">
                    {doctorInitials}
                  </span>
                )}
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
              </div>
              <div className="min-w-0 max-w-[42vw] sm:max-w-[240px]">
                <p className="break-words text-[11px] font-bold leading-tight text-[#0F2537] sm:text-sm">
                  {doctorName}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  <span className="rounded-full border border-am-primary-100 bg-am-primary-50 px-1.5 py-0.5 text-[9px] font-medium text-am-primary-800">
                    {doctorSpecialty}
                  </span>
                  {isValidOrExempt && credentialLabel && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-700">
                      <Check className="h-3 w-3" />
                      {credentialLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden text-right md:block">
              <time className="block font-mono text-sm font-medium text-neutral-900">
                {currentTime || "--:--"}
              </time>
              <time className="text-[11px] capitalize text-neutral-400">
                {formatDateLabel(currentDate, isBrazilianPortal ? "pt-BR" : "es-AR")}
              </time>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-57px)]">
        {/* ── Sidebar ── */}
        <aside
          className={`fixed left-0 top-[57px] z-50 h-[calc(100dvh-57px)] max-w-[calc(100vw-2rem)] border-r border-neutral-200/60 bg-white transition-transform duration-300 md:sticky md:translate-x-0 ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          } ${isSidebarCollapsed ? "w-[72px]" : "w-[232px]"}`}
        >
          <div className="flex h-full flex-col overflow-y-auto overscroll-contain">
            {/* Doctor profile */}
            <div className="border-b border-neutral-100 p-4">
              <div
                className={`flex items-center ${isSidebarCollapsed ? "justify-center" : "gap-3"}`}
              >
                <div className="relative flex-shrink-0">
                  <label
                    className="group/avatar relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[#0284C7] text-[13px] font-semibold text-white ring-2 ring-[#0284C7]/70 transition hover:ring-neutral-400"
                    title={avatarUrl ? "Editar foto profesional" : "Subir foto profesional"}
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
                    <span
                      className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500"
                      aria-label="Presencia online"
                    />
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity duration-300 group-hover/avatar:opacity-100">
                      {uploadingPhoto ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <Settings className="h-4 w-4 text-white" />
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/webp,image/jpeg"
                      className="hidden"
                      disabled={uploadingPhoto}
                      onChange={(event) => void handlePhotoUpload(event)}
                    />
                  </label>
                  {isValidOrExempt && (
                    <div
                      className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 text-white ring-2 ring-white shadow-sm animate-fade-in"
                      title="Matrícula validada en SSS / REFEPS"
                    >
                      <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                    </div>
                  )}
                </div>
                {!isSidebarCollapsed ? (
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 whitespace-normal break-words text-[13px] font-semibold text-[#0F2537]">
                      {doctorName}
                      {isValidOrExempt && (
                        <span
                          className="inline-flex items-center justify-center text-[#0284C7]"
                          title="Matrícula validada en SSS / REFEPS"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 fill-am-primary-50 text-[#0284C7]" />
                        </span>
                      )}
                    </p>
                    <span className="mt-1 inline-flex max-w-full rounded-full border border-am-primary-200 bg-am-primary-50 px-2 py-0.5 text-[10px] font-medium text-am-primary-700">
                      {doctorSpecialty}
                    </span>
                    {isValidOrExempt && credentialLabel && (
                      <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-am-primary-200 bg-am-primary-50 px-2 py-0.5 text-[10px] font-semibold text-am-primary-700">
                        <Check className="h-3 w-3 text-[#0284C7]" />
                        {credentialLabel}
                      </span>
                    )}
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
              {!isSidebarCollapsed && photoError ? (
                <div className="mt-2">
                  <p className="text-[11px] leading-relaxed text-red-600">{photoError}</p>
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
                    className={`group flex items-center justify-between min-h-11 rounded-xl px-3 py-3 text-[13px] font-medium transition-colors ${
                      isActive
                        ? "bg-am-primary-50 text-am-primary-800"
                        : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-[#0284C7]" : "text-neutral-400 group-hover:text-neutral-600"}`}
                      />
                      {!isSidebarCollapsed && <span>{item.label}</span>}
                    </div>
                    {!isSidebarCollapsed && item.badge && (
                      <span className="flex h-5 items-center justify-center rounded-md bg-[#0284C7] px-1.5 text-[10px] font-bold text-white">
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
                      className={`group flex items-center justify-between min-h-11 rounded-xl px-3 py-3 text-[13px] font-medium transition-colors ${
                        isActive
                          ? "bg-am-primary-50 text-am-primary-800"
                          : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon
                          className={`h-4 w-4 ${isActive ? "text-[#0284C7]" : "text-neutral-400 group-hover:text-neutral-600"}`}
                        />
                        {!isSidebarCollapsed && <span>{item.label}</span>}
                      </div>
                      {!isSidebarCollapsed && item.badge && (
                        <span className="flex h-5 items-center justify-center rounded-md bg-[#0284C7] px-1.5 text-[10px] font-bold text-white">
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
                    <span>{signingOut ? (isBrazilianPortal ? "Saindo..." : "Cerrando sesión...") : (isBrazilianPortal ? "Sair" : "Cerrar sesión")}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="min-w-0 flex-1 overflow-x-clip">
          {!hideDefaultHeader && (
            <div className="border-b border-neutral-200/60 bg-white/50 px-4 py-5 sm:px-6 sm:py-7 md:px-10 lg:py-10">
              <div className="mx-auto max-w-5xl">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-900 md:text-3xl">
                      {title}
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500">{description}</p>
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
            className={`min-w-0 p-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:p-5 sm:pb-24 md:p-8 md:pb-10 lg:p-10 ${!hideDefaultHeader ? "mx-auto max-w-5xl" : ""}`}
          >
            {children}
          </div>
        </main>
      </div>

      {/* Mobile nav indicator */}
      <button
        type="button"
        onClick={() => setMobileMenuOpen(true)}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#0284C7] text-white shadow-xl shadow-am-primary-900/20 transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-am-primary-300 md:hidden"
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
