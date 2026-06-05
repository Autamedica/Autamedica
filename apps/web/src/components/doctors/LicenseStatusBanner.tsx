"use client";

import { useCurrentDoctor } from "@/hooks/doctors/useRealDoctors";
import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";
import type { DoctorWithProfile } from "@autamedica/types";

type LicenseValidationStatus = "pending" | "valid" | "pending_review" | "rejected" | "exempt";

type DoctorProfileWithLicense = {
  sssValidationStatus?: LicenseValidationStatus | null;
  matriculaNacional?: string | null;
};

export function LicenseStatusBanner({ doctor: providedDoctor }: { doctor?: DoctorWithProfile | null }) {
  const { user } = useAuthenticatedUser();
  const { doctor: fetchedDoctor, loading } = useCurrentDoctor(providedDoctor ? undefined : user?.id);
  const doctor = providedDoctor ?? fetchedDoctor;

  if (!providedDoctor && loading) {
    return null;
  }

  const profile = doctor?.profile as DoctorProfileWithLicense | undefined;

  const sssStatus = profile?.sssValidationStatus ?? "pending";
  const isValid = sssStatus === "valid";
  const isExempt = sssStatus === "exempt";
  const isRejected = sssStatus === "rejected";
  const needsReview = sssStatus === "pending_review";

  if (isValid || isExempt) {
    return null;
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
            {isRejected
              ? "Matricula no aprobada"
              : needsReview
                ? "Matricula en revision"
                : "Validacion de matricula pendiente"}
          </h3>
            <p className="mb-4 text-sm leading-relaxed text-amber-800/80">
              {isRejected
                ? "No pudimos aprobar la matricula cargada. Revisala desde tu perfil profesional."
                : needsReview
                  ? "No pudimos validarla automaticamente. El equipo la va a revisar con tu documentacion profesional."
                  : "Validá tu matrícula para habilitar credenciales clínicas y recetas electrónicas."}
            </p>
          <div className="flex gap-3">
            <a href="/doctors/perfil#license-verification" className="inline-flex items-center justify-center rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700">
              {isRejected || needsReview ? "Revisar datos" : "Validar matricula ahora"}
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
