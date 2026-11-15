"use client";

import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { useRealPatients } from "@/hooks/doctors/useRealPatients";
import { useDoctorAppointments } from "@/hooks/doctors/useDoctorAppointments";
import { getDisplayName } from "@/lib/doctors/lib/utils";
import { ArrowLeft, ArrowRight, Calendar, FileText, Users, Video, MessageSquare, FileQuestion } from "lucide-react";
import { useMemo } from "react";
import { PatientChat } from "@/components/doctors/patients/PatientChat";

type PatientView = "profile" | "history";

interface DoctorsConsultationsPageProps {
  initialPatientId?: string | null;
  initialView?: PatientView;
}

export function DoctorsConsultationsPage({
  initialPatientId,
  initialView,
}: DoctorsConsultationsPageProps = {}) {
  const { user } = useAuthenticatedUser();
  const { patients, loading: patientsLoading, error: patientsError } = useRealPatients();
  const { appointments } = useDoctorAppointments();

  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const selectedPatientId = initialPatientId ?? urlParams?.get("patient") ?? null;
  const selectedView: PatientView = initialView
    ?? (urlParams?.get("view") === "profile" ? "profile" : "history");

  const selectedPatient = useMemo(() => {
    if (!selectedPatientId) return null;
    return patients.find((patient) => patient.id === selectedPatientId) ?? null;
  }, [patients, selectedPatientId]);

  const patientAppointments = useMemo(() => {
    if (!selectedPatientId) return [];
    return appointments
      .filter((appointment) => appointment.patient_id === selectedPatientId)
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  }, [appointments, selectedPatientId]);

  const selectedPatientName = selectedPatient
    ? getDisplayName(selectedPatient.profile).name
    : null;

  if (selectedPatientId && !selectedPatient && patientsLoading) {
    return (
      <DoctorsPortalFrame
        title="Cargando ficha del paciente"
        description="Recuperando los datos del expediente."
        activeSection="consultations"
      >
        <div role="status" aria-live="polite" className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          Cargando ficha del paciente...
        </div>
      </DoctorsPortalFrame>
    );
  }

  if (selectedPatientId && !selectedPatient) {
    return (
      <DoctorsPortalFrame
        title={patientsError ? "No se pudo cargar la ficha" : "Paciente no encontrado"}
        description="No pudimos abrir el expediente solicitado."
        activeSection="consultations"
      >
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {patientsError || "El paciente no está disponible en tu lista de pacientes asignados."}
          <a href="/doctors/patients" className="mt-4 inline-flex font-semibold underline">
            Volver a pacientes
          </a>
        </div>
      </DoctorsPortalFrame>
    );
  }

  if (selectedPatientId && selectedPatient) {
    const profile = selectedPatient.profile as {
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      phone?: string | null;
    } | null;
    const personalDetails = [
      { label: "Nombre", value: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || selectedPatientName },
      { label: "Correo electrónico", value: profile?.email || "No registrado" },
      { label: "Teléfono", value: profile?.phone || "No registrado" },
      { label: "Fecha de nacimiento", value: selectedPatient.birth_date ? new Date(selectedPatient.birth_date).toLocaleDateString("es-AR") : "No registrada" },
      { label: "Género", value: selectedPatient.gender || "No registrado" },
    ];

    return (
      <DoctorsPortalFrame
        title={selectedView === "profile" ? `Ficha de ${selectedPatientName}` : `Historial de ${selectedPatientName}`}
        description={selectedView === "profile" ? "Datos personales y contacto del paciente." : "Consultas, registros clínicos y canal de comunicación del paciente."}
        activeSection="consultations"
      >
        <div className="space-y-6">
          <a
            href="/doctors/patients"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-neutral-500 transition-colors hover:text-neutral-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a pacientes
          </a>

          <nav aria-label="Secciones del paciente" className="flex flex-wrap gap-2 border-b border-neutral-200 pb-3">
            <a
              href={`/doctors/patients/${encodeURIComponent(selectedPatientId)}`}
              aria-current={selectedView === "profile" ? "page" : undefined}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${selectedView === "profile" ? "bg-sky-100 text-sky-800" : "text-neutral-500 hover:bg-neutral-100"}`}
            >
              Ficha
            </a>
            <a
              href={`/doctors/consultations?patient=${encodeURIComponent(selectedPatientId)}&view=history`}
              aria-current={selectedView === "history" ? "page" : undefined}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${selectedView === "history" ? "bg-sky-100 text-sky-800" : "text-neutral-500 hover:bg-neutral-100"}`}
            >
              Historial clínico
            </a>
          </nav>

          {selectedView === "profile" ? (
            <div className="grid gap-5 lg:grid-cols-3">
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm lg:col-span-2">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-neutral-900">Datos personales</h2>
                    <p className="text-xs text-neutral-500">Información disponible en el perfil del paciente</p>
                  </div>
                </div>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {personalDetails.map((detail) => (
                    <div key={detail.label} className="rounded-xl bg-neutral-50 px-4 py-3">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{detail.label}</dt>
                      <dd className="mt-1 break-words text-sm font-medium text-neutral-900">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <aside className="rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
                <FileText className="mb-3 h-6 w-6 text-sky-700" />
                <h2 className="text-sm font-bold text-neutral-900">Historial clínico</h2>
                <p className="mt-2 text-xs leading-relaxed text-neutral-600">
                  Consultá las consultas registradas, sus fechas y el canal de comunicación del paciente.
                </p>
                <a
                  href={`/doctors/consultations?patient=${encodeURIComponent(selectedPatientId)}&view=history`}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0EA5E9] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#0284C7]"
                >
                  Abrir historial <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </aside>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-3 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-neutral-900">Consultas registradas</h2>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-semibold text-neutral-600">{patientAppointments.length}</span>
                </div>
                {patientAppointments.length > 0 ? (
                  patientAppointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200/60 bg-white p-4 transition-colors hover:bg-neutral-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${appointment.type === "telemedicine" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"}`}>
                          {appointment.type === "telemedicine" ? <Video className="h-4 w-4" strokeWidth={1.5} /> : <Calendar className="h-4 w-4" strokeWidth={1.5} />}
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-neutral-900">
                            {appointment.type === "telemedicine" ? "Teleconsulta" : "Consulta presencial"}
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            {new Date(appointment.start_time).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{" "}
                            {new Date(appointment.start_time).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${appointment.status === "completed" ? "bg-neutral-100 text-neutral-600" : appointment.status === "confirmed" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                        {appointment.status === "completed" ? "Completada" : appointment.status === "confirmed" ? "Confirmada" : appointment.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-16">
                    <FileText className="mb-3 h-10 w-10 text-neutral-200" strokeWidth={1} />
                    <p className="text-[13px] text-neutral-500">No hay consultas registradas para este paciente.</p>
                  </div>
                )}
              </div>

              <aside className="space-y-4">
                <h2 className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Canal de comunicación
                </h2>
                <PatientChat
                  patientId={selectedPatientId}
                  doctorId={user?.doctorProfileId || ""}
                  caseId="general_followup"
                  patientName={selectedPatientName || "Paciente"}
                />
              </aside>
            </div>
          )}
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
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
            Accede al detalle de pacientes, notas médicas, signos vitales y documentación clínica.
          </p>
          <a href="/doctors/patients" className="mt-5 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800">
            Abrir pacientes <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </section>

        <section className="rounded-xl border border-neutral-200/60 bg-neutral-50/50 p-5">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-green-600 text-white">
            <Video className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <h2 className="text-base font-medium text-neutral-900">Teleconsulta</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
            Las llamadas viven en la ruta de videollamada. Desde agenda puedes entrar cuando la ventana de acceso esté abierta.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/doctors/agenda" className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-[13px] font-medium text-neutral-700 transition-colors hover:border-neutral-300">
              Ver agenda
            </a>
            <a href="/doctors/call/index" className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800">
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
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
          Cuando una farmacia necesite confirmar una pauta antes de dispensar, la consulta llega acá para responderla y destrabar la receta.
        </p>
        <a href="/doctors/clarifications" className="mt-5 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800">
          Revisar aclaraciones <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </section>
    </DoctorsPortalFrame>
  );
}
