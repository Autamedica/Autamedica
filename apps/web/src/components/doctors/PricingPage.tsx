"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api-client";
import type { SubscriptionPlan } from "@autamedica/types";
import {
  Check,
  Crown,
  Loader2,
  Sparkles,
  Shield,
  Zap,
} from "lucide-react";

const PLAN_ICONS: Record<string, typeof Shield> = {
  basico: Shield,
  pro: Zap,
  premium: Crown,
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function PricingPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<SubscriptionPlan[]>("/api/doctors/billing/plans")
      .then(setPlans)
      .catch((err) => setError(err instanceof Error ? err.message : "Error cargando planes"))
      .finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async (slug: string, paymentMethod: 'preapproval' | 'checkout_pro' = 'preapproval') => {
    setLoadingSlug(slug);
    setError(null);
    try {
      const result = await fetchApi<{ subscriptionId: string; initPoint: string }>(
        "/api/doctors/billing/subscription",
        { method: "POST", body: { planSlug: slug, paymentMethod } },
      );
      window.location.href = result.initPoint;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al crear suscripcion";
      setError(msg);
      setLoadingSlug(null);
    }
  };

  const popularSlug = "pro";

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-[12px] font-medium text-neutral-500">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
            Planes para profesionales de la salud
          </div>
          <h1 className="text-4xl font-light tracking-tight text-neutral-900 sm:text-5xl">
            El plan justo para tu practica
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-neutral-400">
            Herramientas profesionales para gestionar pacientes, consultas y facturacion.
            Sin contratos, cancela cuando quieras.
          </p>
        </div>

        {error && (
          <div className="mx-auto mt-8 max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-[13px] text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-16 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          </div>
        ) : (
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {plans.map((plan) => {
              const Icon = PLAN_ICONS[plan.slug] ?? Shield;
              const isPopular = plan.slug === popularSlug;
              const isLoading = loadingSlug === plan.slug;

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border bg-white p-8 shadow-sm transition-shadow hover:shadow-md ${
                    isPopular
                      ? "border-neutral-900 ring-1 ring-neutral-900"
                      : "border-neutral-200"
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="rounded-full bg-neutral-900 px-4 py-1 text-[11px] font-semibold uppercase tracking-widest text-white">
                        Popular
                      </span>
                    </div>
                  )}

                  <div className="mb-6">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600">
                      <Icon className="h-6 w-6" strokeWidth={1.5} />
                    </div>
                    <h2 className="text-xl font-semibold text-neutral-900">{plan.name}</h2>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-4xl font-light tracking-tight text-neutral-900">
                        {formatPrice(plan.priceCents)}
                      </span>
                      <span className="text-[13px] text-neutral-400">
                        /{plan.interval === "monthly" ? "mes" : "ano"}
                      </span>
                    </div>
                  </div>

                  <ul className="mb-8 flex-1 space-y-3">
                    {(plan.features ?? []).map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-[13px] text-neutral-600">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" strokeWidth={1.5} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSubscribe(plan.slug, 'checkout_pro')}
                      disabled={!!loadingSlug}
                      className={`flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[13px] font-medium transition-colors disabled:opacity-50 ${
                        isPopular
                          ? "bg-neutral-900 text-white hover:bg-neutral-800"
                          : "border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
                      }`}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {isLoading ? "Procesando..." : "Suscribirme"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSubscribe(plan.slug, 'preapproval')}
                      disabled={!!loadingSlug}
                      className="flex w-full items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white py-2.5 text-[12px] text-neutral-500 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                    >
                      Pago automatico con tarjeta
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-12 text-center">
          <p className="text-[13px] text-neutral-400">
            Todos los planes incluyen 7 dias de prueba gratis. Pago seguro con MercadoPago.
          </p>
          <a
            href="/doctors/dashboard"
            className="mt-4 inline-block text-[13px] font-medium text-neutral-900 underline underline-offset-4 transition-colors hover:text-neutral-600"
          >
            Ya tengo cuenta, ir al portal
          </a>
        </div>
      </div>
    </div>
  );
}
