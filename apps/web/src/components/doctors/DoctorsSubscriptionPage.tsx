"use client";

import { useState } from "react";
import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { useSubscription } from "@/hooks/doctors/useSubscription";
import { DoctorsPortalFrame } from "./DoctorsPortalFrame";
import {
  Check,
  CreditCard,
  Crown,
  Loader2,
  Shield,
  X,
  Zap,
  AlertTriangle,
  CalendarClock,
  ArrowUpRight,
} from "lucide-react";
import type { PlanSlug } from "@autamedica/types";

const PLAN_ICONS: Record<PlanSlug, typeof Shield> = {
  basico: Shield,
  pro: Zap,
  premium: Crown,
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Activa", color: "bg-green-100 text-green-700" },
  trialing: { label: "Periodo de prueba", color: "bg-blue-100 text-blue-700" },
  past_due: { label: "Pago pendiente", color: "bg-amber-100 text-amber-700" },
  cancelled: { label: "Cancelada", color: "bg-neutral-100 text-neutral-500" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents);
}

export function DoctorsSubscriptionPage({ locale: _locale }: { locale?: string }) {
  const { user } = useAuthenticatedUser();
  const { plans, subscription, loading, error, subscribe, cancel } =
    useSubscription(user?.id);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCancel = async () => {
    setCancelling(true);
    setActionError(null);
    try {
      await cancel();
      setShowCancelConfirm(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cancelar";
      setActionError(msg);
    } finally {
      setCancelling(false);
    }
  };

  const handleUpgrade = async (planSlug: string) => {
    setUpgrading(planSlug);
    setActionError(null);
    try {
      const result = await subscribe(planSlug);
      window.location.href = result.initPoint;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cambiar plan";
      setActionError(msg);
      setUpgrading(null);
    }
  };

  const currentPlan = subscription?.plan;
  const statusInfo = subscription
    ? STATUS_LABELS[subscription.status] ?? { label: subscription.status, color: "bg-neutral-100 text-neutral-500" }
    : null;
  const PlanIcon = currentPlan ? PLAN_ICONS[currentPlan.slug as PlanSlug] ?? CreditCard : CreditCard;
  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const currentPlanIndex = currentPlan
    ? ["basico", "pro", "premium"].indexOf(currentPlan.slug)
    : -1;

  return (
    <DoctorsPortalFrame
      activeSection="subscription"
      title="Suscripcion"
      description="Gestion de tu plan y facturacion"
    >
      <div className="space-y-6">
        {(error || actionError) && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {error || actionError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        ) : !subscription ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100">
              <CreditCard className="h-7 w-7 text-neutral-400" strokeWidth={1.5} />
            </div>
            <h2 className="text-xl font-light tracking-tight text-neutral-900">
              No tenes una suscripcion activa
            </h2>
            <p className="mt-2 text-[13px] text-neutral-400">
              Elegi un plan para acceder a todas las funcionalidades del portal.
            </p>
            <a
              href="/doctors/pricing"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
            >
              Ver planes
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-neutral-200/60 bg-white p-6">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
                    <PlanIcon className="h-6 w-6" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-semibold text-neutral-900">
                        Plan {currentPlan?.name}
                      </h2>
                      {statusInfo && (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[13px] text-neutral-400">
                      {currentPlan
                        ? `${formatCurrency(currentPlan.priceCents / 100)}/${currentPlan.interval === "monthly" ? "mes" : "ano"}`
                        : ""}
                    </p>
                  </div>
                </div>

                {isActive && (
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(true)}
                    className="shrink-0 rounded-lg border border-neutral-200 px-4 py-2 text-[13px] font-medium text-neutral-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    Cancelar plan
                  </button>
                )}
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 border-t border-neutral-100 pt-6 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-widest text-neutral-300">
                    Inicio del periodo
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-[13px] font-medium text-neutral-900">
                    <CalendarClock className="h-3.5 w-3.5 text-neutral-400" strokeWidth={1.5} />
                    {formatDate(subscription.currentPeriodStart)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-widest text-neutral-300">
                    Renovacion
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-[13px] font-medium text-neutral-900">
                    <CalendarClock className="h-3.5 w-3.5 text-neutral-400" strokeWidth={1.5} />
                    {formatDate(subscription.currentPeriodEnd)}
                  </p>
                </div>
                {subscription.cancelledAt && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-widest text-neutral-300">
                      Cancelada el
                    </p>
                    <p className="mt-1 text-[13px] font-medium text-red-600">
                      {formatDate(subscription.cancelledAt)}
                    </p>
                  </div>
                )}
              </div>

              {currentPlan?.features && currentPlan.features.length > 0 && (
                <div className="mt-6 border-t border-neutral-100 pt-6">
                  <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-neutral-300">
                    Incluido en tu plan
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {currentPlan.features.map((feature) => (
                      <div
                        key={feature}
                        className="flex items-center gap-2 text-[13px] text-neutral-600"
                      >
                        <Check className="h-3.5 w-3.5 shrink-0 text-neutral-400" strokeWidth={1.5} />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {isActive && currentPlanIndex < 2 && plans.length > 0 && (
              <div>
                <h3 className="mb-4 text-[13px] font-semibold text-neutral-900">
                  Mejorar plan
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {plans
                    .filter((p) => {
                      const idx = ["basico", "pro", "premium"].indexOf(p.slug);
                      return idx > currentPlanIndex && p.active;
                    })
                    .map((plan) => {
                      const UpIcon = PLAN_ICONS[plan.slug as PlanSlug] ?? CreditCard;
                      const isUpgrading = upgrading === plan.slug;

                      return (
                        <div
                          key={plan.id}
                          className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
                              <UpIcon className="h-5 w-5" strokeWidth={1.5} />
                            </div>
                            <div>
                              <p className="text-[13px] font-semibold text-neutral-900">
                                {plan.name}
                              </p>
                              <p className="text-[11px] text-neutral-400">
                                {formatCurrency(plan.priceCents / 100)}/
                                {plan.interval === "monthly" ? "mes" : "ano"}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleUpgrade(plan.slug)}
                            disabled={!!upgrading}
                            className="flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                          >
                            {isUpgrading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            )}
                            {isUpgrading ? "Procesando..." : "Upgrade"}
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}

        {showCancelConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">Cancelar suscripcion</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
                Tu suscripcion seguira activa hasta el final del periodo actual
                ({formatDate(subscription?.currentPeriodEnd ?? null)}). Despues de eso perderas
                acceso a las funcionalidades del plan.
              </p>
              {actionError && (
                <p className="mt-3 text-[13px] text-red-600">{actionError}</p>
              )}
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelConfirm(false);
                    setActionError(null);
                  }}
                  className="flex-1 rounded-full border border-neutral-200 py-2.5 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  disabled={cancelling}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-600 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  )}
                  {cancelling ? "Cancelando..." : "Confirmar cancelacion"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DoctorsPortalFrame>
  );
}
