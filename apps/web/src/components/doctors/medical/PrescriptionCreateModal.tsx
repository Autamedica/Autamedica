/**
 * Modal para crear o editar una prescripción desde el portal del doctor.
 * Consume addPrescription / updatePrescription del hook usePrescriptions.
 */
"use client";

import { useState } from "react";
import { X, Pill, Save, Loader2, Sparkles } from "lucide-react";
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
  birth_date?: string;
  gender?: string;
}

const TODAY = new Date().toISOString().split("T")[0];

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
    patient_dni: "",
    patient_cuil: "",
    patient_address: "",
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
  const [showGuideSection, setShowGuideSection] = useState(
    isEditing && (
      !!editingPrescription?.care_guide_tips ||
      !!editingPrescription?.care_guide_forgotten ||
      !!editingPrescription?.care_guide_warnings ||
      !!editingPrescription?.care_guide_lifestyle
    )
  );
  const [error, setError] = useState<string | null>(null);
  const requiresStrictValidation = requiresStrictPrescriptionValidation(form.medication_name);

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSuggestCareGuide = async () => {
    if (!form.medication_name.trim()) {
      setError("Completá al menos el nombre del medicamento para sugerir la guía");
      return;
    }
    setGeneratingGuide(true);
    setError(null);
    try {
      const response = await fetch("/api/doctors/prescriptions/suggest-care-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicationName: form.medication_name,
          dosage: form.dosage,
          instructions: form.instructions,
          diagnosis: form.diagnosis,
          patientName: form.patient_name || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error("Error al obtener la sugerencia de la guía de cuidado.");
      }
      const data = await response.json();
      setForm((prev) => ({
        ...prev,
        care_guide_tips: data.consejosToma ?? "",
        care_guide_forgotten: data.queHacerAnteOlvidos ?? "",
        care_guide_warnings: data.efectosEsperados ?? "",
        care_guide_lifestyle: data.recomendacionesClinicas ?? "",
      }));
      setShowGuideSection(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al conectar con la IA");
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
    if (!patientId) {
      if (!form.patient_name.trim()) {
        setError("El nombre del paciente es requerido");
        return;
      }
      if (!form.patient_dni.trim() && !form.patient_cuil.trim()) {
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
            dni: form.patient_dni.trim() || undefined,
            cuil: form.patient_cuil.trim() || undefined,
            address: form.patient_address.trim() || undefined,
            birth_date: form.patient_birth_date || undefined,
            gender: form.patient_gender || undefined,
          },
        };

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
          await issuePrescription(createdId as UUID);
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la prescripción");
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
                      DNI
                    </label>
                    <input
                      type="text"
                      value={form.patient_dni}
                      onChange={set("patient_dni")}
                      placeholder="30123456"
                      className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                      CUIL
                    </label>
                    <input
                      type="text"
                      value={form.patient_cuil}
                      onChange={set("patient_cuil")}
                      placeholder="27301234568"
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                      Fecha nacimiento
                    </label>
                    <input
                      type="date"
                      value={form.patient_birth_date}
                      onChange={set("patient_birth_date")}
                      className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
                      Sexo
                    </label>
                    <select
                      value={form.patient_gender}
                      onChange={set("patient_gender")}
                      className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm text-am-surface-900 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
                    >
                      <option value="">Sin especificar</option>
                      <option value="Femenino">Femenino</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                </div>
              </div>
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
              Metilfenidato y lisdexanfetamina quedan como borrador clinico hasta emitir soporte
              electronico verificable. Diagnostico y dosis son obligatorios.
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

          {/* Guía de Cuidado Personalizado (IA + Edición del Médico) */}
          <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4 space-y-4 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-teal-600 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                  Guía de Cuidado (Generada con IA)
                </span>
              </div>
              <button
                type="button"
                onClick={handleSuggestCareGuide}
                disabled={generatingGuide || !form.medication_name.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-semibold shadow-sm transition"
              >
                {generatingGuide ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {generatingGuide ? "Generando..." : "Sugerir con IA"}
              </button>
            </div>

            <p className="text-[11px] text-teal-700 leading-relaxed">
              Basado en el diagnóstico y la droga, la IA estructurará consejos prácticos para el paciente. <strong>Como médico, podés leer y editar el contenido antes de firmar la receta.</strong>
            </p>

            {showGuideSection && (
              <div className="space-y-3 pt-2 border-t border-teal-100/80 animate-fadeIn">
                <div>
                  <label className="block text-[11px] font-bold text-teal-800 mb-1">
                    1. Consejos de toma (Alimentos, horarios, interacciones)
                  </label>
                  <textarea
                    value={form.care_guide_tips}
                    onChange={set("care_guide_tips")}
                    placeholder="Consejos de toma..."
                    rows={3}
                    className="w-full rounded-lg border border-teal-100 bg-white px-3 py-2 text-xs text-am-surface-900 placeholder:text-am-surface-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-teal-800 mb-1">
                    2. Qué hacer ante olvidos (Instrucciones seguras sin pánico)
                  </label>
                  <textarea
                    value={form.care_guide_forgotten}
                    onChange={set("care_guide_forgotten")}
                    placeholder="Qué hacer ante olvidos..."
                    rows={2}
                    className="w-full rounded-lg border border-teal-100 bg-white px-3 py-2 text-xs text-am-surface-900 placeholder:text-am-surface-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-teal-800 mb-1">
                    3. Efectos esperados y alertas críticas (Cuándo ir a urgencias)
                  </label>
                  <textarea
                    value={form.care_guide_warnings}
                    onChange={set("care_guide_warnings")}
                    placeholder="Efectos esperados y alertas..."
                    rows={3}
                    className="w-full rounded-lg border border-teal-100 bg-white px-3 py-2 text-xs text-am-surface-900 placeholder:text-am-surface-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-teal-800 mb-1">
                    4. Recomendaciones clínicas y bienestar (Dieta, reposo, hábitos)
                  </label>
                  <textarea
                    value={form.care_guide_lifestyle}
                    onChange={set("care_guide_lifestyle")}
                    placeholder="Recomendaciones y hábitos saludables..."
                    rows={3}
                    className="w-full rounded-lg border border-teal-100 bg-white px-3 py-2 text-xs text-am-surface-900 placeholder:text-am-surface-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
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

          {/* Advertencia efectos secundarios */}
          <div>
            <label className="block text-xs font-semibold text-am-surface-700 mb-1.5">
              Advertencia efectos secundarios
            </label>
            <textarea
              value={form.side_effects_warning}
              onChange={set("side_effects_warning")}
              placeholder="Ej: Puede causar náuseas, consultar si persisten más de 48h"
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
