"use client";

import { useState, useEffect, useMemo } from "react";
import {
  X,
  FileText,
  Clock,
  Shield,
  EyeOff,
  CheckCircle2,
  Copy,
  AlertCircle,
  Loader2,
  Search,
  User,
} from "lucide-react";
import { useRealPatients } from "@/hooks/doctors/useRealPatients";

interface CertificateCreateModalProps {
  patientId?: string;
  patientName?: string;
  patientDni?: string;
  appointmentId?: string;
  countryCode?: "AR" | "BR";
  onClose: () => void;
  onCreated?: (certificate: CreatedCertificate) => void;
}

export interface CreatedCertificate {
  id: string;
  cuir: string;
  status: string;
  certificate_type: string;
  days_of_rest: number;
  start_date: string;
  end_date?: string | null;
  diagnosis?: string | null;
  country_code?: string;
  cid10_code?: string | null;
  cid_requested_by_patient?: boolean;
  hide_diagnosis: boolean;
  observations?: string | null;
  treatment?: string | null;
  qr_code_content?: string;
  created_at: string;
}

const CERTIFICATE_TYPES = [
  { id: "reposo_laboral", label: "Reposo Laboral", desc: "Licencia médica para empleador" },
  { id: "reposo_escolar", label: "Reposo Escolar", desc: "Justificación de inasistencia educativa" },
  { id: "aptitud_fisica", label: "Aptitud Física", desc: "Apto para actividad deportiva / escolar" },
  { id: "constancia_atencion", label: "Constancia de Atención", desc: "Certifica día y horario de consulta" },
  { id: "tratamiento", label: "Tratamiento Médico", desc: "Certificación de esquema terapéutico" },
  { id: "otro", label: "Otro Certificado", desc: "Atestado de propósito general" },
];

const QUICK_REST_CHIPS = [
  { label: "24 hs", days: 1 },
  { label: "48 hs", days: 2 },
  { label: "72 hs", days: 3 },
  { label: "5 días", days: 5 },
  { label: "7 días", days: 7 },
  { label: "14 días", days: 14 },
  { label: "30 días", days: 30 },
  { label: "Sin reposo", days: 0 },
];

const FREQUENT_DIAGNOSES = [
  "Cuadro de gastroenteritis aguda febril",
  "Infección respiratoria de vías aéreas superiores (Rinofaringitis)",
  "Lumbalgia aguda con contractura paravertebral",
  "Bronquitis aguda con compromiso ventilatorio leve",
  "Cefalea tensional / migrañosa severa",
  "Examen clínico y cardiovascular dentro de parámetros normales (Apto físico)",
  "Traumatismo articular leve con indicación de reposo",
];

function getTodayString(): string {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

function calculateEndDate(startDateStr: string, days: number): string | null {
  if (days <= 0) return null;
  const start = new Date(startDateStr + "T12:00:00");
  if (isNaN(start.getTime())) return null;
  start.setDate(start.getDate() + (days - 1));
  return start.toISOString().split("T")[0];
}

export function CertificateCreateModal({
  patientId: initialPatientId,
  patientName: initialPatientName,
  patientDni: initialPatientDni,
  appointmentId,
  countryCode = "AR",
  onClose,
  onCreated,
}: CertificateCreateModalProps) {
  const { patients, loading: loadingPatients } = useRealPatients();

  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId ?? "");
  const [patientSearch, setPatientSearch] = useState("");
  const [certType, setCertType] = useState("reposo_laboral");
  const [daysOfRest, setDaysOfRest] = useState(2);
  const [startDate, setStartDate] = useState(getTodayString());
  const [diagnosis, setDiagnosis] = useState("");
  const [treatment, setTreatment] = useState("");
  const [hideDiagnosis, setHideDiagnosis] = useState(countryCode === "BR");
  const [cid10Code, setCid10Code] = useState("");
  const [cidPatientRequested, setCidPatientRequested] = useState(false);
  const [observations, setObservations] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successCert, setSuccessCert] = useState<CreatedCertificate | null>(null);
  const [copiedCuir, setCopiedCuir] = useState(false);
  const [review, setReview] = useState<{
    snapshotHash: string; confirmation: string; certificate: CreatedCertificate; patientName: string;
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reviewRevision, setReviewRevision] = useState(0);

  useEffect(() => {
    if (successCert?.status !== 'draft' || countryCode === 'BR') return;
    let active = true;
    void fetch(`/api/doctors/certificates/${successCert.id}/issue`, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error?.message || 'No se pudo revisar el certificado');
        if (active && result.data.status === 'signed') {
          setSuccessCert(result.data.certificate);
          onCreated?.(result.data.certificate);
        }
        if (active && result.data.status === 'draft') {
          setReview(result.data);
          setConfirmed(false);
        }
      }).catch(error => { if (active) setErrorMsg(error.message); });
    return () => { active = false; };
  }, [successCert, reviewRevision, onCreated, countryCode]);

  const handleIssue = async () => {
    if (!successCert || !review || !confirmed || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const response = await fetch(`/api/doctors/certificates/${successCert.id}/issue`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true, snapshotHash: review.snapshotHash }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || 'No se pudo emitir el certificado');
      setSuccessCert(result.data);
      onCreated?.(result.data);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'No se pudo emitir el certificado');
      setConfirmed(false);
      setReview(null);
      setReviewRevision(value => value + 1);
    } finally { setSubmitting(false); }
  };

  // Focus trap and esc listener
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients.slice(0, 10);
    const query = patientSearch.toLowerCase().trim();
    return patients.filter((p) => {
      const name = `${p.profile?.first_name ?? ""} ${p.profile?.last_name ?? ""}`.toLowerCase();
      const dni = p.dni ? String(p.dni).toLowerCase() : "";
      return name.includes(query) || dni.includes(query);
    });
  }, [patients, patientSearch]);

  const selectedPatient = useMemo(() => {
    return patients.find((p) => p.id === selectedPatientId);
  }, [patients, selectedPatientId]);

  const resolvedPatientName = initialPatientName ?? (selectedPatient ? `${selectedPatient.profile?.first_name ?? ""} ${selectedPatient.profile?.last_name ?? ""}`.trim() : "");
  const resolvedPatientDni = initialPatientDni ?? selectedPatient?.dni ?? "";

  const calculatedEndDate = useMemo(() => {
    return calculateEndDate(startDate, daysOfRest);
  }, [startDate, daysOfRest]);

  const handleSelectQuickDays = (days: number) => {
    setDaysOfRest(days);
  };

  const handleSelectDiagnosisChip = (diag: string) => {
    setDiagnosis(diag);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) {
      setErrorMsg("Debe seleccionar un paciente para guardar el borrador.");
      return;
    }

    if (daysOfRest > 0 && !diagnosis.trim()) {
      setErrorMsg("Debe ingresar el diagnóstico clínico para un certificado de reposo.");
      return;
    }

    if (countryCode === "BR" && cid10Code.trim() && !cidPatientRequested) {
      setErrorMsg("O CID-10 só pode constar do atestado mediante solicitação e concordância expressa do paciente.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        patient_id: selectedPatientId,
        appointment_id: appointmentId ?? null,
        certificate_type: certType,
        days_of_rest: daysOfRest,
        start_date: startDate,
        end_date: calculatedEndDate,
        diagnosis: diagnosis.trim() || null,
        treatment: treatment.trim() || null,
        hide_diagnosis: countryCode === "BR" ? true : hideDiagnosis,
        cid10_code: countryCode === "BR" ? cid10Code.trim().toUpperCase() || null : null,
        cid_requested_by_patient: countryCode === "BR" && Boolean(cid10Code.trim()) && cidPatientRequested,
        observations: observations.trim() || null,
        country_code: countryCode,
      };

      const res = await fetch("/api/doctors/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error?.message || json.error || "Error al emitir el atestado");
      }

      const cert = json.data ?? json;
      setSuccessCert(cert);
      if (onCreated) onCreated(cert);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error inesperado al emitir el atestado");
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCuir(true);
      setTimeout(() => setCopiedCuir(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {countryCode === "BR" ? "Atestado médico do Brasil" : "Certificado médico de Argentina"}
              </h2>
              <p className="text-xs text-slate-400">
                {countryCode === 'BR' ? 'Rascunho para revisão e assinatura qualificada do médico' : 'Firma electrónica con firma y sello del profesional'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {successCert ? (
            /* Success View */
            <div className="py-6 flex flex-col items-center text-center space-y-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-500/20 text-teal-400 border border-teal-500/30">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{successCert.status === "signed" ? "Certificado emitido" : countryCode === "BR" ? "Rascunho do atestado salvo" : "Revisar certificado"}</h3>
                <p className="text-sm text-slate-400 mt-1 max-w-md">
                  {successCert.status === "signed" ? "Emitido con su firma electrónica y sello. El paciente puede consultar el documento en la aplicación." : countryCode === "BR" ? "O CID-10 solicitado foi registrado no rascunho. Este documento ainda NÃO está assinado e não é válido para apresentar ao empregador." : "Revise los datos y confirme personalmente la aplicación de su firma y sello."}
                </p>
              </div>

              {/* CUIR Box */}
              <div className="w-full rounded-xl border border-teal-500/30 bg-teal-950/30 p-4 text-left">
                <div className="text-xs font-semibold uppercase tracking-wider text-teal-400">
                  Referencia de AutaMedica
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono text-base font-bold text-white tracking-wide">
                    {successCert.cuir}
                  </span>
                  <button
                    onClick={() => copyToClipboard(successCert.cuir)}
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600/30 px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-teal-600/50 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiedCuir ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>

              {errorMsg && <p role="alert" className="text-sm text-rose-300">{errorMsg}</p>}
              {successCert.status === 'draft' && countryCode === 'BR' && (
                <a href={`/api/doctors/certificates/${successCert.id}/pdf`} target="_blank" rel="noopener noreferrer" className="underline">Visualizar rascunho com marca d'água</a>
              )}
              {successCert.status === 'draft' && countryCode !== 'BR' && (
                <button type="button" disabled={submitting} className="underline text-sm"
                  onClick={() => { setConfirmed(false); setReview(null); setReviewRevision(value => value + 1); }}>
                  Actualizar revisión
                </button>
              )}
              {review && successCert.status === 'draft' && countryCode !== 'BR' && (
                <div className="w-full space-y-4 text-left text-sm">
                  <p><strong>Paciente:</strong> {review.patientName}</p>
                  <p><strong>Período:</strong> {review.certificate.start_date} — {review.certificate.end_date || 'Sin reposo'} ({review.certificate.days_of_rest} días)</p>
                  <p><strong>Diagnóstico:</strong> {review.certificate.diagnosis || 'Sin diagnóstico'}</p>
                  <p><strong>Incluir diagnóstico en PDF:</strong> {review.certificate.hide_diagnosis ? 'No' : 'Sí'}</p>
                  <p><strong>Tratamiento:</strong> {review.certificate.treatment || 'Sin tratamiento registrado'}</p>
                  <p><strong>Observaciones:</strong> {review.certificate.observations || 'Sin observaciones'}</p>
                  <a href={`/api/doctors/certificates/${successCert.id}/pdf`} target="_blank" rel="noopener noreferrer" className="underline">Revisar PDF del borrador</a>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" checked={confirmed} disabled={submitting} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />
                    <span>{review.confirmation}</span>
                  </label>
                  <button type="button" onClick={() => void handleIssue()} disabled={!confirmed || submitting}
                    className="w-full rounded-xl bg-teal-600 p-3 font-semibold disabled:opacity-50">
                    {submitting ? 'Emitiendo…' : 'Confirmar firma electrónica y emitir'}
                  </button>
                </div>
              )}
              {successCert.status === 'signed' && (
                <a href={`/api/doctors/certificates/${successCert.id}/pdf`} target="_blank" rel="noopener noreferrer" className="underline">Descargar certificado PDF</a>
              )}
              <p className="text-xs text-slate-400">Firma electrónica. La referencia es interna de AutaMedica.</p>

              <div className="flex gap-3 w-full pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 transition-colors"
                >
                  Listo
                </button>
              </div>
            </div>
          ) : (
            /* Form View */
            <form id="certificate-form" onSubmit={handleSubmit} className="space-y-5">
              {errorMsg && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-950/50 border border-rose-800/50 p-3.5 text-xs text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Patient Selector */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
                  Paciente Destinatario
                </label>
                {initialPatientId ? (
                  <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-teal-400">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-white">{resolvedPatientName || "Paciente asignado"}</div>
                        {resolvedPatientDni && (
                          <div className="text-xs text-slate-400">DNI: {resolvedPatientDni}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar paciente por nombre o DNI..."
                        value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                    {loadingPatients ? (
                      <div className="flex items-center justify-center p-3 text-xs text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Cargando pacientes...
                      </div>
                    ) : (
                      <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40 p-1 space-y-1">
                        {filteredPatients.map((p) => {
                          const isSelected = selectedPatientId === p.id;
                          const name = `${p.profile?.first_name ?? ""} ${p.profile?.last_name ?? ""}`.trim() || "Sin nombre";
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedPatientId(p.id)}
                              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                                isSelected
                                  ? "bg-teal-600/20 border border-teal-500/40 text-teal-300"
                                  : "hover:bg-slate-800/80 text-slate-300"
                              }`}
                            >
                              <span className="font-medium text-white">{name}</span>
                              <span className="text-slate-400">{p.dni ? `DNI: ${p.dni}` : ""}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Certificate Type */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
                  Tipo de Atestado
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CERTIFICATE_TYPES.map((t) => {
                    const isSelected = certType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setCertType(t.id)}
                        className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "border-teal-500 bg-teal-500/10 text-white shadow-sm"
                            : "border-slate-800 bg-slate-800/40 hover:bg-slate-800 text-slate-300"
                        }`}
                      >
                        <span className={`text-xs font-bold ${isSelected ? "text-teal-400" : "text-white"}`}>
                          {t.label}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{t.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Days of Rest & Dates */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                    <Clock className="h-4 w-4 text-teal-400" />
                    Período de Reposo Indicado
                  </div>
                  <span className="text-xs font-bold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                    {daysOfRest === 0 ? "Sin reposo" : `${daysOfRest} día(s)`}
                  </span>
                </div>

                {/* Quick Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_REST_CHIPS.map((chip) => {
                    const isSelected = daysOfRest === chip.days;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => handleSelectQuickDays(chip.days)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          isSelected
                            ? "bg-teal-600 text-white font-bold"
                            : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Fecha de Inicio del Reposo
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Fecha de Reincorporación Estimada
                    </label>
                    <div className="flex items-center h-[38px] rounded-xl border border-slate-800 bg-slate-900/60 px-3 text-xs text-slate-300">
                      {calculatedEndDate ? (
                        <span className="font-semibold text-teal-300">
                          {calculatedEndDate} (inclusive)
                        </span>
                      ) : (
                        <span className="text-slate-500">Inmediata (Sin reposo)</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Diagnosis */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
                  Diagnóstico Clínico / Cuadro
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Cuadro infeccioso respiratorio agudo con indicación de reposo..."
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none disabled:opacity-50"
                />

                {/* Frequent Diagnosis Chips */}
                {!hideDiagnosis && countryCode !== "BR" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {FREQUENT_DIAGNOSES.map((diag) => (
                      <button
                        key={diag}
                        type="button"
                        onClick={() => handleSelectDiagnosisChip(diag)}
                        className="rounded-lg bg-slate-800/80 hover:bg-slate-700 px-2 py-0.5 text-[11px] text-slate-300 transition-colors line-clamp-1 max-w-[280px] text-left"
                      >
                        {diag}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Medical Secret Switch */}
              {countryCode !== "BR" && <div className="flex items-start justify-between rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 mt-0.5">
                    <EyeOff className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Preservar Secreto Médico</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      El diagnóstico no se publica en el QR. El PDF clínico privado podrá contener datos sensibles; su entrega requiere autorización.
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={hideDiagnosis}
                  onChange={(e) => setHideDiagnosis(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-700 bg-slate-800 text-teal-600 focus:ring-teal-500"
                />
              </div>}

              {countryCode === "BR" && (
                <div className="rounded-xl border border-teal-700/50 bg-teal-950/30 p-4 space-y-3">
                  <label className="block text-xs font-semibold text-teal-200">CID-10 (opcional, a pedido do paciente)</label>
                  <input type="text" value={cid10Code}
                    onChange={(e) => { setCid10Code(e.target.value.toUpperCase()); setCidPatientRequested(false); }}
                    placeholder="Ex.: J06.9" maxLength={8}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                  <label className="flex items-start gap-2 text-xs text-slate-200">
                    <input type="checkbox" checked={cidPatientRequested} disabled={!cid10Code.trim()}
                      onChange={(e) => setCidPatientRequested(e.target.checked)} className="mt-1" />
                    <span>Confirmo que o(a) paciente ou representante legal solicitou e concordou expressamente com a inclusão deste CID-10, após esclarecimento sobre privacidade, e que registrei essa manifestação na ficha clínica.</span>
                  </label>
                  <p className="text-[11px] text-slate-400">CFM 2.381/2024, art. 5º, §§ 3º e 4º. A exigência do empregador, isoladamente, não autoriza a divulgação. O médico determina o CID.</p>
                </div>
              )}

              {/* Treatment indicated for rest certificates */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
                  Tratamiento Indicado
                </label>
                <textarea
                  rows={2}
                  placeholder="Conducta terapéutica indicada por el profesional..."
                  value={treatment}
                  onChange={(e) => setTreatment(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
                />
              </div>

              {/* Observations */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
                  Observaciones e Indicaciones Generales (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Mantener hidratación abundante, control de temperatura..."
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
                />
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        {!successCert && (
          <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/90 px-6 py-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Shield className="h-4 w-4 text-teal-400" />
              <span>{countryCode === 'BR' ? 'Salvar rascunho; assinatura médica obrigatória' : 'Primero revisar; luego confirmar la firma'}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="certificate-form"
                disabled={submitting || !selectedPatientId}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50 transition-colors shadow-lg shadow-teal-600/20"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Emitiendo...
                  </>
                ) : (
                  "Guardar y revisar"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

