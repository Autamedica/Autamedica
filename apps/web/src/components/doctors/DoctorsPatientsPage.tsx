"use client";

import { PatientsPanel } from "@/components/doctors/patients/PatientsPanel";
import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";

export function DoctorsPatientsPage() {
  return (
    <DoctorsPortalFrame
      title="Pacientes asignados"
      description="Explora la base clínica, abre expedientes y arranca acciones médicas desde el mismo workspace."
      activeSection="patients"
    >
      <PatientsPanel />
    </DoctorsPortalFrame>
  );
}
