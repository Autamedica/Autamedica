"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  Loader2,
  Plus,
  Search,
  User,
  XCircle,
} from "lucide-react";
import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import { MedicalOrderCreateModal } from "@/components/doctors/medical/MedicalOrderCreateModal";
import { useRealPatients } from "@/hooks/doctors/useRealPatients";
import { medicalOrderService } from "@/lib/doctors/services/medical-order.service";
import type { MedicalOrder, MedicalOrderStatus, UUID } from "@/types/medical";
import type { PatientWithProfile } from "@autamedica/types";

const STATUS_CONFIG: Record<MedicalOrderStatus, { label: string; className: string; icon: typeof FileText }> = {
  draft: { label: "Borrador", className: "border-amber-200 bg-amber-50 text-amber-700", icon: FileText },
  signed: { label: "Emitida", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  cancelled: { label: "Cancelada", className: "border-red-200 bg-red-50 text-red-700", icon: XCircle },
  expired: { label: "Vencida", className: "border-neutral-200 bg-neutral-50 text-neutral-500", icon: Clock },
};

const STUDY_TYPE_LABELS: Record<MedicalOrder["study_type"], string> = {
  laboratory: "Laboratorio",
  imaging: "Imágenes",
  cardiology: "Cardiología",
  other: "Otro",
};

function compactPatientId(id: string | null | undefined): string {
  return id ? id.slice(0, 8).toUpperCase() : "SIN-ID";
}

function getPatientDisplayName(patient: PatientWithProfile): string {
  const fullName = [patient.profile?.first_name, patient.profile?.last_name]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");

  if (fullName) return fullName;
  if (patient.profile?.email) return patient.profile.email;
  if (patient.profile?.phone) return patient.profile.phone;
  if (patient.dni) return `DNI ${patient.dni}`;
  return `Paciente ${compactPatientId(patient.id)}`;
}

function getPatientSecondaryLabel(patient: PatientWithProfile): string {
  if (patient.dni) return `DNI ${patient.dni}`;
  if (patient.profile?.phone && patient.profile?.email) return patient.profile.phone;
  if (patient.profile?.external_id) return patient.profile.external_id;
  return `ID ${compactPatientId(patient.id)}`;
}

function matchesPatientSearch(patient: PatientWithProfile, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    getPatientDisplayName(patient),
    getPatientSecondaryLabel(patient),
    patient.profile?.first_name,
    patient.profile?.last_name,
    patient.profile?.email,
    patient.profile?.phone,
    patient.profile?.external_id,
    patient.dni,
    patient.user_id,
    patient.id,
  ]
    .map((value) => value?.trim().toLowerCase() ?? "")
    .join(" ")
    .includes(normalizedQuery);
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusBadge(status: MedicalOrderStatus) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${config.className}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

export function DoctorsMedicalOrdersPage() {
  const { patients, loading: patientsLoading } = useRealPatients();
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [orders, setOrders] = useState<MedicalOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredPatients = useMemo(
    () => patients.filter((patient) => matchesPatientSearch(patient, patientSearch)),
    [patients, patientSearch],
  );

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  );

  const refreshOrders = useCallback(async () => {
    if (!selectedPatientId) {
      setOrders([]);
      return;
    }

    setOrdersLoading(true);
    setOrdersError(null);
    try {
      setOrders(await medicalOrderService.getByPatient(selectedPatientId));
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : "No se pudieron cargar las solicitudes.");
    } finally {
      setOrdersLoading(false);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  const handleSaved = useCallback(() => {
    setShowCreateModal(false);
    void refreshOrders();
  }, [refreshOrders]);

  const addMedicalOrder = async (
    order: Omit<MedicalOrder, "id" | "created_at" | "updated_at" | "patient_id"> & { patient_id?: UUID },
  ) => {
    const patientId = order.patient_id ?? selectedPatientId;
    if (!patientId) throw new Error("Seleccioná un paciente antes de crear la solicitud.");

    return medicalOrderService.create(
      patientId,
      order as Omit<MedicalOrder, "id" | "created_at" | "updated_at">,
    );
  };

  return (
    <DoctorsPortalFrame
      title="Exámenes y estudios"
      description="Solicitudes de laboratorio, imágenes, cardiología y otros estudios complementarios."
      activeSection="medical-orders"
      hideDefaultHeader
      hideRightSidebar
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Exámenes y estudios</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {selectedPatient
                ? `Solicitudes para ${getPatientDisplayName(selectedPatient)}`
                : "Seleccioná un paciente para crear o revisar solicitudes de estudios."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            disabled={!selectedPatientId}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Nueva solicitud
          </button>
        </div>

        <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
          <label className="mb-3 block text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Seleccionar paciente
          </label>
          {patientsLoading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando pacientes...
            </div>
          ) : (
            <>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(event) => setPatientSearch(event.target.value)}
                  placeholder="Buscar por nombre, apellido o DNI..."
                  className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-10 pr-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
              <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                {filteredPatients.slice(0, 50).map((patient) => {
                  const isSelected = selectedPatientId === patient.id;
                  return (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => setSelectedPatientId(isSelected ? null : patient.id)}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                        isSelected
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      <User className="h-3.5 w-3.5" />
                      <span className="max-w-[220px] truncate">{getPatientDisplayName(patient)}</span>
                      <span className="text-[10px] opacity-60">{getPatientSecondaryLabel(patient)}</span>
                    </button>
                  );
                })}
                {filteredPatients.length === 0 && (
                  <p className="text-sm text-neutral-400">No se encontraron pacientes.</p>
                )}
              </div>
            </>
          )}
        </div>

        {!selectedPatientId ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-20 text-center">
            <ClipboardList className="mb-4 h-12 w-12 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-600">Seleccioná un paciente</p>
            <p className="mt-1 text-sm text-neutral-400">
              Las solicitudes de estudios se emiten asociadas a un paciente de la plataforma.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {ordersLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
              </div>
            )}

            {ordersError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {ordersError}
              </div>
            )}

            {!ordersLoading && !ordersError && orders.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-16 text-center">
                <ClipboardList className="mb-4 h-12 w-12 text-neutral-300" />
                <p className="text-lg font-medium text-neutral-600">Sin solicitudes cargadas</p>
                <p className="mt-1 text-sm text-neutral-400">Creá la primera orden de estudios para este paciente.</p>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
                >
                  <Plus className="h-4 w-4" />
                  Nueva solicitud
                </button>
              </div>
            )}

            {!ordersLoading && orders.map((order) => (
              <div
                key={order.id}
                className="rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 hover:shadow-sm sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-neutral-900">
                        {STUDY_TYPE_LABELS[order.study_type]}
                      </h3>
                      {getStatusBadge(order.status)}
                    </div>
                    <p className="text-sm text-neutral-700">
                      {order.practices.map((practice) => practice.name).join(", ")}
                    </p>
                    {order.diagnosis && (
                      <p className="mt-1 text-sm text-neutral-500">
                        <span className="font-medium">Dx:</span> {order.diagnosis}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                      <Clock className="h-3 w-3" />
                      <span>{formatDateTime(order.created_at)}</span>
                      {order.cuir && <span className="font-mono text-[10px] text-blue-500">{order.cuir}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.status === "draft" ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await medicalOrderService.issue(order.id);
                          await refreshOrders();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100"
                      >
                        Emitir
                      </button>
                    ) : null}
                    {order.signed_pdf_url ? (
                      <a
                        href={order.signed_pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Ver PDF
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && selectedPatientId && (
        <MedicalOrderCreateModal
          patientId={selectedPatientId as UUID}
          onClose={() => setShowCreateModal(false)}
          onSaved={handleSaved}
          addMedicalOrder={addMedicalOrder}
          updateMedicalOrder={async (id, updates) => {
            const current = orders.find((order) => order.id === id);
            if (!current) throw new Error("No se encontró la solicitud a actualizar.");
            await medicalOrderService.update(id, current, updates);
          }}
          issueMedicalOrder={async (id) => {
            await medicalOrderService.issue(id);
          }}
          submitLabel="Emitir solicitud"
        />
      )}
    </DoctorsPortalFrame>
  );
}
