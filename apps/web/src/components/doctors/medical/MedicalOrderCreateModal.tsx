/**
 * Modal to create or edit a medical study order (exámenes/estudios complementarios) from the doctor portal.
 * Designed to look premium and highly interactive.
 */
"use client";

import { useEffect, useState } from "react";
import { X, FileText, Save, Loader2, Plus, Trash2, ShieldAlert } from "lucide-react";
import type { MedicalOrder, UUID, MedicalOrderStudyType, MedicalOrderPractice, MedicalOrderStatus } from "@/types/medical";

interface MedicalOrderCreateModalProps {
  patientId?: UUID;
  onClose: () => void;
  onSaved: () => void;
  addMedicalOrder: (
    o: Omit<MedicalOrder, "id" | "created_at" | "updated_at" | "patient_id"> & {
      patient_id?: UUID;
    },
  ) => Promise<MedicalOrder>;
  updateMedicalOrder: (id: UUID, updates: Partial<MedicalOrder>) => Promise<void>;
  editingMedicalOrder?: MedicalOrder | null;
  issueMedicalOrder?: (id: UUID) => Promise<void>;
  submitLabel?: string;
}

export function MedicalOrderCreateModal({
  patientId,
  onClose,
  onSaved,
  addMedicalOrder,
  updateMedicalOrder,
  editingMedicalOrder,
  issueMedicalOrder,
  submitLabel = "Emitir orden",
}: MedicalOrderCreateModalProps) {
  const isEditing = !!editingMedicalOrder;

  const [studyType, setStudyType] = useState<MedicalOrderStudyType>(
    editingMedicalOrder?.study_type ?? "laboratory"
  );
  const [practices, setPractices] = useState<MedicalOrderPractice[]>(
    editingMedicalOrder?.practices ?? []
  );
  const [practiceInput, setPracticeInput] = useState("");
  const [diagnosis, setDiagnosis] = useState(editingMedicalOrder?.diagnosis ?? "");
  const [notes, setNotes] = useState(editingMedicalOrder?.notes ?? "");
  
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Focus modal trap
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleAddPractice = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = practiceInput.trim();
    if (!trimmed) return;
    
    // Avoid duplicates
    if (practices.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setPracticeInput("");
      return;
    }

    setPractices([...practices, { name: trimmed }]);
    setPracticeInput("");
  };

  const handleRemovePractice = (index: number) => {
    setPractices(practices.filter((_, i) => i !== index));
  };

  const handleSubmit = async (shouldIssueDirectly: boolean) => {
    if (practices.length === 0) {
      setErrorMessage("Debe agregar al menos una práctica a solicitar.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      let savedOrder: MedicalOrder;

      const payload = {
        study_type: studyType,
        practices,
        diagnosis: diagnosis.trim() || null,
        notes: notes.trim() || null,
        status: "draft" as MedicalOrderStatus,
      };

      if (isEditing && editingMedicalOrder) {
        await updateMedicalOrder(editingMedicalOrder.id, payload);
        savedOrder = { ...editingMedicalOrder, ...payload } as MedicalOrder;
      } else {
        savedOrder = await addMedicalOrder({
          ...payload,
          patient_id: patientId,
        } as Parameters<typeof addMedicalOrder>[0]);
      }

      if (shouldIssueDirectly && issueMedicalOrder) {
        await issueMedicalOrder(savedOrder.id);
      }

      onSaved();
    } catch (err) {
      console.error("[MedicalOrderCreateModal] submit error:", err);
      setErrorMessage(
        err instanceof Error && err.message === "only_draft_orders_can_be_issued"
          ? "La solicitud debe guardarse como borrador antes de emitirse."
          : err instanceof Error
            ? err.message
            : "Error inesperado al guardar la orden médica."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div 
        className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] border border-slate-100"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 bg-gradient-to-br from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-am-doctor-50 text-am-doctor-700">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isEditing ? "Editar Solicitud de Estudio" : "Solicitud de Estudio Médico"}
              </h2>
              <p className="text-xs text-slate-500 font-medium">Completa los datos del examen</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            title="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 scrollbar-thin scrollbar-thumb-slate-200">
          
          {errorMessage && (
            <div className="rounded-2xl bg-red-50 border border-red-100 p-4 flex items-start gap-3 text-red-800">
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-red-600" />
              <p className="text-sm font-medium leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {/* 1. Category */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
              Tipo de Estudio / Examen
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["laboratory", "imaging", "cardiology", "other"] as MedicalOrderStudyType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setStudyType(type)}
                  className={`py-3 px-2 text-center rounded-2xl border text-xs font-bold transition-all capitalize shadow-sm ${
                    studyType === type
                      ? "bg-am-doctor-600 border-am-doctor-600 text-white shadow-am-sm"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {type === "laboratory" ? "Laboratorio" :
                   type === "imaging" ? "Imágenes" :
                   type === "cardiology" ? "Cardiología" : "Otro"}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Add Practices */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
              Prácticas o Determinaciones solicitadas
            </label>
            
            <form onSubmit={handleAddPractice} className="flex gap-2">
              <input
                type="text"
                value={practiceInput}
                onChange={(e) => setPracticeInput(e.target.value)}
                placeholder="Ej. Hemograma completo, Resonancia lumbar..."
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:outline-none focus:ring-2 focus:ring-am-doctor-500/20 focus:border-am-doctor-500 shadow-sm"
              />
              <button
                type="submit"
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 px-4 rounded-2xl flex items-center gap-1 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Agregar</span>
              </button>
            </form>

            {/* Practices List */}
            <div className="mt-3 space-y-2">
              {practices.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-slate-400">
                  <p className="text-xs font-medium">No has agregado ninguna práctica clínica aún.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  {practices.map((practice, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50/50 transition-colors"
                    >
                      <span className="text-sm font-semibold text-slate-800">{practice.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePractice(index)}
                        className="text-slate-400 hover:text-red-600 rounded p-1 transition-colors"
                        title="Eliminar práctica"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 3. Diagnosis */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
              Diagnóstico Presuntivo (CIE-10 o Clínico)
            </label>
            <input
              type="text"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="Ej. R51 Cefalea / Control evolutivo..."
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:outline-none focus:ring-2 focus:ring-am-doctor-500/20 focus:border-am-doctor-500 shadow-sm"
            />
            <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
              Requerido por obras sociales y medicinas prepagas para autorizar las prácticas.
            </p>
          </div>

          {/* 4. Notes / Instructions */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
              Indicaciones Clínicas / Preparación
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Requiere 12 horas de ayuno / Traer estudios anteriores..."
              className="w-full h-24 resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:outline-none focus:ring-2 focus:ring-am-doctor-500/20 focus:border-am-doctor-500 shadow-sm leading-relaxed"
            />
          </div>

        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-3 border border-slate-200 hover:bg-slate-100 bg-white text-slate-700 rounded-2xl text-xs font-bold transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={submitting}
            className="flex-1 py-3 bg-am-doctor-600 hover:bg-am-doctor-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-am-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Firmando...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>{submitLabel}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
