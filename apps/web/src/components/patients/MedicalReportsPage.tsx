'use client'

import { FileText, Download, Loader2, AlertCircle, Sparkles, ChevronLeft } from 'lucide-react'
import { usePatientReports } from '@/hooks/patients/usePatientReports'

function formatDate(iso: string | null): string {
  if (!iso) return 'Sin fecha'
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return 'Sin fecha'
  }
}

export default function MedicalReportsPage() {
  const { reports, loading, error, downloadPdf, downloading } = usePatientReports()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
          <p className="mt-3 text-sm text-gray-500">Cargando informes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <a href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </a>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Mis informes médicos</h1>
            <p className="text-xs text-gray-500">
              {reports.length === 0
                ? 'Aún no tenés informes'
                : `${reports.length} informe${reports.length !== 1 ? 's' : ''} disponible${reports.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Empty state */}
        {reports.length === 0 && !error && (
          <div className="py-20 text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-4 text-lg font-medium text-gray-700">Sin informes aún</h2>
            <p className="mt-2 text-sm text-gray-500">
              Después de tu primera consulta, el informe médico aparecerá acá para que puedas descargarlo como PDF.
            </p>
          </div>
        )}

        {/* Reports list */}
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                  <FileText className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900">{report.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {formatDate(report.dateRecorded)}
                    </span>
                    {report.doctorName && (
                      <>
                        <span className="text-xs text-gray-300">•</span>
                        <span className="text-xs text-gray-500">Dr/a. {report.doctorName}</span>
                      </>
                    )}
                    {report.aiGenerated && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
                        <Sparkles className="h-3 w-3" />
                        IA
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => downloadPdf(report.id)}
                disabled={downloading === report.id}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                title="Descargar PDF"
              >
                {downloading === report.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
