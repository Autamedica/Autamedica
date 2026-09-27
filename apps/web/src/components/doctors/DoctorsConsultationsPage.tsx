"use client";

import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { useRealPatients } from "@/hooks/doctors/useRealPatients";
import { useDoctorAppointments } from "@/hooks/doctors/useDoctorAppointments";
import { getDisplayName } from "@/lib/doctors/lib/utils";
import { ArrowLeft, ArrowRight, Calendar, FileText, Users, Video, MessageSquare, FileQuestion } from "lucide-react";
import { useMemo } from "react";
import { PatientChat } from "@/components/doctors/patients/PatientChat";

export function DoctorsConsultationsPage() {
  const { user } = useAuthenticatedUser();
  const { patients } = useRealPatients();
  const { appointments } = useDoctorAppointments();

  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const selectedPatientId = urlParams?.get("patient") ?? null;

  const selectedPatient = useMemo(() => {
    if (!selectedPatientId) return null;
    return patients.find((p) => p.id === selectedPatientId) ?? null;
  }, [patients, selectedPatientId]);

  const patientAppointments = useMemo(() => {
    if (!selectedPatientId) return [];
    return appointments
      .filter((a) => a.patient_id === selectedPatientId)
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  }, [appointments, selectedPatientId]);

  const selectedPatientName = selectedPatient
    ? getDisplayName(selectedPatient.profile).name
    : null;

  if (selectedPatientId && selectedPatient) {
    return (
      <DoctorsPortalFrame
        title={`Historial de ${selectedPatientName}`}
        description="Consultas, registros clínicos y documentación del paciente."
        activeSection="consultations"
      >
        <div className="space-y-6">
          <a
            href="/doctors/patients"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-neutral-400 transition-colors hover:text-neutral-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a pacientes
          </a>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              {patientAppointments.length > 0 ? (
                <div className="space-y-3">
                  {patientAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="flex items-center justify-between rounded-xl border border-neutral-200/60 bg-white p-4 transition-colors hover:bg-neutral-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          appt.type === "telemedicine"
                            ? "bg-green-50 text-green-600"
                            : "bg-blue-50 text-blue-600"
                        }`}>
                          {appt.type === "telemedicine" ? (
                            <Video className="h-4 w-4" strokeWidth={1.5} />
                          ) : (
                            <Calendar className="h-4 w-4" strokeWidth={1.5} />
                          )}
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-neutral-900">
                            {appt.type === "telemedicine" ? "Teleconsulta" : "Consulta presencial"}
                          </p>
                          <p className="text-[11px] text-neutral-400">
                            {new Date(appt.start_time).toLocaleDateString("es-AR", {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}{" "}
                            {new Date(appt.start_time).toLocaleTimeString("es-AR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                        appt.status === "completed"
                          ? "bg-neutral-100 text-neutral-600"
                          : appt.status === "confirmed"
                            ? "bg-green-50 text-green-700"
                            : "bg-amber-50 text-amber-700"
                      }`}>
                        {appt.status === "completed" ? "Completada" : appt.status === "confirmed" ? "Confirmada" : appt.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-16">
                  <FileText className="mb-3 h-10 w-10 text-neutral-200" strokeWidth={1} />
                  <p className="text-[13px] text-neutral-400">
                    No hay consultas registradas para este paciente.
                  </p>
                </div>
              )}
            </div>

            {/* Chat Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Canal de Comunicación
                </h3>
              </div>
              <PatientChat 
                patientId={selectedPatientId} 
                doctorId={user?.doctorProfileId || ""} 
                caseId="general_followup"
                patientName={selectedPatientName || "Paciente"}
              />
            </div>
          </div>
        </div>
      </DoctorsPortalFrame>
    );
  }

  return (
    <DoctorsPortalFrame
      title="Consultas y registros"
      description="Hub para abrir historiales, revisar agenda clínica y saltar a teleconsulta."
      activeSection="consultations"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-200/60 bg-neutral-50/50 p-5">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-900 text-white">
            <Users className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <h2 className="text-base font-medium text-neutral-900">Historiales clínicos</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
            Accede al detalle de pacientes, notas médicas, signos vitales y documentación clínica.
          </p>
          <a
            href="/doctors/patients"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Abrir pacientes
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </section>

        <section className="rounded-xl border border-neutral-200/60 bg-neutral-50/50 p-5">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-green-600 text-white">
            <Video className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <h2 className="text-base font-medium text-neutral-900">Teleconsulta</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
            Las llamadas viven en la ruta de videollamada. Desde agenda puedes entrar cuando la ventana de acceso esté abierta.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="/doctors/agenda"
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-[13px] font-medium text-neutral-700 transition-colors hover:border-neutral-300"
            >
              Ver agenda
            </a>
            <a
              href="/doctors/call/index"
              className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
            >
              Ir a llamadas
            </a>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-amber-200/60 bg-amber-50/50 p-5">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-amber-500 text-white">
          <FileQuestion className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <h2 className="text-base font-medium text-neutral-900">Aclaraciones de farmacia</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
          Cuando una farmacia necesite confirmar una pauta antes de dispensar, la consulta llega acá para responderla y destrabar la receta.
        </p>
        <a
          href="/doctors/clarifications"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Revisar aclaraciones
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </section>
    </DoctorsPortalFrame>
  );
}
