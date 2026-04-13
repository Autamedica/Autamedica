"use client";

import { useState } from "react";
import { fetchApi } from "@/lib/api-client";
import {
  Check,
  Crown,
  Loader2,
  Sparkles,
  Shield,
  Zap,
} from "lucide-react";

interface PlanConfig {
  slug: string;
  name: string;
  price: number;
  interval: string;
  popular?: boolean;
  icon: typeof Shield;
  features: string[];
}

const PLANS: PlanConfig[] = [
  {
    slug: "basico",
    name: "Basico",
    price: 15_000,
    interval: "mes",
    icon: Shield,
    features: [
      "Hasta 50 pacientes",
      "Agenda de citas",
      "Historia clinica digital",
      "Recetas electronicas",
      "Soporte por email",
    ],
  },
  {
    slug: "pro",
    name: "Pro",
    price: 30_000,
    interval: "mes",
    popular: true,
    icon: Zap,
    features: [
      "Pacientes ilimitados",
      "Agenda de citas avanzada",
      "Historia clinica digital",
      "Recetas electronicas",
      "Teleconsulta integrada",
      "Analisis IA de consultas",
      "Contabilidad fiscal",
      "Soporte prioritario",
    ],
  },
  {
    slug: "premium",
    name: "Premium",
    price: 50_000,
    interval: "mes",
    icon: Crown,
    features: [
      "Todo lo de Pro",
      "Multi-consultorio",
      "API para integraciones",
      "Facturacion electronica AFIP",
      "Dashboard analytics avanzado",
      "Onboarding personalizado",
      "Soporte dedicado 24/7",
      "Marca blanca",
    ],
  },
];

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents);
}

export function PricingPage() {
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async (slug: string) => {
    setLoadingSlug(slug);
    setError(null);
    try {
      const result = await fetchApi<{ initPoint: string }>(
        "/api/doctors/billing/subscription",
        { method: "POST", body: { planSlug: slug } },
      );
      window.location.href = result.initPoint;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al crear suscripcion";
      setError(msg);
      setLoadingSlug(null);
    }
  };

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

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isLoading = loadingSlug === plan.slug;

            return (
              <div
                key={plan.slug}
                className={`relative flex flex-col rounded-2xl border bg-white p-8 shadow-sm transition-shadow hover:shadow-md ${
                  plan.popular
                    ? "border-neutral-900 ring-1 ring-neutral-900"
                    : "border-neutral-200"
                }`}
              >
                {plan.popular && (
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
                      {formatPrice(plan.price)}
                    </span>
                    <span className="text-[13px] text-neutral-400">/{plan.interval}</span>
                  </div>
                </div>

                <ul className="mb-8 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-[13px] text-neutral-600">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" strokeWidth={1.5} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => void handleSubscribe(plan.slug)}
                  disabled={!!loadingSlug}
                  className={`flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[13px] font-medium transition-colors disabled:opacity-50 ${
                    plan.popular
                      ? "bg-neutral-900 text-white hover:bg-neutral-800"
                      : "border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {isLoading ? "Procesando..." : "Suscribirme"}
                </button>
              </div>
            );
          })}
        </div>

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
