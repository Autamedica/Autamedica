"use client";

import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import { ArrowRight, FileText, Video } from "lucide-react";

export function DoctorsConsultationsPage() {
  return (
    <DoctorsPortalFrame
      title="Consultas y registros"
      description="Usa esta vista como hub para abrir historiales, revisar agenda clínica y saltar a teleconsulta cuando corresponda."
      activeSection="consultations"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[20px] border border-am-surface-200 bg-am-surface-50/60 p-5">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-am-doctor-50 to-cyan-50 text-am-doctor-600">
            <FileText className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold text-am-surface-900">Historiales clínicos</h2>
          <p className="mt-2 text-sm leading-6 text-am-surface-600">
            Accede al detalle de pacientes, notas médicas, signos vitales y documentación clínica
            desde la sección de pacientes.
          </p>
          <a
            href="/doctors/patients"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-am-doctor-600 shadow-sm ring-1 ring-am-surface-200 transition-colors hover:bg-am-doctor-50"
          >
            Abrir pacientes
            <ArrowRight className="h-4 w-4" />
          </a>
        </section>

        <section className="rounded-[20px] border border-am-surface-200 bg-am-surface-50/60 p-5">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-green-50 to-emerald-100 text-green-700">
            <Video className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold text-am-surface-900">Teleconsulta</h2>
          <p className="mt-2 text-sm leading-6 text-am-surface-600">
            Las llamadas viven en la ruta de videollamada real. Desde agenda puedes entrar cuando la
            ventana de acceso esté abierta.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="/doctors/agenda"
              className="inline-flex items-center gap-2 rounded-xl border border-am-surface-200 bg-white px-4 py-2.5 text-sm font-medium text-am-surface-700 transition-colors hover:border-am-doctor-300 hover:text-am-surface-900"
            >
              Ver agenda
            </a>
            <a
              href="/doctors/call/index"
              className="inline-flex items-center gap-2 rounded-xl bg-am-doctor-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-am-doctor-600"
            >
              Ir a llamadas
            </a>
          </div>
        </section>
      </div>
    </DoctorsPortalFrame>
  );
}
