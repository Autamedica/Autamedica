"use client";

import { PatientsPanel } from "@/components/doctors/patients/PatientsPanel";
import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import { useCallback } from "react";

export function DoctorsPatientsPage() {
  const handleSelectPatient = useCallback(
    (patientId: string, tab?: "patient-info" | "medical-history") => {
      if (tab === "medical-history") {
        window.location.href = `/doctors/consultations?patient=${patientId}`;
      } else {
        window.location.href = `/doctors/consultations?patient=${patientId}`;
      }
    },
    [],
  );

  return (
    <DoctorsPortalFrame
      title="Pacientes asignados"
      description="Explora la base clínica, abre expedientes y arranca acciones médicas desde el mismo workspace."
      activeSection="patients"
    >
      <PatientsPanel onSelectPatient={handleSelectPatient} />
    </DoctorsPortalFrame>
  );
}
