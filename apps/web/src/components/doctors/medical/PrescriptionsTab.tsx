/**
 * Componente de prescripciones para el portal de médicos
 */

"use client";

import { formatDate } from "@/lib/date-utils";
import { usePrescriptions } from "@/hooks/doctors/usePrescriptions";
import { PrescriptionCreateModal } from "@/components/doctors/medical/PrescriptionCreateModal";
import type { Prescription, PrescriptionStatus, UUID } from "@/types/medical";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Edit3,
  Eye,
  FileSignature,
  Pause,
  Pill,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import type { JSX } from "react";
import { useCallback, useState } from "react";

interface PrescriptionsTabProps {
  patientId: UUID | null;
}

const STATUS_CONFIG: Record<
  PrescriptionStatus,
  {
    label: string;
    icon: React.ElementType;
    color: string;
  }
> = {
  activa: {
    label: "Activa",
    icon: CheckCircle,
    color: "bg-green-50 text-green-700 border-green-200",
  },
  completada: {
    label: "Completada",
    icon: CheckCircle,
    color: "bg-am-doctor-50 text-am-doctor-700 border-am-doctor-200",
  },
  cancelada: {
    label: "Cancelada",
    icon: XCircle,
    color: "bg-red-50 text-red-700 border-red-200",
  },
  pausada: {
    label: "Pausada",
    icon: Pause,
    color: "bg-yellow-50 text-yellow-700 border-yellow-200",
  },
};

export function PrescriptionsTab({ patientId }: PrescriptionsTabProps): JSX.Element {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<PrescriptionStatus | "">("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState<Prescription | null>(null);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issueSuccess, setIssueSuccess] = useState<string | null>(null);

  const handleIssuePrescription = useCallback(async (prescriptionId: string) => {
    setIssuingId(prescriptionId);
    setIssueError(null);
    setIssueSuccess(null);
    try {
      const res = await fetch(`/api/doctors/prescriptions/${prescriptionId}/issue`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Error al emitir receta' }));
        setIssueError(body.error ?? body.message ?? 'Error al emitir receta');
        return;
      }
      const result = await res.json();
      setIssueSuccess(`Receta emitida: CUIR ${result.cuir}`);
      window.dispatchEvent(new CustomEvent('medical-prescriptions:changed'));
    } catch {
      setIssueError('Error de red al emitir receta');
    } finally {
      setIssuingId(null);
    }
  }, []);

  const canIssue = (p: Prescription) =>
    !p.cuir && p.source === 'prescriptions_core' && p.status === 'activa';

  const { prescriptions, loading, error, addPrescription, updatePrescription } = usePrescriptions(
    patientId,
    {
      filters: {
        medication_name: searchTerm || undefined,
        status: selectedStatus || undefined,
        active_only: showActiveOnly,
      },
    },
  );

  const getDaysRemaining = (endDate: string | null): number | null => {
    if (!endDate) return null;

    const end = new Date(endDate);
    const today = new Date();
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  };

  const isExpiringSoon = (endDate: string | null): boolean => {
    const daysRemaining = getDaysRemaining(endDate);
    return daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0;
  };

  if (loading && prescriptions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-am-doctor-600 border-t-transparent mx-auto"></div>
          <p className="text-am-surface-500">Cargando prescripciones...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-am-surface-800 mb-2">
            Error al cargar prescripciones
          </h3>
          <p className="text-am-surface-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!patientId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Pill className="h-16 w-16 text-am-surface-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-am-surface-800 mb-2">
            Sin paciente seleccionado
          </h3>
          <p className="text-am-surface-500">Selecciona un paciente para ver sus prescripciones</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-am-surface-50">
      {/* Header con controles */}
      <div className="border-b border-am-surface-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-am-surface-900">Prescripciones</h1>
            <p className="text-sm text-am-surface-500">
              {prescriptions.length} prescripción{prescriptions.length !== 1 ? "es" : ""} encontrada
              {prescriptions.length !== 1 ? "s" : ""}
            </p>
          </div>

          <button
            onClick={() => {
              setEditingPrescription(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 rounded-lg border border-am-doctor-600 bg-am-doctor-600 px-4 py-2 text-sm font-medium text-white hover:bg-am-doctor-700 transition"
          >
            <Plus className="h-4 w-4" />
            Nueva Prescripción
          </button>
        </div>

        {/* Filtros */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-am-surface-400" />
            <input
              type="text"
              placeholder="Buscar medicamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-am-surface-200 bg-white pl-10 pr-4 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
            />
          </div>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as PrescriptionStatus | "")}
            className="rounded-lg border border-am-surface-200 bg-white px-3 py-2 text-sm text-am-surface-900 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <option key={status} value={status}>
                {config.label}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-am-surface-700">
            <input
              type="checkbox"
              checked={showActiveOnly}
              onChange={(e) => setShowActiveOnly(e.target.checked)}
              className="rounded border-am-surface-300 bg-white text-am-doctor-600 focus:ring-am-doctor-500"
            />
            Solo activas
          </label>
        </div>
      </div>

      {/* Feedback de emisión */}
      {issueSuccess && (
        <div className="mx-6 mt-4 rounded-lg border border-green-200 bg-green-50 p-3 flex items-center justify-between">
          <p className="text-sm text-green-800 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            {issueSuccess}
          </p>
          <button onClick={() => setIssueSuccess(null)} className="text-green-600 hover:text-green-800">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}
      {issueError && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 flex items-center justify-between">
          <p className="text-sm text-red-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {issueError}
          </p>
          <button onClick={() => setIssueError(null)} className="text-red-600 hover:text-red-800">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Lista de prescripciones */}
      <div className="flex-1 overflow-y-auto p-6">
        {prescriptions.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Pill className="h-16 w-16 text-am-surface-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-am-surface-800 mb-2">Sin prescripciones</h3>
              <p className="text-am-surface-500 mb-4">
                {searchTerm || selectedStatus || showActiveOnly
                  ? "No se encontraron prescripciones con los filtros aplicados"
                  : "Este paciente aún no tiene prescripciones"}
              </p>
              <button
                onClick={() => {
                  setEditingPrescription(null);
                  setShowModal(true);
                }}
                className="flex items-center gap-2 rounded-lg bg-am-doctor-600 px-4 py-2 text-sm font-medium text-white hover:bg-am-doctor-700 transition mx-auto"
              >
                <Plus className="h-4 w-4" />
                Crear Primera Prescripción
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {prescriptions.map((prescription) => {
              const statusConfig = STATUS_CONFIG[prescription.status];
              const StatusIcon = statusConfig.icon;
              const daysRemaining = getDaysRemaining(prescription.end_date);
              const expiringSoon = isExpiringSoon(prescription.end_date);

              return (
                <div
                  key={prescription.id}
                  className={`rounded-2xl border border-am-surface-200 bg-white p-4 shadow-am-sm ${
                    expiringSoon ? "ring-2 ring-orange-400/50" : ""
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Pill className="h-5 w-5 text-am-doctor-600" />
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium border ${statusConfig.color}`}
                      >
                        <StatusIcon className="inline h-3 w-3 mr-1" />
                        {statusConfig.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {canIssue(prescription) && (
                        <button
                          onClick={() => handleIssuePrescription(prescription.id)}
                          disabled={issuingId === prescription.id}
                          title="Emitir receta digital"
                          className="rounded-lg border border-am-doctor-300 bg-am-doctor-50 p-1.5 text-am-doctor-700 hover:bg-am-doctor-100 transition disabled:opacity-50"
                        >
                          {issuingId === prescription.id ? (
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-am-doctor-600 border-t-transparent" />
                          ) : (
                            <FileSignature className="h-3 w-3" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingPrescription(prescription);
                          setShowModal(true);
                        }}
                        title="Editar"
                        className="rounded-lg border border-am-surface-200 bg-white p-1.5 text-am-surface-500 hover:bg-am-surface-100 transition"
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingPrescription(prescription);
                          setShowModal(true);
                        }}
                        title="Ver detalle"
                        className="rounded-lg border border-am-surface-200 bg-white p-1.5 text-am-surface-500 hover:bg-am-surface-100 transition"
                      >
                        <Eye className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Medicamento */}
                  <div className="mb-3">
                    <h3 className="text-lg font-semibold text-am-surface-900 mb-1">
                      {prescription.medication_name}
                    </h3>
                    <p className="text-sm text-am-surface-500">{prescription.dosage}</p>
                    {prescription.source === "prescriptions_core" && (
                      <p className="mt-1 text-xs text-am-surface-500">
                        {prescription.is_digital_artifact_ready
                          ? `Receta electronica con soporte verificable${prescription.cuir ? ` · CUIR ${prescription.cuir}` : ""}`
                          : "Borrador clinico sin soporte electronico verificable"}
                      </p>
                    )}
                  </div>

                  {/* Frecuencia y duración */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-am-surface-400" />
                      <span className="text-am-surface-700">{prescription.frequency}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-am-surface-400" />
                      <span className="text-am-surface-700">{prescription.duration}</span>
                    </div>
                  </div>

                  {/* Fechas */}
                  <div className="border-t border-am-surface-200 pt-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-am-surface-500">Inicio</p>
                        <p className="text-am-surface-700">{formatDate(prescription.start_date)}</p>
                      </div>
                      <div>
                        <p className="text-am-surface-500">Fin</p>
                        <p className="text-am-surface-700">
                          {prescription.end_date ? formatDate(prescription.end_date) : "Indefinido"}
                        </p>
                      </div>
                    </div>

                    {daysRemaining !== null && (
                      <div className="mt-2">
                        {daysRemaining > 0 ? (
                          <p
                            className={`text-xs ${expiringSoon ? "text-orange-700" : "text-am-surface-500"}`}
                          >
                            {expiringSoon && <AlertTriangle className="inline h-3 w-3 mr-1" />}
                            {daysRemaining} día{daysRemaining !== 1 ? "s" : ""} restante
                            {daysRemaining !== 1 ? "s" : ""}
                          </p>
                        ) : daysRemaining === 0 ? (
                          <p className="text-xs text-orange-700">
                            <AlertTriangle className="inline h-3 w-3 mr-1" />
                            Expira hoy
                          </p>
                        ) : (
                          <p className="text-xs text-red-600">
                            Expiró hace {Math.abs(daysRemaining)} día
                            {Math.abs(daysRemaining) !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Instrucciones */}
                  {prescription.instructions && (
                    <div className="mt-3 pt-3 border-t border-am-surface-200">
                      <p className="text-xs text-am-surface-500">Instrucciones:</p>
                      <p className="text-xs text-am-surface-700 mt-1 leading-relaxed">
                        {prescription.instructions}
                      </p>
                    </div>
                  )}

                  {/* Advertencias */}
                  {prescription.side_effects_warning && (
                    <div className="mt-2 rounded-lg bg-yellow-50 border border-yellow-200 p-2">
                      <p className="text-xs text-yellow-700 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        {prescription.side_effects_warning}
                      </p>
                    </div>
                  )}

                  {prescription.artifact_warning && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                      <p className="flex items-start gap-1 text-xs text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                        {prescription.artifact_warning}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && patientId && (
        <PrescriptionCreateModal
          patientId={patientId}
          onClose={() => {
            setShowModal(false);
            setEditingPrescription(null);
          }}
          onSaved={() => {
            setShowModal(false);
            setEditingPrescription(null);
          }}
          addPrescription={addPrescription}
          updatePrescription={updatePrescription}
          editingPrescription={editingPrescription}
        />
      )}
    </div>
  );
}
