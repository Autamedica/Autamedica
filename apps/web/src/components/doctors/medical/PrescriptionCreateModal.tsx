/**
 * Modal para crear o editar una prescripción desde el portal del doctor.
 * Consume addPrescription / updatePrescription del hook usePrescriptions.
 */
"use client";

import { useEffect, useState } from "react";
import { X, Pill, Save, Loader2, ClipboardCheck, BookmarkPlus, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { requiresStrictPrescriptionValidation } from "@/lib/prescriptions/strict-validation";
import type { Prescription, UUID } from "@/types/medical";

interface PrescriptionCreateModalProps {
  patientId?: UUID;
  onClose: () => void;
  onSaved: () => void;
  addPrescription: (
    p: Omit<Prescription, "id" | "created_at" | "updated_at" | "patient_id"> & {
      patient_id?: UUID;
      external_patient?: ExternalPatientForm;
    },
  ) => Promise<Prescription>;
  updatePrescription: (id: UUID, updates: Partial<Prescription>) => Promise<void>;
  editingPrescription?: Prescription | null;
  issuePrescription?: (id: UUID) => Promise<void>;
  submitLabel?: string;
}

interface ExternalPatientForm {
  name: string;
  dni?: string;
  cuil?: string;
  address?: string;
  email?: string;
  phone?: string;
  birth_date?: string;
  gender?: string;
}

interface PrescriptionTemplate {
  id: string;
  name: string;
  medication_name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  diagnosis: string | null;
  notes: string | null;
  side_effects_warning: string | null;
  care_guide_tips: string | null;
  care_guide_forgotten: string | null;
  care_guide_warnings: string | null;
  care_guide_lifestyle: string | null;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { message?: string };
}

const TODAY = new Date().toISOString().split("T")[0];

function buildDefaultPatientInstructions(form: {
  medication_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  diagnosis: string;
}) {
  const medication = form.medication_name.trim() || "el medicamento indicado";
  const frequency = /^\d+$/.test(form.frequency.trim())
    ? `cada ${form.frequency.trim()} horas`
    : form.frequency.trim();
  const duration = form.duration.trim() ? `durante ${form.duration.trim()}` : "";
  const dose = [form.dosage.trim(), frequency, duration].filter(Boolean).join(", ");
  const diagnosis = form.diagnosis.trim();

  return {
    care_guide_tips: `Tomar ${medication}${dose ? ` (${dose})` : ""} según la indicación médica. ${form.instructions.trim()}`.trim(),
    care_guide_forgotten:
      "Si omite una toma, no duplique la dosis. Continúe con el esquema indicado o consulte si tiene dudas.",
    care_guide_warnings:
      "Consultar ante reacciones alérgicas, dificultad para respirar, síntomas intensos o cualquier reacción inesperada.",
    care_guide_lifestyle: diagnosis
      ? `Mantener las pautas de cuidado indicadas para ${diagnosis}.`
      : "Mantener las pautas de cuidado indicadas por el profesional.",
  };
}

function prescriptionErrorMessage(error: unknown, phase: "save" | "issue"): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : "Error al guardar la prescripción";
  }

  const messages: Record<string, string> = {
    doctor_profile_required: "Tu perfil médico no está completo para emitir recetas.",
    forbidden_patient_access: "No tenés acceso al paciente seleccionado.",
    missing_license_number: "Falta tu matrícula profesional en el perfil.",
    missing_refeps_id: "Falta tu identificador REFEPS en el perfil.",
    missing_professional_address: "Falta tu domicilio profesional en el perfil.",
    prescriber_validation_required: "Tu validación profesional aún no permite emitir recetas.",
    missing_patient_identification: "Falta DNI o CUIL del paciente.",
    missing_patient_address: "Falta el domicilio del paciente.",
    no_medication: "Agregá al menos un medicamento antes de emitir.",
    already_issued: "Esta receta ya fue emitida.",
    prescription_country_required: "Definí el país de atención de la receta antes de emitir.",
    doctor_country_mismatch: "La matrícula o el país del médico no coinciden con la jurisdicción de esta receta.",
    patient_country_required_or_mismatched: "Confirmá el país clínico del paciente antes de emitir.",
    br_requires_memed_provider: "En Brasil, la emisión oficial debe realizarse a través de Memed. Este PDF interno no es válido como emisión.",
    ar_production_homologation_required: "Emisión oficial argentina deshabilitada hasta completar homologación y firma verificable. El borrador permanece guardado.",
    digital_signature_required: "No hay un certificado digital profesional disponible y verificable para firmar esta receta.",
    digital_signature_failed: "No se pudo firmar digitalmente la receta. No se considera emitida.",
    farmalink_registration_required: "Farmalink no confirmó un registro de producción. El borrador permanece sin emitir.",
    farmalink_missing_config: "Falta configuración de Farmalink para emitir esta receta.",
    farmalink_mapping_failed: "No pudimos preparar los datos para Farmalink.",
    farmalink_registration_failed: "Farmalink no registró la receta.",
    farmalink_rejected: "Farmalink rechazó la receta.",
    farmalink_pending_reconciliation: "Farmalink puede haber recibido la receta. No vuelvas a emitirla: está bloqueada hasta verificar el resultado con soporte.",
    farmalink_idempotency_unavailable: "No es posible verificar el control de duplicados. No se enviará esta receta a Farmalink.",
    pdf_generation_failed: "La receta se guardó, pero falló la generación del PDF.",
    update_failed: "La receta se generó, pero no pudimos marcarla como emitida.",
    internal_error:
      phase === "issue"
        ? "La receta se guardó, pero falló la emisión. Reintentá desde recetas."
        : "No pudimos guardar la receta.",
  };

  return messages[error.code ?? ""] ?? error.message;
}

interface CareGuideResponse {
  consejosToma?: string;
  queHacerAnteOlvidos?: string;
  efectosEsperados?: string;
  recomendacionesClinicas?: string;
}

function unwrapCareGuideResponse(payload: unknown): CareGuideResponse | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const data = record.success === true && record.data && typeof record.data === "object"
    ? record.data
    : payload;

  if (!data || typeof data !== "object") return null;
  return data as CareGuideResponse;
}

export function PrescriptionCreateModal({
  patientId,
  onClose,
  onSaved,
  addPrescription,
  updatePrescription,
  editingPrescription,
  issuePrescription,
  submitLabel,
}: PrescriptionCreateModalProps) {
  const isEditing = !!editingPrescription;

  const [form, setForm] = useState({
    patient_name: "",
    patient_document: "",
    patient_address: "",
    patient_contact: "",
    patient_birth_date: "",
    patient_gender: "",
    medication_name: editingPrescription?.medication_name ?? "",
    dosage: editingPrescription?.dosage ?? "",
    frequency: editingPrescription?.frequency ?? "",
    duration: editingPrescription?.duration ?? "",
    instructions: editingPrescription?.instructions ?? "",
    diagnosis: editingPrescription?.diagnosis ?? "",
    notes: editingPrescription?.notes ?? "",
    side_effects_warning: editingPrescription?.side_effects_warning ?? "",
    status: editingPrescription?.status ?? ("activa" as Prescription["status"]),
    start_date: editingPrescription?.start_date
      ? editingPrescription.start_date.split("T")[0]
      : TODAY,
    end_date: editingPrescription?.end_date ? editingPrescription.end_date.split("T")[0] : "",
    care_guide_tips: editingPrescription?.care_guide_tips ?? "",
    care_guide_forgotten: editingPrescription?.care_guide_forgotten ?? "",
    care_guide_warnings: editingPrescription?.care_guide_warnings ?? "",
    care_guide_lifestyle: editingPrescription?.care_guide_lifestyle ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [generatingGuide, setGeneratingGuide] = useState(false);
  const [templates, setTemplates] = useState<PrescriptionTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showGuideSection, setShowGuideSection] = useState(
    isEditing &&
      Boolean(
        editingPrescription?.care_guide_tips ||
          editingPrescription?.care_guide_forgotten ||
          editingPrescription?.care_guide_warnings ||
          editingPrescription?.care_guide_lifestyle,
      ),
  );
  const [error, setError] = useState<string | null>(null);
  const requiresStrictValidation = requiresStrictPrescriptionValidation(form.medication_name);
  const normalizedPatientDocument = form.patient_document.replace(/\D/g, "");
  const externalPatientDni =
    normalizedPatientDocument.length === 11 ? "" : normalizedPatientDocument || form.patient_document.trim();
  const externalPatientCuil =
    normalizedPatientDocument.length === 11 ? normalizedPatientDocument : "";
  const normalizedPatientContact = form.patient_contact.trim();
  const externalPatientEmail = normalizedPatientContact.includes("@")
    ? normalizedPatientContact
    : undefined;
  const externalPatientPhone =
    normalizedPatientContact && !normalizedPatientContact.includes("@")
      ? normalizedPatientContact
      : undefined;

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const response = await fetch("/api/doctors/prescription-templates", {
        credentials: "include",
      });
      if (!response.ok) return;

      const json = (await response.json()) as ApiEnvelope<PrescriptionTemplate[]>;
      if (json.success && Array.isArray(json.data)) {
        setTemplates(json.data);
      }
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;

    setForm((prev) => ({
      ...prev,
      medication_name: template.medication_name,
      dosage: template.dosage ?? "",
      frequency: template.frequency ?? "",
      duration: template.duration ?? "",
      instructions: template.instructions ?? "",
      diagnosis: template.diagnosis ?? "",
      notes: template.notes ?? "",
      side_effects_warning: template.side_effects_warning ?? "",
      care_guide_tips: template.care_guide_tips ?? "",
      care_guide_forgotten: template.care_guide_forgotten ?? "",
      care_guide_warnings: template.care_guide_warnings ?? "",
      care_guide_lifestyle: template.care_guide_lifestyle ?? "",
    }));
    setShowGuideSection(
      Boolean(
        template.care_guide_tips ||
          template.care_guide_forgotten ||
          template.care_guide_warnings ||
          template.care_guide_lifestyle,
      ),
    );
  };

  const handleSaveTemplate = async () => {
    if (!form.medication_name.trim()) {
      setError("Completá el medicamento antes de guardar la plantilla.");
      return;
    }
    if (templates.length >= 12) {
      setError("Podés guardar hasta 12 plantillas de recetas.");
      return;
    }

    const name = window.prompt("Nombre de la plantilla", form.medication_name.trim());
    if (!name?.trim()) return;

    setSavingTemplate(true);
    setError(null);
    try {
      const response = await fetch("/api/doctors/prescription-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          medication_name: form.medication_name,
          dosage: form.dosage,
          frequency: form.frequency,
          duration: form.duration,
          instructions: form.instructions,
          diagnosis: form.diagnosis,
          notes: form.notes,
          side_effects_warning: form.side_effects_warning,
          care_guide_tips: form.care_guide_tips,
          care_guide_forgotten: form.care_guide_forgotten,
          care_guide_warnings: form.care_guide_warnings,
          care_guide_lifestyle: form.care_guide_lifestyle,
        }),
      });

      const json = (await response.json().catch(() => null)) as ApiEnvelope<PrescriptionTemplate> | null;
      if (!response.ok || !json?.success || !json.data) {
        const message = json?.error?.message ?? "No se pudo guardar la plantilla.";
        throw new Error(message);
      }

      setTemplates((prev) => [json.data as PrescriptionTemplate, ...prev]);
      setSelectedTemplateId(json.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la plantilla.");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplateId) return;
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) return;
    if (!window.confirm(`Eliminar plantilla "${template.name}"?`)) return;

    const response = await fetch(`/api/doctors/prescription-templates/${selectedTemplateId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      setError("No se pudo eliminar la plantilla.");
      return;
    }

    setTemplates((prev) => prev.filter((item) => item.id !== selectedTemplateId));
    setSelectedTemplateId("");
  };

  const handleSuggestCareGuide = async () => {
    if (!form.medication_name.trim()) {
      setError("Completá el medicamento antes de generar indicaciones.");
      return;
    }

    setGeneratingGuide(true);
    setError(null);
    try {
      const response = await fetch("/api/doctors/prescriptions/suggest-care-guide", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicationName: form.medication_name,
          dosage: form.dosage,
          frequency: form.frequency,
          duration: form.duration,
          instructions: form.instructions,
          diagnosis: form.diagnosis,
          patientName: form.patient_name || undefined,
        }),
      });

      if (!response.ok) throw new Error("suggestion_unavailable");

      const data = unwrapCareGuideResponse(await response.json());
      if (!data) throw new Error("invalid_suggestion_response");

      setForm((prev) => ({
        ...prev,
        care_guide_tips: data.consejosToma ?? "",
        care_guide_forgotten: data.queHacerAnteOlvidos ?? "",
        care_guide_warnings: data.efectosEsperados ?? "",
        care_guide_lifestyle: data.recomendacionesClinicas ?? "",
      }));
      setShowGuideSection(true);
    } catch {
      setForm((prev) => ({
        ...prev,
        ...buildDefaultPatientInstructions(form),
      }));
      setShowGuideSection(true);
    } finally {
      setGeneratingGuide(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.medication_name.trim()) {
      setError("El nombre del medicamento es requerido");
      return;
    }
    if (requiresStrictValidation && (!form.diagnosis.trim() || !form.dosage.trim())) {
      setError("Medicación con validación reforzada: diagnóstico y dosis son obligatorios.");
      return;
    }
    if (!patientId) {
      if (!form.patient_name.trim()) {
        setError("El nombre del paciente es requerido");
        return;
      }
      if (!form.patient_document.trim()) {
        setError("Informá DNI o CUIL del paciente");
        return;
      }
      if (!form.patient_address.trim()) {
        setError("El domicilio del paciente es requerido");
        return;
      }
    }

    setSaving(true);
    setError(null);

    const basePayload: Omit<Prescription, "id" | "created_at" | "updated_at" | "patient_id"> = {
      doctor_id: "" as UUID,
      medical_record_id: null,
      medication_name: form.medication_name.trim(),
      dosage: form.dosage.trim(),
      frequency: form.frequency.trim(),
      duration: form.duration.trim(),
      instructions: form.instructions.trim(),
      diagnosis: form.diagnosis.trim() || null,
      notes: form.notes.trim() || null,
      side_effects_warning: form.side_effects_warning.trim() || null,
      status: form.status,
      prescribed_date: form.start_date
        ? new Date(form.start_date).toISOString()
        : new Date().toISOString(),
      start_date: form.start_date
        ? new Date(form.start_date).toISOString()
        : new Date().toISOString(),
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      care_guide_tips: form.care_guide_tips.trim() || null,
      care_guide_forgotten: form.care_guide_forgotten.trim() || null,
      care_guide_warnings: form.care_guide_warnings.trim() || null,
      care_guide_lifestyle: form.care_guide_lifestyle.trim() || null,
    };
    const payload: Omit<Prescription, "id" | "created_at" | "updated_at" | "patient_id"> & {
      patient_id?: UUID;
      external_patient?: ExternalPatientForm;
    } = patientId
      ? { ...basePayload, patient_id: patientId }
      : {
          ...basePayload,
          external_patient: {
            name: form.patient_name.trim(),
            dni: externalPatientDni || undefined,
            cuil: externalPatientCuil || undefined,
            address: form.patient_address.trim() || undefined,
            email: externalPatientEmail,
            phone: externalPatientPhone,
            birth_date: form.patient_birth_date || undefined,
            gender: form.patient_gender || undefined,
          },
        };

    let phase: "save" | "issue" = "save";
    try {
      if (isEditing && editingPrescription) {
        await updatePrescription(editingPrescription.id, payload);
      } else {
        const created = await addPrescription(payload);
        if (issuePrescription) {
          const createdId = created?.id;
          if (!createdId) {
            throw new Error("No se pudo emitir la receta recién creada.");
          }
          phase = "issue";
          await issuePrescription(createdId as UUID);
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(prescriptionErrorMessage(err, phase));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-am-surface-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-am-doctor-50">
              <Pill className="h-5 w-5 text-am-doctor-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-am-surface-900">
                {isEditing ? "Editar prescripción" : "Nueva prescripción"}
              </h2>
              <p className="text-xs text-am-surface-500">
                {isEditing
                  ? editingPrescription?.medication_name
                  : "Complete los datos del medicamento"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-am-surface-400 hover:bg-am-surface-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {!patientId && !isEditing && (
            <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-am-surface-500">
                Paciente sin cuenta
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                    Nombre completo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.patient_name}
                    onChange={set("patient_name")}
                    placeholder="Ej: María González"
                    className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                      Documento <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.patient_document}
                      onChange={set("patient_document")}
                      placeholder="DNI o CUIL"
                      className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                      Contacto
                    </label>
                    <input
                      type="text"
                      value={form.patient_contact}
                      onChange={set("patient_contact")}
                      placeholder="Email o WhatsApp"
                      className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                    Domicilio <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.patient_address}
                    onChange={set("patient_address")}
                    placeholder="Av. Corrientes 1234, CABA"
                    className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
                  />
                </div>
              </div>
            </div>
          )}

          {!isEditing && (
            <div className="rounded-xl border border-am-surface-200 bg-white p-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                    Plantilla
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => applyTemplate(event.target.value)}
                    disabled={templatesLoading || templates.length === 0}
                    className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500 disabled:bg-am-surface-50 disabled:text-am-surface-400"
                  >
                    <option value="">
                      {templatesLoading
                        ? "Cargando plantillas..."
                        : templates.length > 0
                          ? "Seleccionar plantilla"
                          : "Sin plantillas guardadas"}
                    </option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate || templates.length >= 12 || !form.medication_name.trim()}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-am-surface-200 text-am-surface-600 transition hover:bg-am-surface-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Guardar como plantilla"
                >
                  {savingTemplate ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BookmarkPlus className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTemplate}
                  disabled={!selectedTemplateId}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-am-surface-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Eliminar plantilla"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-[11px] text-am-surface-500 leading-relaxed">
                {templates.length}/12 plantillas guardadas.
                {templates.length === 0 && (
                  <span className="block mt-1 text-neutral-400 font-normal">
                    💡 <strong>Cómo guardar:</strong> Rellená el medicamento y dosis abajo, y hacé clic en el marcador de la derecha (icono <span className="inline-block px-1 bg-neutral-100 rounded text-neutral-600">Bookmark</span>) para guardarlo como plantilla.
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Medicamento (requerido) */}
          <div>
            <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
              Medicamento <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.medication_name}
              onChange={set("medication_name")}
              placeholder="Ej: Amoxicilina 500mg"
              className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
            />
          </div>

          {requiresStrictValidation && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Medicación con validación reforzada. Diagnóstico y dosis son obligatorios para
              continuar.
            </div>
          )}

          {/* Dosis + Frecuencia */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                Dosis
              </label>
              <input
                type="text"
                value={form.dosage}
                onChange={set("dosage")}
                placeholder="Ej: 500mg"
                className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                Frecuencia
              </label>
              <input
                type="text"
                value={form.frequency}
                onChange={set("frequency")}
                placeholder="Ej: cada 8 horas"
                className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
              />
            </div>
          </div>

          {/* Duración + Estado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                Duración
              </label>
              <input
                type="text"
                value={form.duration}
                onChange={set("duration")}
                placeholder="Ej: 7 días"
                className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                Estado
              </label>
              <select
                value={form.status}
                onChange={set("status")}
                className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
              >
                <option value="activa">Activa</option>
                <option value="pausada">Pausada</option>
                <option value="completada">Completada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                Fecha inicio
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={set("start_date")}
                className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                Fecha fin (opcional)
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={set("end_date")}
                min={form.start_date}
                className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
              />
            </div>
          </div>

          {/* Instrucciones */}
          <div>
            <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
              Instrucciones
            </label>
            <textarea
              value={form.instructions}
              onChange={set("instructions")}
              placeholder="Ej: Tomar con alimentos, no suspender antes de terminar el tratamiento"
              rows={2}
              className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
              Diagnóstico
            </label>
            <input
              type="text"
              value={form.diagnosis}
              onChange={set("diagnosis")}
              placeholder="Ej: TDAH, infección respiratoria alta"
              className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
            />
          </div>

          <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-am-doctor-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-am-surface-700">
                  Indicaciones para el paciente
                </span>
              </div>
              <button
                type="button"
                onClick={handleSuggestCareGuide}
                disabled={generatingGuide || !form.medication_name.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-am-doctor-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-am-doctor-700 disabled:opacity-50"
              >
                {generatingGuide && <Loader2 className="h-3 w-3 animate-spin" />}
                {generatingGuide ? "Generando..." : "Generar"}
              </button>
            </div>

            {showGuideSection && (
              <div className="space-y-3 border-t border-am-surface-200 pt-3">
                <div>
                  <label className="block text-[11px] font-semibold text-am-surface-700 mb-1">
                    Administración
                  </label>
                  <textarea
                    value={form.care_guide_tips}
                    onChange={set("care_guide_tips")}
                    placeholder="Indicaciones de toma, horarios e interacciones relevantes."
                    rows={3}
                    className="w-full rounded-lg border border-am-surface-200 bg-white px-3 py-2 text-xs text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-am-surface-700 mb-1">
                    Omisión de dosis
                  </label>
                  <textarea
                    value={form.care_guide_forgotten}
                    onChange={set("care_guide_forgotten")}
                    placeholder="Qué debe hacer el paciente si omite una toma."
                    rows={2}
                    className="w-full rounded-lg border border-am-surface-200 bg-white px-3 py-2 text-xs text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-am-surface-700 mb-1">
                    Alertas clínicas
                  </label>
                  <textarea
                    value={form.care_guide_warnings}
                    onChange={set("care_guide_warnings")}
                    placeholder="Efectos esperados y signos de alarma."
                    rows={3}
                    className="w-full rounded-lg border border-am-surface-200 bg-white px-3 py-2 text-xs text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-am-surface-700 mb-1">
                    Cuidados asociados
                  </label>
                  <textarea
                    value={form.care_guide_lifestyle}
                    onChange={set("care_guide_lifestyle")}
                    placeholder="Medidas de autocuidado asociadas al diagnóstico."
                    rows={3}
                    className="w-full rounded-lg border border-am-surface-200 bg-white px-3 py-2 text-xs text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
              Notas adicionales
            </label>
            <textarea
              value={form.notes}
              onChange={set("notes")}
              placeholder="Observaciones para el paciente..."
              rows={2}
              className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500 resize-none"
            />
          </div>

          {/* Alertas clínicas */}
          <div>
            <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
              Alertas clínicas
            </label>
            <textarea
              value={form.side_effects_warning}
              onChange={set("side_effects_warning")}
              placeholder="Efectos esperados, signos de alarma o pautas de consulta."
              rows={2}
              className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500 resize-none"
            />
          </div>

          {/* Error */}
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-am-surface-200 px-4 py-2.5 text-sm font-medium text-am-surface-700 hover:bg-am-surface-100 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-am-doctor-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-am-doctor-700 disabled:opacity-60 transition"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Guardando..." : submitLabel ?? (isEditing ? "Actualizar" : "Guardar receta")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
