"use client";

import { useState, useMemo, useCallback } from "react";
import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import { PrescriptionCreateModal } from "@/components/doctors/medical/PrescriptionCreateModal";
import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { useRealPatients } from "@/hooks/doctors/useRealPatients";
import { usePrescriptions } from "@/hooks/doctors/usePrescriptions";
import { getDisplayName } from "@/lib/doctors/lib/utils";
import { Pill, Plus, Search, Clock, AlertCircle, CheckCircle2, FileText, User } from "lucide-react";
import type { Prescription, UUID } from "@/types/medical";

type ViewMode = "list" | "create";

const STATUS_MAP: Record<Prescription["status"], { label: string; class: string; icon: typeof CheckCircle2 }> = {
  activa: { label: "Activa", class: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 },
  pausada: { label: "Pausada", class: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertCircle },
  completada: { label: "Completada", class: "bg-neutral-50 text-neutral-600 border-neutral-200", icon: CheckCircle2 },
  cancelada: { label: "Cancelada", class: "bg-red-50 text-red-600 border-red-200", icon: AlertCircle },
};

export function DoctorsPrescriptionsPage() {
  const { user } = useAuthenticatedUser();
  const { patients } = useRealPatients();
  const [selectedPatientId, setSelectedPatientId] = useState<UUID | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingPrescription, setEditingPrescription] = useState<Prescription | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Prescription["status"] | "todas">("todas");

  const patientId = (selectedPatientId ?? "") as UUID;
  const { prescriptions, loading, error, addPrescription, updatePrescription } = usePrescriptions(patientId);

  const selectedPatient = useMemo(() => {
    if (!selectedPatientId) return null;
    return patients.find((p) => p.id === selectedPatientId) ?? null;
  }, [patients, selectedPatientId]);

  const filteredPrescriptions = useMemo(() => {
    let list = prescriptions;
    if (statusFilter !== "todas") {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.medication_name.toLowerCase().includes(q) ||
          (p.diagnosis ?? "").toLowerCase().includes(q) ||
          (p.dosage ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [prescriptions, statusFilter, searchQuery]);

  const handleCreateForPatient = useCallback((patientId: UUID) => {
    setSelectedPatientId(patientId);
    setEditingPrescription(null);
    setViewMode("create");
  }, []);

  const handleEdit = useCallback((p: Prescription) => {
    setEditingPrescription(p);
    setViewMode("create");
  }, []);

  const handleSaved = useCallback(() => {
    setViewMode("list");
    setEditingPrescription(null);
  }, []);

  const patientName = selectedPatient
    ? getDisplayName(selectedPatient.profile).name
    : "Paciente";

  return (
    <DoctorsPortalFrame
      title="Recetas"
      description="Gestión de prescripciones médicas"
      activeSection="prescriptions"
    >
      {viewMode === "create" && selectedPatientId ? (
        <div className="space-y-4">
          <button
            onClick={() => { setViewMode("list"); setEditingPrescription(null); }}
            className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            ← Volver a recetas
          </button>
          <PrescriptionCreateModal
            patientId={selectedPatientId}
            onClose={() => { setViewMode("list"); setEditingPrescription(null); }}
            onSaved={handleSaved}
            addPrescription={addPrescription}
            updatePrescription={updatePrescription}
            editingPrescription={editingPrescription}
            submitLabel={editingPrescription ? "Actualizar receta" : "Emitir receta"}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-light tracking-tight text-neutral-900">Recetas médicas</h2>
              <p className="mt-1 text-[13px] text-neutral-500">
                Seleccioná un paciente para crear o gestionar sus prescripciones.
              </p>
            </div>
          </div>

          {/* Búsqueda y filtros */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar medicamento o diagnóstico..."
                className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as Prescription["status"] | "todas")}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-700 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            >
              <option value="todas">Todos los estados</option>
              <option value="activa">Activas</option>
              <option value="pausada">Pausadas</option>
              <option value="completada">Completadas</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>

          {/* Lista de pacientes + recetas */}
          {selectedPatientId && selectedPatient ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100">
                    <User className="h-5 w-5 text-neutral-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{patientName}</p>
                    <p className="text-xs text-neutral-500">
                      {filteredPrescriptions.length} receta{filteredPrescriptions.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedPatientId(null)}
                    className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50"
                  >
                    Cambiar paciente
                  </button>
                  <button
                    onClick={() => handleCreateForPatient(selectedPatientId)}
                    className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-neutral-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nueva receta
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-neutral-400">Cargando recetas...</p>
                </div>
              ) : error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                  {error}
                </div>
              ) : filteredPrescriptions.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-12">
                  <FileText className="mb-3 h-10 w-10 text-neutral-300" />
                  <p className="text-sm font-medium text-neutral-500">Sin recetas</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {statusFilter !== "todas" ? "No hay recetas con este filtro." : "Creá la primera receta para este paciente."}
                  </p>
                  {statusFilter === "todas" && (
                    <button
                      onClick={() => handleCreateForPatient(selectedPatientId)}
                      className="mt-4 flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-800"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Nueva receta
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredPrescriptions.map((prescription) => {
                    const status = STATUS_MAP[prescription.status] ?? STATUS_MAP.activa;
                    const StatusIcon = status.icon;
                    return (
                      <div
                        key={prescription.id}
                        className="group flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                            <Pill className="h-5 w-5 text-amber-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-neutral-900">
                              {prescription.medication_name}
                            </p>
                            {prescription.dosage && (
                              <p className="text-xs text-neutral-500">{prescription.dosage} — {prescription.frequency}</p>
                            )}
                            {prescription.diagnosis && (
                              <p className="mt-1 text-xs text-neutral-400">Diagnóstico: {prescription.diagnosis}</p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.class}`}>
                                <StatusIcon className="h-3 w-3" />
                                {status.label}
                              </span>
                              <span className="text-[10px] text-neutral-400">
                                <Clock className="mr-0.5 inline h-3 w-3" />
                                {new Date(prescription.prescribed_date).toLocaleDateString("es-AR")}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleEdit(prescription)}
                          className="self-end rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50 sm:self-center"
                        >
                          Editar
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Selección de paciente */
            <div className="space-y-2">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Seleccioná un paciente</p>
              {patients.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-200 py-8 text-center">
                  <User className="mx-auto mb-2 h-8 w-8 text-neutral-300" />
                  <p className="text-sm text-neutral-500">No hay pacientes registrados</p>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {patients.map((patient) => {
                    const name = getDisplayName(patient.profile).name;
                    return (
                      <button
                        key={patient.id}
                        onClick={() => setSelectedPatientId(patient.id as UUID)}
                        className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-neutral-900 hover:shadow-sm"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100">
                          <User className="h-5 w-5 text-neutral-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-neutral-900">{name}</p>
                          <p className="text-xs text-neutral-400">Ver recetas</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </DoctorsPortalFrame>
  );
}
