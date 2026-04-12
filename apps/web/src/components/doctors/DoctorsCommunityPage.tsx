"use client";

import { DoctorCommunityPage } from "@/components/doctors/DoctorCommunityPage";
import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";

export function DoctorsCommunityPage() {
  return (
    <DoctorsPortalFrame
      title="Comunidad médica"
      description="Responde preguntas abiertas, suma actividad al ranking profesional y mantente dentro del flujo correcto del portal."
      activeSection="community"
    >
      <DoctorCommunityPage embedded />
    </DoctorsPortalFrame>
  );
}
