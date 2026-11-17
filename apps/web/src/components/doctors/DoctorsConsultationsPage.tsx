"use client";

import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import { PatientChat } from "@/components/doctors/patients/PatientChat";
import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { useRealPatients } from "@/hooks/doctors/useRealPatients";
import { useCurrentDoctor } from "@/hooks/doctors/useRealDoctors";
import { useDoctorAppointments } from "@/hooks/doctors/useDoctorAppointments";
import { useMedicalHistory } from "@/hooks/doctors/useMedicalHistory";
import type { UUID } from "@/types/medical";
import { getDisplayName } from "@/lib/doctors/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  ClipboardList,
  Clock,
  Droplets,
  FileText,
  HeartPulse,
  Mail,
  MessageSquare,
  Phone,
  Ruler,
  ShieldCheck,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { useMemo } from "react";

type PatientWorkspaceTab = "patient-info" | "medical-history";

function displayValue(value: unknown, fallback = "No informado"): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "No informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function clinicalItemLabel(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  for (const key of [
    "name",
    "allergen",
    "medication",
    "condition",
    "diagnosis",
    "title",
    "description",
    "notes",
  ]) {
    const candidate = item[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function clinicalItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(clinicalItemLabel).filter((item): item is string => Boolean(item));
}

function medicalRecordSummary(row: Record<string, unknown>): string | null {
  const content = row.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (content && typeof content === "object") {
    const data = content as Record<string, unknown>;
    for (const key of [
      "summary",
      "chiefComplaint",
      "chief_complaint",
      "diagnosis",
      "notes",
      "description",
    ]) {
      const candidate = data[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  for (const key of ["diagnosis", "chief_complaint", "title"]) {
    const candidate = row[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function InfoCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="mb-1.5 flex items-center gap-2 text-slate-500">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="break-words text-sm font-semibold text-[#0F2537]">{value}</p>
    </div>
  );
}

function ClinicalList({
  title,
  items,
  emptyLabel,
  icon: Icon,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
  icon: LucideIcon;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#0284C7]" />
        <h3 className="text-sm font-bold text-[#0F2537]">{title}</h3>
      </div>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={title + "-" + index} className="flex items-start gap-2 text-sm text-slate-700">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0284C7]" />
              <span className="break-words">{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">{emptyLabel}</p>
      )}
    </section>
  );
}

export function DoctorsConsultationsPage({
  patientId: routePatientId,
}: { patientId?: string } = {}) {
  const { user } = useAuthenticatedUser();
  const { patients, loading: patientsLoading } = useRealPatients();
  const { appointments } = useDoctorAppointments();
  const { doctor } = useCurrentDoctor(user?.id);

  const urlParams =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const selectedPatientId = routePatientId ?? urlParams?.get("patient") ?? null;
  const activePatientTab: PatientWorkspaceTab =
    urlParams?.get("tab") === "medical-history" ? "medical-history" : "patient-info";

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

  const {
    records,
    loading: historyLoading,
    error: historyError,
    loadMore,
    hasMore,
  } = useMedicalHistory(selectedPatientId as UUID | null);

  const selectedPatientName = selectedPatient
    ? getDisplayName(selectedPatient.profile).name
    : "Paciente";
  const isBrazilianDoctor =
    (doctor as (NonNullable<typeof doctor> & { care_country?: string }) | null)?.care_country ===
    "BR";

  if (selectedPatientId && (selectedPatient || patientsLoading)) {
    if (patientsLoading && !selectedPatient) {
      return (
        <DoctorsPortalFrame
          title="Ficha del paciente"
          description="Cargando datos del paciente."
          activeSection="patients"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
            Cargando ficha clínica…
          </div>
        </DoctorsPortalFrame>
      );
    }

    if (!selectedPatient) {
      return (
        <DoctorsPortalFrame
          title="Paciente no encontrado"
          description="El paciente no está disponible en tu lista asignada."
          activeSection="patients"
        >
          <a
            href="/doctors/patients"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#0284C7]"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a pacientes
          </a>
        </DoctorsPortalFrame>
      );
    }

    const profile = selectedPatient.profile;
    const emergencyContact = selectedPatient.emergency_contact;
    const insurance = selectedPatient.insurance_info as {
      provider?: string;
      plan_name?: string;
      policy_number?: string;
    } | null;
    const historyItems = clinicalItems(selectedPatient.medical_history);
    const allergyItems = clinicalItems(selectedPatient.allergies);
    const medicationItems = clinicalItems(selectedPatient.medications);
    const birthDate = selectedPatient.birth_date ? new Date(selectedPatient.birth_date) : null;
    const age =
      birthDate && !Number.isNaN(birthDate.getTime())
        ? Math.max(0, Math.floor((Date.now() - birthDate.getTime()) / 31557600000))
        : null;
    const gender =
      selectedPatient.gender === "male"
        ? "Masculino"
        : selectedPatient.gender === "female"
          ? "Femenino"
          : selectedPatient.gender === "other"
            ? isBrazilianDoctor
              ? "Outro"
              : "Otro"
            : selectedPatient.gender === "prefer_not_to_say"
              ? isBrazilianDoctor
                ? "Prefere não informar"
                : "Prefiere no informar"
              : "No informado";

    return (
      <DoctorsPortalFrame
        title={selectedPatientName}
        description={
          isBrazilianDoctor
            ? "Ficha do paciente, dados de contato e histórico clínico."
            : "Ficha del paciente, datos de contacto e historial clínico."
        }
        activeSection="patients"
      >
        <div className="space-y-4 sm:space-y-5">
          <a
            href="/doctors/patients"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-[#0284C7]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {isBrazilianDoctor ? "Voltar aos pacientes" : "Volver a pacientes"}
          </a>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0284C7] ring-2 ring-emerald-500/40">
                <UserRound className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words text-lg font-bold text-[#0F2537]">
                  {selectedPatientName}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span>{displayValue(selectedPatient.dni, "Documento não informado")}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">
                    {isBrazilianDoctor ? "Paciente" : "Paciente asignado"}
                  </span>
                </div>
              </div>
              <a
                href={profile.phone ? "tel:" + profile.phone : undefined}
                aria-disabled={!profile.phone}
                className={
                  "inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white " +
                  (profile.phone
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "pointer-events-none bg-slate-300")
                }
              >
                <Phone className="h-3.5 w-3.5" />
                {isBrazilianDoctor ? "Ligar" : "Llamar"}
              </a>
            </div>
          </section>

          <nav
            aria-label="Secciones de la ficha"
            className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm"
          >
            <a
              href={
                "/doctors/patients/" + encodeURIComponent(selectedPatientId) + "?tab=patient-info"
              }
              aria-current={activePatientTab === "patient-info" ? "page" : undefined}
              className={
                "flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 py-2 text-center text-xs font-bold transition " +
                (activePatientTab === "patient-info"
                  ? "bg-blue-50 text-[#0284C7] ring-1 ring-blue-200"
                  : "text-slate-500 hover:bg-slate-50")
              }
            >
              <UserRound className="h-3.5 w-3.5" />
              {isBrazilianDoctor ? "Dados do paciente" : "Datos del paciente"}
            </a>
            <a
              href={
                "/doctors/patients/" +
                encodeURIComponent(selectedPatientId) +
                "?tab=medical-history"
              }
              aria-current={activePatientTab === "medical-history" ? "page" : undefined}
              className={
                "flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 py-2 text-center text-xs font-bold transition " +
                (activePatientTab === "medical-history"
                  ? "bg-blue-50 text-[#0284C7] ring-1 ring-blue-200"
                  : "text-slate-500 hover:bg-slate-50")
              }
            >
              <HeartPulse className="h-3.5 w-3.5" />
              {isBrazilianDoctor ? "Histórico clínico" : "Historial clínico"}
            </a>
          </nav>

          {activePatientTab === "patient-info" ? (
            <div className="space-y-4">
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-[#0284C7]" />
                  <h2 className="text-sm font-bold text-[#0F2537]">
                    {isBrazilianDoctor ? "Dados filiativos" : "Datos filiatorios"}
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <InfoCard
                    label="Documento"
                    value={displayValue(selectedPatient.dni)}
                    icon={ShieldCheck}
                  />
                  <InfoCard
                    label={isBrazilianDoctor ? "Nascimento" : "Fecha de nacimiento"}
                    value={formatDate(selectedPatient.birth_date)}
                    icon={Calendar}
                  />
                  <InfoCard
                    label={isBrazilianDoctor ? "Idade" : "Edad"}
                    value={age === null ? "No informada" : age + " años"}
                    icon={Clock}
                  />
                  <InfoCard
                    label={isBrazilianDoctor ? "Gênero" : "Género"}
                    value={gender}
                    icon={UserRound}
                  />
                  <InfoCard
                    label={isBrazilianDoctor ? "Tipo sanguíneo" : "Grupo sanguíneo"}
                    value={displayValue(selectedPatient.blood_type)}
                    icon={Droplets}
                  />
                  <InfoCard
                    label="Altura"
                    value={
                      selectedPatient.height_cm ? selectedPatient.height_cm + " cm" : "No informada"
                    }
                    icon={Ruler}
                  />
                  <InfoCard
                    label="Peso"
                    value={
                      selectedPatient.weight_kg ? selectedPatient.weight_kg + " kg" : "No informado"
                    }
                    icon={Activity}
                  />
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-[#0284C7]" />
                  <h2 className="text-sm font-bold text-[#0F2537]">
                    {isBrazilianDoctor ? "Contato" : "Contacto"}
                  </h2>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <InfoCard label="Email" value={displayValue(profile.email)} icon={Mail} />
                  <InfoCard
                    label={isBrazilianDoctor ? "Telefone" : "Teléfono"}
                    value={displayValue(profile.phone)}
                    icon={Phone}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#0284C7]" />
                  <h2 className="text-sm font-bold text-[#0F2537]">
                    {isBrazilianDoctor ? "Contato de emergência" : "Contacto de emergencia"}
                  </h2>
                </div>
                {emergencyContact ? (
                  <div className="grid gap-2 text-sm sm:grid-cols-3">
                    <p>
                      <span className="block text-[10px] font-semibold uppercase text-slate-400">
                        Nombre
                      </span>
                      <span className="font-semibold text-slate-700">
                        {displayValue(emergencyContact.name)}
                      </span>
                    </p>
                    <p>
                      <span className="block text-[10px] font-semibold uppercase text-slate-400">
                        Vínculo
                      </span>
                      <span className="font-semibold text-slate-700">
                        {displayValue(emergencyContact.relationship)}
                      </span>
                    </p>
                    <p>
                      <span className="block text-[10px] font-semibold uppercase text-slate-400">
                        Teléfono
                      </span>
                      <span className="font-semibold text-slate-700">
                        {displayValue(emergencyContact.phone)}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    {isBrazilianDoctor
                      ? "Nenhum contato de emergência cadastrado."
                      : "No hay contacto de emergencia registrado."}
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-2 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-[#0284C7]" />
                  <h2 className="text-sm font-bold text-[#0F2537]">Cobertura médica</h2>
                </div>
                {insurance &&
                (insurance.provider || insurance.plan_name || insurance.policy_number) ? (
                  <div className="grid gap-2 text-sm sm:grid-cols-3">
                    <p>
                      <span className="block text-[10px] font-semibold uppercase text-slate-400">
                        Prestador
                      </span>
                      <span className="font-semibold text-slate-700">
                        {displayValue(insurance.provider)}
                      </span>
                    </p>
                    <p>
                      <span className="block text-[10px] font-semibold uppercase text-slate-400">
                        Plan
                      </span>
                      <span className="font-semibold text-slate-700">
                        {displayValue(insurance.plan_name)}
                      </span>
                    </p>
                    <p>
                      <span className="block text-[10px] font-semibold uppercase text-slate-400">
                        Número
                      </span>
                      <span className="font-semibold text-slate-700">
                        {displayValue(insurance.policy_number)}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    {isBrazilianDoctor
                      ? "Nenhuma cobertura informada."
                      : "No se informó cobertura."}
                  </p>
                )}
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <ClinicalList
                  title="Antecedentes"
                  items={historyItems}
                  emptyLabel="Sin antecedentes estructurados."
                  icon={HeartPulse}
                />
                <ClinicalList
                  title="Alergias"
                  items={allergyItems}
                  emptyLabel="Sin alergias registradas."
                  icon={AlertTriangle}
                />
                <ClinicalList
                  title={isBrazilianDoctor ? "Medicações" : "Medicación"}
                  items={medicationItems}
                  emptyLabel="Sin medicación registrada."
                  icon={ClipboardList}
                />
              </div>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#0284C7]" />
                    <h2 className="text-sm font-bold text-[#0F2537]">
                      {isBrazilianDoctor ? "Registros clínicos" : "Registros clínicos"}
                    </h2>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {records.length} registros
                  </span>
                </div>
                {historyError && (
                  <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
                    {historyError}
                  </p>
                )}
                {historyLoading && records.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">
                    Cargando historial clínico…
                  </p>
                ) : records.length ? (
                  <div className="space-y-2.5">
                    {records.map((record, index) => {
                      const row = record as unknown as Record<string, unknown>;
                      const title = displayValue(row.title ?? row.type, "Registro clínico");
                      const date = formatDate(
                        row.dateRecorded ??
                          row.createdAt ??
                          row.consultation_date ??
                          row.created_at,
                      );
                      const summary = medicalRecordSummary(row);
                      return (
                        <article
                          key={displayValue(row.id, String(index))}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-bold text-[#0F2537]">{title}</h3>
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                              <Clock className="h-3 w-3" />
                              {date}
                            </span>
                          </div>
                          {summary && (
                            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                              {summary}
                            </p>
                          )}
                        </article>
                      );
                    })}
                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => void loadMore()}
                        disabled={historyLoading}
                        className="mt-2 min-h-10 w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-800 transition hover:bg-blue-100 disabled:opacity-50"
                      >
                        {historyLoading ? "Cargando…" : "Cargar más registros"}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <FileText className="mb-2 h-8 w-8 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">
                      {isBrazilianDoctor
                        ? "Ainda não há registros clínicos."
                        : "Todavía no hay registros clínicos."}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {isBrazilianDoctor
                        ? "Os novos registros aparecerão nesta linha do tempo."
                        : "Los nuevos registros aparecerán en esta línea de tiempo."}
                    </p>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#0284C7]" />
                  <h2 className="text-sm font-bold text-[#0F2537]">Consultas</h2>
                </div>
                {patientAppointments.length ? (
                  <div className="space-y-2">
                    {patientAppointments.map((appointment) => (
                      <div
                        key={appointment.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
                      >
                        <div className="flex items-center gap-2">
                          {appointment.type === "telemedicine" ? (
                            <Video className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Calendar className="h-4 w-4 text-sky-600" />
                          )}
                          <div>
                            <p className="text-xs font-bold text-slate-800">
                              {appointment.type === "telemedicine"
                                ? "Teleconsulta"
                                : "Consulta presencial"}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {formatDate(appointment.start_time)} ·{" "}
                              {new Date(appointment.start_time).toLocaleTimeString(
                                isBrazilianDoctor ? "pt-BR" : "es-AR",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </p>
                          </div>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                          {appointment.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    No hay consultas registradas para este paciente.
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-[#0284C7]" />
                  <h2 className="text-sm font-bold text-[#0F2537]">
                    {isBrazilianDoctor ? "Canal de comunicação" : "Canal de comunicación"}
                  </h2>
                </div>
                <PatientChat
                  patientId={selectedPatientId}
                  doctorId={user?.doctorProfileId || ""}
                  caseId="general_followup"
                  patientName={selectedPatientName}
                />
              </section>
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
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#0284C7]">
            <Users className="h-5 w-5" />
          </div>
          <h2 className="text-base font-bold text-[#0F2537]">Historiales clínicos</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
            Abrí la ficha de un paciente para revisar datos, antecedentes y registros clínicos.
          </p>
          <a
            href="/doctors/patients"
            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0284C7] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#0369A1]"
          >
            Abrir pacientes <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Video className="h-5 w-5" />
          </div>
          <h2 className="text-base font-bold text-[#0F2537]">Teleconsulta</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
            Entrá a una consulta desde la agenda o abrí la sala de llamadas.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="/doctors/agenda"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Ver agenda
            </a>
            <a
              href="/doctors/call/index"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0F2537] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#17364D]"
            >
              Ir a llamadas
            </a>
          </div>
        </section>
      </div>
    </DoctorsPortalFrame>
  );
}
