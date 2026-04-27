"use client";

import { useCurrentDoctor } from "@/hooks/doctors/useRealDoctors";
import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";

type LicenseValidationStatus = "pending" | "valid" | "invalid";

type DoctorProfileWithLicense = {
  sssValidationStatus?: LicenseValidationStatus | null;
};

export function LicenseStatusBanner() {
  const { user } = useAuthenticatedUser();
  const { doctor } = useCurrentDoctor(user?.id);
  const profile = doctor?.profile as DoctorProfileWithLicense | undefined;

  const sssStatus = profile?.sssValidationStatus ?? "pending";
  const isValid = sssStatus === "valid";

  if (isValid) {
    return (
      <div className="relative mb-8 flex items-center justify-between overflow-hidden rounded-xl border border-emerald-200/50 bg-emerald-50/50 p-4 px-6 backdrop-blur-sm">
        <div className="absolute inset-0 bg-emerald-500/5 opacity-50" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-medium uppercase tracking-tight text-emerald-900">Matricula validada</h3>
            <p className="text-xs text-emerald-700/80">Registro Nacional SSS / REFEPS. Credenciales habilitadas para emision de recetas electronicas.</p>
          </div>
        </div>
        <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-600">
          DNPDP EX-2026-36544262
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-8 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 p-5"
    >
      <div className="flex items-start gap-4">
        <div className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <h3 className="mb-1 text-base font-semibold tracking-tight text-amber-900">
            Validacion de matricula pendiente
          </h3>
          <p className="mb-4 text-sm leading-relaxed text-amber-800/80">
            Tu matricula debe cruzarse con registros nacionales para habilitar credenciales clinicas y emision segura de recetas electronicas.
          </p>
          <div className="flex gap-3">
            <a href="/doctors/onboarding/license" className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700">
              Validar matricula ahora
            </a>
            <button className="inline-flex items-center justify-center rounded-lg bg-transparent px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100">
              Mas informacion
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
