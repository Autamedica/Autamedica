"use client";

import { useState } from "react";
import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import {
  CLARIFICATION_CATEGORY_LABEL,
  useClarifications,
  type DoctorClarification,
} from "@/hooks/doctors/useClarifications";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  FileQuestion,
  Pill,
  RefreshCw,
  Send,
  X,
} from "lucide-react";

function formatShortDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function categoryLabel(category: string | null): string {
  if (!category) return "Consulta de farmacia";
  return CLARIFICATION_CATEGORY_LABEL[category] ?? "Consulta de farmacia";
}

export function DoctorsClarificationsPage() {
  const { clarifications, loading, error, refresh, respond } = useClarifications();
  const [responding, setResponding] = useState<DoctorClarification | null>(null);
  const [responseText, setResponseText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justRespondedId, setJustRespondedId] = useState<string | null>(null);

  const openRespond = (clarification: DoctorClarification) => {
    setResponding(clarification);
    setResponseText("");
    setSubmitError(null);
  };

  const submitResponse = async () => {
    if (!responding || responseText.trim().length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await respond(responding.prescription_id, responding.id, responseText.trim());
      setJustRespondedId(responding.id);
      setResponding(null);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo enviar la aclaración.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DoctorsPortalFrame
      title="Aclaraciones de farmacia"
      description="Respuestas a las consultas de farmacia antes de dispensar una receta."
      activeSection="consultations"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-medium text-neutral-900">
              <FileQuestion className="h-5 w-5 text-amber-500" strokeWidth={1.5} />
              En espera de respuesta
              {clarifications.length > 0 && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                  {clarifications.length}
                </span>
              )}
            </h2>
            <p className="mt-1 text-[13px] text-neutral-400">
              Confirmá la pauta para que la farmacia pueda dispensar la receta.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-[13px] font-medium text-neutral-700 transition-colors hover:border-neutral-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-neutral-200/60 bg-neutral-100" />
            ))}
          </div>
        ) : clarifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-20">
            <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-200" strokeWidth={1} />
            <p className="text-sm font-medium text-neutral-600">No hay aclaraciones pendientes.</p>
            <p className="mt-1 text-[13px] text-neutral-400">
              Cuando una farmacia necesite confirmar una pauta, aparece acá.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {clarifications.map((clarification) => {
              const responded = justRespondedId === clarification.id;
              return (
                <div
                  key={clarification.id}
                  className={`rounded-xl border bg-white p-5 ${
                    responded ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200/70"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                          {categoryLabel(clarification.question_category)}
                        </span>
                        {clarification.pharmacy_name && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-neutral-500">
                            <Building2 className="h-3.5 w-3.5" />
                            {clarification.pharmacy_name}
                          </span>
                        )}
                      </div>

                      <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                        <Pill className="h-4 w-4 shrink-0 text-neutral-400" strokeWidth={1.5} />
                        {clarification.medication}
                      </p>

                      <p className="text-[13px] leading-relaxed text-neutral-600">
                        {clarification.question}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-400">
                        <span>
                          Pedida el {formatShortDate(clarification.requested_at) ?? "fecha desconocida"}
                        </span>
                        {clarification.expires_at && (
                          <span>Vence el {formatShortDate(clarification.expires_at)}</span>
                        )}
                        <span className="uppercase tracking-wide">Receta #{clarification.prescription_id.slice(0, 8)}</span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {responded ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          Aclaración enviada
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openRespond(clarification)}
                          className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800"
                        >
                          Responder
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {responding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">Responder aclaración</h3>
                  <p className="mt-1 text-[13px] text-neutral-500">
                    {responding.medication} · {responding.pharmacy_name ?? "Farmacia"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setResponding(null)}
                  className="rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                  {categoryLabel(responding.question_category)}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-700">{responding.question}</p>
              </div>

              <label htmlFor="clarify-response" className="mt-4 block text-[12px] font-semibold text-neutral-700">
                Tu respuesta al farmacéutico
              </label>
              <textarea
                id="clarify-response"
                rows={4}
                value={responseText}
                onChange={(event) => setResponseText(event.target.value)}
                placeholder="Ej: Confirma la dosis indicada en la receta original."
                className="mt-2 w-full resize-none rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900"
              />

              {submitError && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {submitError}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setResponding(null)}
                  className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-[13px] font-medium text-neutral-700 transition-colors hover:border-neutral-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submitResponse()}
                  disabled={submitting || responseText.trim().length === 0}
                  className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Enviando..." : "Enviar respuesta"}
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DoctorsPortalFrame>
  );
}