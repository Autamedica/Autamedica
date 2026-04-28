"use client";

import { AppointmentsPanel } from "@/components/doctors/appointments/AppointmentsPanel";
import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";

export function DoctorsAppointmentsPage() {
  return (
    <DoctorsPortalFrame
      title="Agenda médica"
      description="Gestiona citas, teleconsultas y disponibilidad desde un entorno unificado para doctores."
      activeSection="appointments"
      hideDefaultHeader
      hideRightSidebar
    >
      <AppointmentsPanel />
    </DoctorsPortalFrame>
  );
}
