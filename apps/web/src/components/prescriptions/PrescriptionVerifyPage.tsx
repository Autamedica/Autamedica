'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api-client';
import { logger } from '@autamedica/shared';

interface VerifyResult {
  valid: boolean;
  reason?: string;
  documentType?: 'prescription' | 'certificate';
  prescription: {
    cuir: string;
    status: string;
    countryCode?: string;
    medication: string;
    dosage: string;
    quantity: number;
    diagnosis: string;
    prescriberName: string;
    prescriberLicense: string;
    patientName: string;
    issuedAt: string;
    pdfUrl: string | null;
    qrContent: string | null;
  } | null;
  certificate?: {
    cuir: string;
    status: string;
    countryCode?: string;
    certificateType: string;
    signatureLabel?: string;
    signatureMethod?: string;
    daysOfRest: number;
    startDate: string;
    endDate: string | null;
    diagnosis: string | null;
    observations: string | null;
    prescriberName: string;
    prescriberLicense: string;
    patientName: string;
    patientDni?: string;
    issuedAt: string;
    pdfUrl: string | null;
    qrContent: string | null;
  } | null;
}

const CERT_TYPE_LABELS: Record<string, string> = {
  reposo_laboral: 'Certificado de Reposo Laboral',
  reposo_escolar: 'Certificado de Reposo Escolar',
  aptitud_fisica: 'Certificado de Aptitud Física',
  constancia_atencion: 'Constancia de Atención Médica',
  tratamiento: 'Certificado de Tratamiento Prolongado',
  otro: 'Certificado Médico',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-700' },
  signed: { label: 'Firmada / Válida', color: 'bg-blue-100 text-blue-700' },
  sent: { label: 'Emitida', color: 'bg-sky-100 text-sky-700' },
  dispensed_partial: { label: 'Parcialmente dispensada', color: 'bg-amber-100 text-amber-700' },
  dispensed_total: { label: 'Dispensada', color: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-700' },
  expired: { label: 'Expirada', color: 'bg-gray-200 text-gray-500' },
};

function getLegalFooter(countryCode?: string): string {
  if (countryCode === 'BR') {
    return 'Verificado por AutaMedica · Resolução CFM nº 2.299/2021 & Lei 14.510/2022 (Brasil)';
  }
  if (countryCode === 'UY') {
    return 'Verificado por AutaMedica · Ley nº 18.600 & Decreto 242/017 MSP (Uruguay)';
  }
  return 'Verificado por AutaMedica · Ley 27.553 & Decreto 63/2024 (Argentina)';
}

export function PrescriptionVerifyPage({ cuir }: { cuir: string }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const verify = useCallback(async () => {
    try {
      const data = await fetchApi<VerifyResult>(`/api/verify/${cuir}`);
      setResult(data);
    } catch (err) {
      logger.error('[PrescriptionVerify] Error', err);
      setResult({ valid: false, prescription: null, certificate: null });
    } finally {
      setLoading(false);
    }
  }, [cuir]);

  useEffect(() => { void verify(); }, [verify]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50 flex items-center justify-center">
        <div className="text-center">
          <div className="h-10 w-10 border-2 border-slate-200 border-t-sky-500 rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-sm text-slate-500">Verificando documento digital...</p>
        </div>
      </div>
    );
  }

  if (!result?.valid || (!result.prescription && !result.certificate)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-red-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-red-100 p-8 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">{result?.reason === "certificate_not_verified" ? "Certificado no verificado" : "Documento no encontrado"}</h1>
          <p className="text-sm text-slate-500 mb-1">CUIR: <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">{cuir}</code></p>
          <p className="text-sm text-slate-500">{result?.reason === "certificate_not_verified" ? "Este documento está pendiente de firma verificable o no puede presentarse como certificado válido." : "Este identificador no corresponde a ninguna receta ni certificado registrado en AutaMedica."}</p>
          <a href="/" className="mt-6 inline-block text-sm text-sky-600 hover:text-sky-700 font-medium">Ir al inicio</a>
        </div>
      </div>
    );
  }

  // Render Certificate
  if (result.certificate) {
    const cert = result.certificate;
    const statusDisplay = cert.signatureMethod === 'electronic_verified'
      ? { label: 'Emitido con firma electrónica', color: 'bg-blue-100 text-blue-700' }
      : STATUS_LABELS[cert.status] ?? STATUS_LABELS.signed;
    const certTitle = CERT_TYPE_LABELS[cert.certificateType] ?? 'Certificado Médico';

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl border border-sky-100 overflow-hidden">
          {/* Header */}
          <div className="bg-slate-900 px-8 py-6 text-white">
            <div className="flex items-center gap-3 mb-3">
              <svg className="w-6 h-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <h1 className="text-lg font-bold">Certificado Médico Verificado</h1>
            </div>
            <p className="text-sm text-slate-300">CUIR: <span className="font-mono text-sky-300">{cert.cuir}</span></p>
          </div>

          {/* QR Code */}
          {cert.qrContent && (
            <div className="flex justify-center py-5 border-b border-slate-100">
              <div className="text-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(cert.qrContent)}&margin=4`}
                  alt={`QR de verificación: ${cert.cuir}`}
                  width={160}
                  height={160}
                  className="mx-auto rounded-lg"
                />
                <p className="text-[9px] text-slate-400 mt-2 font-mono">{cert.cuir}</p>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="px-8 py-6 space-y-5">
            {/* Status */}
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusDisplay.color}`}>
                {statusDisplay.label}
              </span>
              <span className="text-xs text-slate-400">
                Emitido {new Date(cert.issuedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>

            {/* Type */}
            <div className="bg-sky-50 rounded-xl p-4">
              <p className="text-[10px] font-bold text-sky-600 uppercase tracking-wider mb-1">Tipo de Atestado</p>
              <p className="text-base font-bold text-slate-900">{certTitle}</p>
              {cert.daysOfRest > 0 && (
                <p className="text-sm text-slate-700 mt-1 font-medium">
                  {cert.daysOfRest} días de reposo {cert.endDate ? `(Hasta el ${cert.endDate})` : ''}
                </p>
              )}
            </div>

            {/* Patient */}
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Paciente</p>
              <p className="text-sm font-semibold text-slate-900">{cert.patientName}</p>
              {cert.patientDni && <p className="text-xs text-slate-500 mt-0.5">DNI: {cert.patientDni}</p>}
            </div>

            {/* Diagnosis / Detail */}
            {cert.diagnosis && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Diagnóstico / Certificación</p>
                <p className="text-sm text-slate-700">{cert.diagnosis}</p>
              </div>
            )}

            {/* Observations */}
            {cert.observations && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Indicaciones y Observaciones</p>
                <p className="text-sm text-slate-600">{cert.observations}</p>
              </div>
            )}

            {/* Prescriber */}
            <div className="border-t border-slate-100 pt-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Profesional Certificante</p>
              <p className="text-sm font-semibold text-slate-900">{cert.prescriberName}</p>
              <p className="text-xs text-slate-500">{cert.prescriberLicense}</p>
            </div>

            {/* PDF Download */}
            {cert.pdfUrl && (
              <a
                href={cert.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Descargar Certificado (PDF)
              </a>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-slate-50 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 text-center">
              {cert.signatureLabel || 'Registro de emisión verificado en AutaMedica'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const rx = result.prescription;
  if (!rx) return null;
  const statusDisplay = STATUS_LABELS[rx.status] ?? STATUS_LABELS.draft;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl border border-emerald-100 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 px-8 py-6 text-white">
          <div className="flex items-center gap-3 mb-3">
            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h1 className="text-lg font-bold">Receta verificada</h1>
          </div>
          <p className="text-sm text-slate-300">CUIR: <span className="font-mono text-emerald-300">{rx.cuir}</span></p>
        </div>

        {/* QR Code */}
        {rx.qrContent && (
          <div className="flex justify-center py-5 border-b border-slate-100">
            <div className="text-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(rx.qrContent)}&margin=4`}
                alt={`QR de verificación: ${rx.cuir}`}
                width={160}
                height={160}
                className="mx-auto rounded-lg"
              />
              <p className="text-[9px] text-slate-400 mt-2 font-mono">{rx.cuir}</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="px-8 py-6 space-y-5">
          {/* Status */}
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusDisplay.color}`}>
              {statusDisplay.label}
            </span>
            <span className="text-xs text-slate-400">
              Emitida {new Date(rx.issuedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>

          {/* Patient */}
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Paciente</p>
            <p className="text-sm font-semibold text-slate-900">{rx.patientName}</p>
          </div>

          {/* Medication */}
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">Medicamento</p>
            <p className="text-base font-bold text-slate-900">{rx.medication}</p>
            <p className="text-sm text-slate-600 mt-1">{rx.dosage} — {rx.quantity} unidades</p>
          </div>

          {/* Diagnosis */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Diagnostico</p>
            <p className="text-sm text-slate-700">{rx.diagnosis}</p>
          </div>

          {/* Prescriber */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Prescriptor</p>
            <p className="text-sm font-semibold text-slate-900">{rx.prescriberName}</p>
            <p className="text-xs text-slate-500">{rx.prescriberLicense}</p>
          </div>

          {/* PDF Download */}
          {rx.pdfUrl && (
            <a
              href={rx.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Descargar PDF de la receta
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-slate-50 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 text-center">
            {getLegalFooter(rx.countryCode)}
          </p>
        </div>
      </div>
    </div>
  );
}

