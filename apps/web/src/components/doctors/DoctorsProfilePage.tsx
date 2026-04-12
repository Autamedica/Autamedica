"use client";

import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import { ProfileForm } from "@/components/doctors/ProfileForm";

export function DoctorsProfilePage() {
  return (
    <DoctorsPortalFrame
      title="Configuración profesional"
      description="Completa y actualiza tu perfil médico para habilitar agenda, verificación profesional y acceso clínico completo."
      activeSection="profile"
    >
      <ProfileForm />
    </DoctorsPortalFrame>
  );
}
