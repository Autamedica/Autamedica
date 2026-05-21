"use client";

import { AppointmentsPanel } from "@/components/doctors/appointments/AppointmentsPanel";
import { AvailabilityEditor } from "@/components/doctors/appointments/AvailabilityEditor";
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
      <div className="px-6 pt-4 pb-2">
        <AvailabilityEditor />
      </div>
      <AppointmentsPanel />
    </DoctorsPortalFrame>
  );
}
