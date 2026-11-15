"use client";

import { PatientsPanel } from "@/components/doctors/patients/PatientsPanel";
import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import { useCallback } from "react";

export function DoctorsPatientsPage() {
  const handleSelectPatient = useCallback(
    (patientId: string, tab?: "patient-info" | "medical-history") => {
      const encodedPatientId = encodeURIComponent(patientId);
      if (tab === "medical-history") {
        window.location.href = `/doctors/consultations?patient=${encodedPatientId}&view=history`;
        return;
      }
      window.location.href = `/doctors/patients/${encodedPatientId}`;
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
