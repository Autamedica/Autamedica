'use client';

import { useCallback, useState } from 'react';
import { AuthProvider, useAuth } from '@autamedica/auth/react';
import { logger } from '@autamedica/shared';
import type { SOAPReport } from '@autamedica/types';

interface PostConsultationReportProps {
  roomId: string;
}

interface ReportData {
  recordId: string;
  report: SOAPReport;
  chiefComplaint: string | null;
  differentialDiagnosis: string[];
  followUpRecommendations: string[];
  confidence: number;
  provider: string;
}

export default function PostConsultationReport({ roomId }: PostConsultationReportProps) {
  return (
    <AuthProvider onAuthStateChange={() => {}}>
      <ReportContent roomId={roomId} />
    </AuthProvider>
  );
}

function ReportContent({ roomId }: { roomId: string }) {
  const { loading: authLoading } = useAuth();
  const [doctorNotes, setDoctorNotes] = useState('');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [editedReport, setEditedReport] = useState<SOAPReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReport = useCallback(async () => {
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/doctors/consultations/${roomId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorNotes: doctorNotes || null }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.error === 'unauthorized' ? 'Sesión expirada' : 'Error al generar reporte');
        return;
      }

      setReportData(json.data as ReportData);
      setEditedReport((json.data as ReportData).report);
    } catch (err) {
      logger.error('[PostConsultationReport] Generate error', err);
      setError('Error de conexión');
    } finally {
      setGenerating(false);
    }
  }, [roomId, doctorNotes]);

  const saveReportAndRedirect = useCallback(async () => {
    if (!editedReport || !reportData) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/doctors/consultations/${roomId}/report`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: reportData.recordId,
          report: editedReport,
          doctorNotes,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        logger.warn('[PostConsultationReport] Save returned non-OK', json);
      }

      setSaved(true);
      setTimeout(() => {
        window.location.href = '/doctors/schedule';
      }, 1500);
    } catch (err) {
      logger.error('[PostConsultationReport] Save error', err);
      setError('Error al guardar el reporte');
    } finally {
      setSaving(false);
    }
  }, [editedReport, reportData, roomId, doctorNotes]);

  const updateField = useCallback((field: keyof SOAPReport, value: string) => {
    setEditedReport(prev => prev ? { ...prev, [field]: value } : null);
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-am-surface-50 flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-am-surface-300 border-t-am-doctor-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-am-surface-50 text-am-surface-800">
      {/* Header */}
      <header className="border-b border-am-surface-200 bg-white shadow-am-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-am-surface-900">Reporte de consulta</h1>
            <p className="text-xs text-am-surface-400 mt-0.5">Sala {roomId}</p>
          </div>
          <div className="flex items-center gap-3">
            {saved ? (
              <span className="flex items-center gap-2 text-sm text-am-doctor-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Guardado
              </span>
            ) : (
              <a
                href="/doctors/schedule"
                className="text-sm text-am-surface-500 hover:text-am-surface-700 transition-colors"
              >
                Omitir
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Doctor Notes */}
        {!reportData && (
          <section>
            <label className="block text-sm font-medium text-am-surface-700 mb-2">
              Notas del doctor (opcional)
            </label>
            <textarea
              value={doctorNotes}
              onChange={(e) => setDoctorNotes(e.target.value)}
              placeholder="Impresiones diagnósticas, indicaciones adicionales, observaciones..."
              className="w-full h-32 bg-white border border-am-surface-200 rounded-xl shadow-am-sm px-4 py-3 text-sm text-am-surface-800 placeholder:text-am-surface-400 focus:outline-none focus:ring-1 focus:ring-am-doctor-500 focus:border-am-doctor-500 resize-none"
            />
            <p className="text-xs text-am-surface-400 mt-1.5">
              Estas notas se integrarán con la transcripción y anamnesis para generar el reporte SOAP.
            </p>
          </section>
        )}

        {/* Generate Button */}
        {!reportData && (
          <button
            onClick={generateReport}
            disabled={generating}
            className="w-full py-3 rounded-xl shadow-am-sm text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-am-primary-600 hover:bg-am-primary-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generando reporte con IA...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Generar reporte SOAP
              </>
            )}
          </button>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl shadow-am-sm bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Report */}
        {editedReport && reportData && (
          <>
            {/* Chief Complaint */}
            {reportData.chiefComplaint && (
              <div className="rounded-xl shadow-am-sm bg-white border border-am-surface-200 p-4">
                <h3 className="text-xs font-semibold text-am-surface-500 uppercase tracking-wider mb-1">
                  Motivo de consulta
                </h3>
                <p className="text-sm text-am-surface-900">{reportData.chiefComplaint}</p>
              </div>
            )}

            {/* SOAP Sections */}
            <div className="space-y-6">
              <SOAPSection
                label="S — Subjetivo"
                description="Motivo de consulta, relato del paciente, síntomas referidos"
                value={editedReport.subjective}
                onChange={(v) => updateField('subjective', v)}
              />
              <SOAPSection
                label="O — Objetivo"
                description="Hallazgos del examen, signos vitales, estudios complementarios"
                value={editedReport.objective}
                onChange={(v) => updateField('objective', v)}
              />
              <SOAPSection
                label="A — Evaluación"
                description="Impresión clínica, diagnósticos diferenciales"
                value={editedReport.assessment}
                onChange={(v) => updateField('assessment', v)}
              />
              <SOAPSection
                label="P — Plan"
                description="Tratamiento, estudios, derivaciones, seguimiento"
                value={editedReport.plan}
                onChange={(v) => updateField('plan', v)}
              />
            </div>

            {/* Differential Diagnosis */}
            {reportData.differentialDiagnosis.length > 0 && (
              <div className="rounded-xl shadow-am-sm bg-white border border-am-surface-200 p-4">
                <h3 className="text-xs font-semibold text-am-surface-500 uppercase tracking-wider mb-2">
                  Diagnósticos diferenciales
                </h3>
                <ul className="space-y-1">
                  {reportData.differentialDiagnosis.map((dx, i) => (
                    <li key={i} className="text-sm text-am-surface-700 flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-am-surface-400 shrink-0" />
                      {dx}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Follow-up */}
            {reportData.followUpRecommendations.length > 0 && (
              <div className="rounded-xl shadow-am-sm bg-white border border-am-surface-200 p-4">
                <h3 className="text-xs font-semibold text-am-surface-500 uppercase tracking-wider mb-2">
                  Seguimiento
                </h3>
                <ul className="space-y-1">
                  {reportData.followUpRecommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-am-surface-700 flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-am-doctor-600 shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center justify-between text-xs text-am-surface-400 pt-2 border-t border-am-surface-200">
              <span>
                Generado por IA ({reportData.provider}) · Confianza: {reportData.confidence}%
              </span>
              <span>Revisado por el doctor antes de guardar</span>
            </div>

            {/* Save */}
            <div className="flex gap-3 pt-4">
              <a
                href="/doctors/schedule"
                className="flex-1 py-3 rounded-xl shadow-am-sm text-sm font-medium text-center text-am-surface-500 bg-white border border-am-surface-200 hover:bg-am-surface-100 transition-colors"
              >
                Descartar
              </a>
              <button
                onClick={saveReportAndRedirect}
                disabled={saving || saved}
                className="flex-1 py-3 rounded-xl shadow-am-sm text-sm font-medium text-white bg-am-primary-600 hover:bg-am-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : saved ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Guardado
                  </>
                ) : (
                  'Guardar reporte'
                )}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function SOAPSection({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <h3 className="text-sm font-semibold text-am-surface-900">{label}</h3>
        <span className="text-[10px] text-am-surface-400">{description}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full bg-white border border-am-surface-200 rounded-xl shadow-am-sm px-4 py-3 text-sm text-am-surface-800 focus:outline-none focus:ring-1 focus:ring-am-doctor-500 focus:border-am-doctor-500 resize-y leading-relaxed"
      />
    </div>
  );
}
