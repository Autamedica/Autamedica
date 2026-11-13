"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Pill,
  Clock,
  Printer,
  Eye,
  User,
  Loader2,
  X,
  AlertCircle,
  CheckCircle2,
  FileText,
  ClipboardList,
  AlertTriangle,
  Download,
  Shield,
  FileCheck,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import { PrescriptionCreateModal } from "@/components/doctors/medical/PrescriptionCreateModal";
import { CertificateCreateModal, type CreatedCertificate } from "@/components/doctors/medical/CertificateCreateModal";
import { MemedPrescriptionWidget } from "@/components/doctors/medical/MemedPrescriptionWidget";
import { useRealPatients } from "@/hooks/doctors/useRealPatients";
import { usePrescriptionsCore } from "@/hooks/doctors/usePrescriptionsCore";
import type { IssuedPrescription } from "@autamedica/prescriptions";
import type { UUID } from "@/types/medical";
import type { PatientWithProfile } from "@autamedica/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  color: string;
  icon: typeof CheckCircle2;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  draft: { label: "Borrador", color: "text-amber-600 border-amber-200 bg-amber-50", icon: FileText },
  sent: { label: "Emitida", color: "text-blue-600 border-blue-200 bg-blue-50", icon: CheckCircle2 },
  pending_dispensation: { label: "Pendiente", color: "text-purple-600 border-purple-200 bg-purple-50", icon: Clock },
  assigned: { label: "Asignada", color: "text-sky-600 border-sky-200 bg-sky-50", icon: CheckCircle2 },
  dispensed_partial: { label: "Parcial", color: "text-orange-600 border-orange-200 bg-orange-50", icon: AlertTriangle },
  dispensed_total: { label: "Dispensada", color: "text-green-600 border-green-200 bg-green-50", icon: CheckCircle2 },
  cancelled: { label: "Cancelada", color: "text-red-600 border-red-200 bg-red-50", icon: X },
  expired: { label: "Vencida", color: "text-gray-500 border-gray-200 bg-gray-50", icon: Clock },
};

type TabType = "all" | "draft" | "active" | "dispensed" | "cancelled";

interface PrescriptionDraftForm {
  medication_name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  diagnosis?: string | null;
  notes?: string | null;
  status?: string;
  start_date?: string;
  end_date?: string | null;
  external_patient?: {
    name: string;
    dni?: string;
    cuil?: string;
    address?: string;
    email?: string;
    phone?: string;
    birth_date?: string;
    gender?: string;
  };
}

interface PrescriptionDisplayData {
  medicationName: string;
  dosage: string;
  diagnosis: string;
  notes: string;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusBadge(status: string | undefined) {
  const s = status ?? "draft";
  const config = STATUS_CONFIG[s] ?? STATUS_CONFIG.draft;
  const IconComponent = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${config.color}`}>
      <IconComponent className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function mapCoreToDisplay(rx: IssuedPrescription): PrescriptionDisplayData {
  const clinical: Record<string, unknown> = (rx as unknown as Record<string, unknown>).clinical_data as Record<string, unknown> ?? {};
  const items = (clinical.items as Array<Record<string, unknown>>) ?? [];
  const medicationName = String(items[0]?.generic_name ?? clinical.medication_name ?? "Prescripción");
  const dosage = String(items[0]?.dosage ?? clinical.dosage ?? "");
  const diagnosis = String(clinical.diagnosis ?? "");
  const notes = String(clinical.notes ?? "");
  return { medicationName, dosage, diagnosis, notes };
}

function normalizeSearch(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

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
  const haystack = [
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
    .map(normalizeSearch)
    .filter(Boolean)
    .join(" ");

  return haystack.includes(query);
}

function getSignedPdfUrl(rx: IssuedPrescription): string | undefined {
  const direct = (rx as unknown as Record<string, unknown>).signed_pdf_url;
  if (typeof direct === "string" && direct.trim().length > 0) return direct;
  const fromArtifacts = rx.artifacts?.signedPdfUrl;
  if (typeof fromArtifacts === "string" && fromArtifacts.trim().length > 0) return fromArtifacts;
  return undefined;
}

function getPrescriptionViewUrl(rx: IssuedPrescription): string | undefined {
  const signedPdfUrl = getSignedPdfUrl(rx);
  if (signedPdfUrl) return signedPdfUrl;

  const cuir = getCuir(rx);
  return cuir ? `/verify/${encodeURIComponent(cuir)}` : undefined;
}

function printPrescriptionArtifact(rx: IssuedPrescription): boolean {
  const url = getPrescriptionViewUrl(rx);
  if (!url) return false;

  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) return false;

  popup.addEventListener("load", () => {
    popup.focus();
    popup.print();
  }, { once: true });

  return true;
}

type CertificateItem = CreatedCertificate & {
  patientName?: string;
  patientDni?: string;
  signed_pdf_url?: string | null;
};

const CERT_TYPE_LABELS: Record<string, string> = {
  reposo_laboral: "Reposo Laboral",
  reposo_escolar: "Reposo Escolar",
  aptitud_fisica: "Aptitud Física",
  constancia_atencion: "Constancia de Atención",
  tratamiento: "Tratamiento Prolongado",
  otro: "Atestado Médico",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function DoctorsPrescriptionsPage() {
  // Patient selection
  const { patients, loading: patientsLoading } = useRealPatients();
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState("");

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients;
    const q = patientSearch.trim().toLowerCase();
    return patients.filter((p) => matchesPatientSearch(p, q));
  }, [patients, patientSearch]);

  // Prescriptions for selected patient
  const {
    prescriptions,
    loading: rxLoading,
    error: rxError,
    refresh,
    createDraft,
    updatePrescription,
    issuePrescription,
  } = usePrescriptionsCore(selectedPatientId);

  // UI state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [showMemedWidget, setShowMemedWidget] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState<IssuedPrescription | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<IssuedPrescription | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [search, setSearch] = useState("");
  const [docMode, setDocMode] = useState<"prescriptions" | "certificates">("prescriptions");
  const [certificateCountry, setCertificateCountry] = useState<"AR" | "BR" | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/doctors/certificates?context=country", {
      credentials: "include", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("certificate_country_lookup_failed");
      const body: { data?: { countryCode?: string } } = await response.json();
      if (!controller.signal.aborted) {
        setCertificateCountry(body.data?.countryCode === "BR" ? "BR"
          : body.data?.countryCode === "AR" ? "AR" : null);
      }
    }).catch(() => { if (!controller.signal.aborted) setCertificateCountry(null); });
    return () => controller.abort();
  }, []);
  const [certificates, setCertificates] = useState<CertificateItem[]>([]);
  const [certLoading, setCertLoading] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);
  const [firmarAvailable, setFirmarAvailable] = useState(false);
  const [firmarBusyId, setFirmarBusyId] = useState<string | null>(null);
  const [firmarError, setFirmarError] = useState<string | null>(null);

  const fetchCertificates = useCallback(async () => {
    if (!selectedPatientId) {
      setCertificates([]);
      return;
    }
    setCertLoading(true);
    setCertError(null);
    try {
      const res = await fetch(`/api/doctors/certificates?patientId=${encodeURIComponent(selectedPatientId)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setCertificates(json.data);
      }
    } catch {
      setCertError("No se pudieron cargar los atestados médicos.");
    } finally {
      setCertLoading(false);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    if (selectedPatientId) {
      void fetchCertificates();
    } else {
      setCertificates([]);
    }
  }, [selectedPatientId, fetchCertificates]);

  // FirmAR is hidden until the server reports BOTH release gates enabled.
  useEffect(() => {
    const draft = docMode === "certificates" ? certificates.find(cert => cert.status === "draft") : undefined;
    if (!draft) {
      setFirmarAvailable(false);
      return;
    }
    const controller = new AbortController();
    setFirmarAvailable(false);
    void fetch(`/api/doctors/certificates/${encodeURIComponent(draft.id)}/firmar`, {
      credentials: "include",
      signal: controller.signal,
    }).then(async res => {
      if (!res.ok) return;
      const json: { success?: boolean; data?: { integrationEnabled?: boolean } } = await res.json();
      if (!controller.signal.aborted) setFirmarAvailable(json.success === true && json.data?.integrationEnabled === true);
    }).catch(() => {
      if (!controller.signal.aborted) setFirmarAvailable(false);
    });
    return () => controller.abort();
  }, [certificates, docMode]);

  const startFirmarSignature = async (certificateId: string): Promise<void> => {
    if (!firmarAvailable || firmarBusyId) return;
    setFirmarBusyId(certificateId);
    setFirmarError(null);
    try {
      const response = await fetch(`/api/doctors/certificates/${encodeURIComponent(certificateId)}/firmar`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("No se pudo iniciar la firma digital.");
      const json: { success?: boolean; data?: { status?: string; authorizationUrl?: string } } = await response.json();
      if (json.success !== true || json.data?.status !== "awaiting_doctor_authorization") {
        throw new Error("La solicitud no fue autorizada.");
      }
      const url = new URL(json.data.authorizationUrl ?? "");
      if (url.protocol !== "https:" || !["firmar.gob.ar", "tst.firmar.gob.ar"].includes(url.hostname)) {
        throw new Error("Destino de firma no autorizado.");
      }
      window.location.assign(url.href);
    } catch (error) {
      setFirmarError(error instanceof Error ? error.message : "Error al iniciar la firma");
    } finally {
      setFirmarBusyId(null);
    }
  };

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId),
    [patients, selectedPatientId]
  );

  // ─── Derived data ────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = prescriptions.length;
    const drafts = prescriptions.filter((rx) => !isCuirPresent(rx)).length;
    const active = prescriptions.filter((rx) => isActive(rx)).length;
    const dispensed = prescriptions.filter((rx) => isDispensed(rx)).length;
    const expired = prescriptions.filter((rx) => isCancelledOrExpired(rx)).length;
    return { total, drafts, active, dispensed, expired };
  }, [prescriptions]);

  const filteredPrescriptions = useMemo(() => {
    let list = prescriptions;

    if (activeTab === "draft") list = list.filter((rx) => !isCuirPresent(rx));
    else if (activeTab === "active") list = list.filter((rx) => isActive(rx));
    else if (activeTab === "dispensed") list = list.filter((rx) => isDispensed(rx));
    else if (activeTab === "cancelled") list = list.filter((rx) => isCancelledOrExpired(rx));

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((rx) => {
        const { medicationName, diagnosis } = mapCoreToDisplay(rx);
        const cuir = getCuir(rx);
        return medicationName.toLowerCase().includes(q) || diagnosis.toLowerCase().includes(q) || (cuir?.toLowerCase().includes(q));
      });
    }

    return list;
  }, [prescriptions, activeTab, search]);

  const viewPrescription = (rx: IssuedPrescription): void => {
    const url = getPrescriptionViewUrl(rx);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    setSelectedPrescription(rx);
    setShowDetailPanel(true);
  };

  const inspectPrescription = (rx: IssuedPrescription): void => {
    setSelectedPrescription(rx);
    setShowDetailPanel(true);
  };

  const printPrescription = (rx: IssuedPrescription): void => {
    if (!printPrescriptionArtifact(rx)) {
      inspectPrescription(rx);
    }
  };

  const handleSaved = (): void => {
    refresh();
    setEditingPrescription(null);
  };

  const handleCreateDraft = async (
    p: PrescriptionDraftForm,
  ): Promise<{ id: string }> => {
    const id = await createDraft({
      patient_id: selectedPatientId ?? undefined,
      external_patient: p.external_patient,
      medication_name: p.medication_name,
      dosage: p.dosage,
      frequency: p.frequency,
      duration: p.duration,
      instructions: p.instructions,
      diagnosis: p.diagnosis,
      notes: p.notes,
      status: p.status,
      start_date: p.start_date,
      end_date: p.end_date,
    });
    return { id, ...p };
  };

  return (
    <DoctorsPortalFrame
      title="Recetas Médicas"
      description="Gestión completa de recetas y prescripciones médicas"
      activeSection="consultations"
      hideDefaultHeader
      hideRightSidebar
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Recetas Médicas</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {selectedPatientId
                ? "Administrá las prescripciones del paciente seleccionado"
                : "Creá una receta para un paciente de la plataforma o cargá sus datos manualmente"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setEditingPrescription(null); setShowMemedWidget(true); }}
              disabled={!selectedPatientId}
              title={selectedPatientId ? "Abrir Memed" : "Selecione um paciente"}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Receita BR (Memed)
            </button>
            <button
              onClick={() => { setEditingPrescription(null); setShowCreateModal(true); }}
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-neutral-800 active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" />
              Nueva receta
            </button>
            <button
              onClick={() => setShowCertificateModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-teal-700 active:scale-[0.97]"
            >
              <FileText className="h-4 w-4" />
              Preparar atestado
            </button>
          </div>
        </motion.div>

        {/* ── Patient Selector ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-xl border border-neutral-200 bg-white p-4"
        >
          <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
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
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="Buscar por nombre, apellido o DNI..."
                  className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-10 pr-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {filteredPatients.slice(0, 50).map((p) => {
                  const name = getPatientDisplayName(p);
                  const secondaryLabel = getPatientSecondaryLabel(p);
                  const isSelected = selectedPatientId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPatientId(isSelected ? null : p.id)}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                        isSelected
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      <User className="h-3.5 w-3.5" />
                      <span className="max-w-[220px] truncate">{name}</span>
                      <span className="text-[10px] opacity-60">{secondaryLabel}</span>
                    </button>
                  );
                })}
                {filteredPatients.length === 0 && (
                  <p className="text-sm text-neutral-400">No se encontraron pacientes.</p>
                )}
              </div>
            </>
          )}
        </motion.div>

        {/* ── Content when no patient selected ── */}
        {!selectedPatientId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-20 text-center"
          >
            <User className="mb-4 h-12 w-12 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-600">Seleccioná un paciente</p>
            <p className="mt-1 text-sm text-neutral-400">
              Elegí un paciente para ver su historial o creá una receta cargando sus datos manualmente.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => { setEditingPrescription(null); setShowCreateModal(true); }}
                className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
              >
                <Plus className="h-4 w-4" />
                Nueva receta
              </button>
              <button
                onClick={() => setShowCertificateModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700"
              >
                <FileText className="h-4 w-4" />
                Preparar atestado
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Content when patient selected ── */}
        {selectedPatientId && (
          <>
            {/* Document Mode Selector: Recetas vs Atestados */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDocMode("prescriptions")}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                    docMode === "prescriptions"
                      ? "bg-neutral-900 text-white shadow-sm"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  <Pill className="h-4 w-4" />
                  Recetas Médicas
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                    docMode === "prescriptions" ? "bg-white/20 text-white" : "bg-neutral-200 text-neutral-700"
                  }`}>
                    {stats.total}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDocMode("certificates")}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                    docMode === "certificates"
                      ? "bg-teal-700 text-white shadow-sm"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Atestados Médicos
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                    docMode === "certificates" ? "bg-white/20 text-white" : "bg-neutral-200 text-neutral-700"
                  }`}>
                    {certificates.length}
                  </span>
                </button>
              </div>

              {docMode === "certificates" && (
                <button
                  type="button"
                  onClick={() => setShowCertificateModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Preparar atestado
                </button>
              )}
            </div>

            {docMode === "prescriptions" && (
              <>
                {/* Stats */}
                <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5"
            >
              {([
                { label: "Total", value: stats.total, icon: ClipboardList, color: "text-neutral-900 bg-neutral-100" },
                { label: "Borradores", value: stats.drafts, icon: FileText, color: "text-amber-600 bg-amber-100" },
                { label: "Activas", value: stats.active, icon: CheckCircle2, color: "text-blue-600 bg-blue-100" },
                { label: "Dispensadas", value: stats.dispensed, icon: Pill, color: "text-green-600 bg-green-100" },
                { label: "Vencidas/Canc.", value: stats.expired, icon: AlertCircle, color: "text-gray-500 bg-gray-100" },
              ] as const).map((stat) => (
                <div key={stat.label} className="rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${stat.color}`}>
                      <stat.icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{stat.label}</span>
                  </div>
                  <p className="text-2xl font-light tracking-tight text-neutral-900">{stat.value}</p>
                </div>
              ))}
            </motion.div>

            {/* Tabs & Search */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-6 space-y-4"
            >
              <div className="flex flex-wrap gap-1 rounded-xl bg-neutral-100 p-1">
                {([
                  { key: "all" as TabType, label: "Todas" },
                  { key: "draft" as TabType, label: "Borradores" },
                  { key: "active" as TabType, label: "Activas" },
                  { key: "dispensed" as TabType, label: "Dispensadas" },
                  { key: "cancelled" as TabType, label: "Vencidas/Canceladas" },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                      activeTab === tab.key
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-500 hover:text-neutral-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por medicamento, diagnóstico o CUIR..."
                  className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
            </motion.div>

            {/* Loading */}
            {rxLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
              </div>
            )}

            {/* Error */}
            {rxError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {rxError}
              </div>
            )}

            {/* Prescriptions List */}
            {!rxLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="space-y-3">
                {filteredPrescriptions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-16 text-center">
                    <ClipboardList className="mb-4 h-12 w-12 text-neutral-300" />
                    <p className="text-lg font-medium text-neutral-600">No se encontraron recetas</p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {search ? "Intentá con otros términos de búsqueda" : "Creá la primera receta para este paciente"}
                    </p>
                    {!search && (
                      <button
                        onClick={() => { setEditingPrescription(null); setShowCreateModal(true); }}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
                      >
                        <Plus className="h-4 w-4" />
                        Nueva receta
                      </button>
                    )}
                  </div>
                ) : (
                  <AnimatePresence>
                    {filteredPrescriptions.map((rx, index) => {
                      const { medicationName, dosage, diagnosis } = mapCoreToDisplay(rx);
                      const cuir = getCuir(rx);
                      const status = getStatusField(rx);
                      const createdAt = getCreatedAt(rx);
                      const viewUrl = getPrescriptionViewUrl(rx);
                      return (
                        <motion.div
                          key={getId(rx)}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className="group rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 hover:shadow-sm sm:p-5"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <h3 className="text-base font-semibold text-neutral-900 truncate">
                                  {medicationName}
                                </h3>
                                {getStatusBadge(status)}
                              </div>
                              {dosage && (
                                <p className="text-sm text-neutral-500">
                                  <Pill className="inline h-3.5 w-3.5 mr-1" />
                                  {dosage}
                                </p>
                              )}
                              {diagnosis && (
                                <p className="mt-1 text-sm text-neutral-700">
                                  <span className="font-medium">Dx:</span> {diagnosis}
                                </p>
                              )}
                              <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-400">
                                <Clock className="h-3 w-3" />
                                <span>{formatDateTime(createdAt)}</span>
                                {cuir && (
                                  <span className="font-mono text-[10px] text-blue-500">{cuir}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {viewUrl && (
                                <a
                                  href={viewUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-neutral-800 shadow-sm"
                                  title="Descargar o ver PDF oficial"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  Descargar PDF
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => viewPrescription(rx)}
                                disabled={!viewUrl}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 hover:border-neutral-300"
                                title={viewUrl ? "Abrir receta digital" : "La receta todavia no tiene PDF/verificador"}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Ver
                              </button>
                              <button
                                type="button"
                                onClick={() => printPrescription(rx)}
                                disabled={!viewUrl}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
                                title={viewUrl ? "Abrir receta para imprimir" : "La receta todavia no tiene PDF/verificador"}
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Imprimir
                              </button>
                              <button
                                type="button"
                                onClick={() => inspectPrescription(rx)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 hover:border-neutral-300"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Detalle
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </motion.div>
            )}
              </>
            )}

            {docMode === "certificates" && (
              <div className="space-y-4">
                {certLoading && (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
                  </div>
                )}

                {certError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {certError}
                  </div>
                )}

                {!certLoading && certificates.length === 0 && (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-16 text-center">
                    <FileCheck className="mb-4 h-12 w-12 text-neutral-300" />
                    <p className="text-lg font-medium text-neutral-600">No hay atestados emitidos</p>
                    <p className="mt-1 text-sm text-neutral-400">
                      Emití reposos laborales, escolares o certificados de aptitud física para este paciente.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowCertificateModal(true)}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700 shadow-sm"
                    >
                      <Plus className="h-4 w-4" />
                      Preparar atestado
                    </button>
                  </div>
                )}

                {firmarError && (
                  <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                    {firmarError}
                  </div>
                )}
                {!certLoading && certificates.length > 0 && (
                  <div className="space-y-3">
                    {certificates.map((cert) => {
                      const certUrl = cert.status === "draft" || cert.status === "signed"
                        ? `/api/doctors/certificates/${encodeURIComponent(cert.id)}/pdf`
                        : undefined;
                      const typeLabel = CERT_TYPE_LABELS[cert.certificate_type] || "Atestado Médico";
                      return (
                        <div
                          key={cert.id}
                          className="rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 hover:shadow-sm sm:p-5"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 border border-teal-200">
                                  <FileCheck className="h-3 w-3" />
                                  {typeLabel}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {cert.status === "signed" ? "Registrado (firma sin comprobar)" : cert.status === "draft" ? "Borrador sin firma" : cert.status}
                                </span>
                              </div>

                              <h3 className="text-base font-semibold text-neutral-900">
                                {cert.days_of_rest > 0
                                  ? `${cert.days_of_rest} ${cert.days_of_rest === 1 ? "día" : "días"} de reposo médico`
                                  : "Constancia de atención / Sin reposo"}
                              </h3>

                              <p className="mt-1 text-sm text-neutral-600">
                                Período: <span className="font-medium text-neutral-800">{cert.start_date}</span>
                                {cert.end_date ? ` hasta ${cert.end_date}` : ""}
                              </p>

                              {cert.hide_diagnosis ? (
                                <p className="mt-1 text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                                  <Shield className="h-3.5 w-3.5" />
                                  Reservado por Secreto Médico (Ley 26.529 / Dec. 63/2024)
                                </p>
                              ) : cert.diagnosis ? (
                                <p className="mt-1 text-sm text-neutral-700">
                                  <span className="font-medium">Diagnóstico:</span> {cert.diagnosis}
                                </p>
                              ) : null}

                              {cert.observations && (
                                <p className="mt-1 text-xs text-neutral-500 italic">
                                  Obs: {cert.observations}
                                </p>
                              )}

                              <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-400">
                                <Clock className="h-3 w-3" />
                                <span>{formatDateTime(cert.created_at)}</span>
                                {cert.status === "signed" && cert.cuir && (
                                  <span className="font-mono text-[10px] text-teal-600 font-semibold bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                                    Ref.: {cert.cuir}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {firmarAvailable && cert.status === "draft" && (
                                <button
                                  type="button"
                                  onClick={() => void startFirmarSignature(cert.id)}
                                  disabled={firmarBusyId !== null}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                                  title="El médico debe autorizar personalmente cada firma mediante FirmAR"
                                >
                                  <FileCheck className="h-3.5 w-3.5" />
                                  {firmarBusyId === cert.id ? "Iniciando..." : "Firmar con FirmAR"}
                                </button>
                              )}
                              {certUrl && (
                                <a
                                  href={certUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-medium text-white transition hover:bg-teal-800 shadow-sm"
                                  title={cert.status === "draft" ? "Descargar PDF privado sin firma" : "Descargar PDF firmado verificado"}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  {cert.status === "draft" ? "Descargar borrador" : "Descargar PDF"}
                                </a>
                              )}
                              {cert.cuir && (
                                <a
                                  href={`/verify/${encodeURIComponent(cert.cuir)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 hover:border-neutral-300"
                                  title="Consultar el estado del certificado por QR"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Verificador QR
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── PrescriptionCreateModal ── */}
      {showCreateModal && (
        <PrescriptionCreateModal
          patientId={(selectedPatientId ?? undefined) as UUID | undefined}
          onClose={() => setShowCreateModal(false)}
          onSaved={handleSaved}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          addPrescription={handleCreateDraft as any}
          updatePrescription={async (id: UUID, updates: Record<string, unknown>) => {
            await updatePrescription(id as string, updates);
          }}
          issuePrescription={async (id: UUID) => {
            await issuePrescription(id as string);
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editingPrescription={editingPrescription as any}
          submitLabel={editingPrescription ? "Guardar cambios" : "Crear y emitir receta"}
        />
      )}

      {/* ── CertificateCreateModal ── */}
      {showCertificateModal && certificateCountry && (
        <CertificateCreateModal
          patientId={selectedPatientId ?? undefined}
          countryCode={certificateCountry}
          patientName={selectedPatient ? getPatientDisplayName(selectedPatient) : undefined}
          patientDni={selectedPatient?.dni ?? undefined}
          onClose={() => setShowCertificateModal(false)}
          onCreated={() => {
            if (certificateCountry === 'BR') { void fetchCertificates(); return; }
            setShowCertificateModal(false);
            setDocMode("certificates");
            void fetchCertificates();
          }}
        />
      )}

      {showCertificateModal && !certificateCountry && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
          Não foi possível determinar a jurisdição do médico. Verifique o CRM/UF ou a matrícula antes de criar o atestado.
          <button type="button" onClick={() => setShowCertificateModal(false)} className="ml-3 underline">Fechar</button>
        </div>
      )}

      {/* ── Detail panel ── */}
      <AnimatePresence>
        {showDetailPanel && selectedPrescription && (
          <PrescriptionDetailPanel
            prescription={selectedPrescription}
            onClose={() => { setShowDetailPanel(false); setSelectedPrescription(null); }}
          />
        )}
      </AnimatePresence>

      {/* ── Memed Widget ── */}
      {showMemedWidget && selectedPatientId && (
        <MemedPrescriptionWidget
          patientId={selectedPatientId}
          onPrescriptionSaved={async (prescriptionId) => {
            const response = await fetch('/api/doctors/prescriptions/memed-event', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'issued', patientId: selectedPatientId, prescriptionId }),
            });
            if (!response.ok) throw new Error('Falha ao registrar receita Memed.');
            refresh();
          }}
          onPrescriptionDeleted={async (prescriptionId) => {
            const response = await fetch('/api/doctors/prescriptions/memed-event', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'deleted', patientId: selectedPatientId, prescriptionId }),
            });
            if (!response.ok) throw new Error('Falha ao sincronizar exclusão Memed.');
            refresh();
          }}
          onClose={() => setShowMemedWidget(false)}
        />
      )}
    </DoctorsPortalFrame>
  );
}

// ─── Helper functions ──────────────────────────────────────────────────────

function isCuirPresent(rx: IssuedPrescription): boolean {
  return Boolean((rx as unknown as Record<string, unknown>).cuir);
}

function isActive(rx: IssuedPrescription): boolean {
  const status = getStatusField(rx);
  return isCuirPresent(rx) && !["dispensed_total", "cancelled", "expired"].includes(status);
}

function isDispensed(rx: IssuedPrescription): boolean {
  const status = getStatusField(rx);
  return status === "dispensed_total" || status === "dispensed_partial";
}

function isCancelledOrExpired(rx: IssuedPrescription): boolean {
  const status = getStatusField(rx);
  return status === "cancelled" || status === "expired";
}

function getStatusField(rx: IssuedPrescription): string {
  return String((rx as unknown as Record<string, unknown>).status ?? "draft");
}

function getCuir(rx: IssuedPrescription): string | undefined {
  const cuir = (rx as unknown as Record<string, unknown>).cuir;
  return typeof cuir === "string" ? cuir : undefined;
}

function getCreatedAt(rx: IssuedPrescription): string {
  const raw = rx as unknown as Record<string, unknown>;
  return String(rx.issuedAt || raw.created_at || new Date().toISOString());
}

function getId(rx: IssuedPrescription): string {
  return String((rx as unknown as Record<string, unknown>).id ?? "");
}

// ─── Detail Panel Sub-component ────────────────────────────────────────────

function PrescriptionDetailPanel({
  prescription,
  onClose,
}: {
  prescription: IssuedPrescription;
  onClose: () => void;
}) {
  const detail = mapCoreToDisplay(prescription);
  const cuir = getCuir(prescription);
  const status = getStatusField(prescription);
  const createdAt = getCreatedAt(prescription);
  const signedPdfUrl =
    ((prescription as unknown as Record<string, unknown>).signed_pdf_url as string | undefined) ||
    prescription.artifacts?.signedPdfUrl ||
    (cuir ? `/verify/${encodeURIComponent(cuir)}` : undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{detail.medicationName}</h2>
            <p className="text-xs text-neutral-500">{detail.dosage}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {cuir && (
            <div className="rounded-lg bg-blue-50 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase text-blue-500">CUIR</p>
              <p className="text-sm font-mono text-blue-700">{cuir}</p>
            </div>
          )}
          <div className="rounded-lg bg-neutral-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase text-neutral-500">Estado</p>
            <div className="mt-1">{getStatusBadge(status)}</div>
          </div>
          {detail.diagnosis && (
            <div>
              <p className="text-[10px] font-semibold uppercase text-neutral-500">Diagnóstico</p>
              <p className="text-sm text-neutral-900">{detail.diagnosis}</p>
            </div>
          )}
          {detail.notes && (
            <div>
              <p className="text-[10px] font-semibold uppercase text-neutral-500">Notas</p>
              <p className="text-sm text-neutral-700">{detail.notes}</p>
            </div>
          )}
          {createdAt && (
            <div>
              <p className="text-[10px] font-semibold uppercase text-neutral-500">Creada</p>
              <p className="text-sm text-neutral-600">{formatDateTime(createdAt)}</p>
            </div>
          )}
          {signedPdfUrl && (
            <a
              href={signedPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition shadow-sm"
            >
              <Download className="h-4 w-4" />
              Descargar PDF oficial
            </a>
          )}
        </div>
      </motion.div>
    </div>
  );
}

