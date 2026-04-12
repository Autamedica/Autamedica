'use client'

import { motion } from 'framer-motion'
import { FileText, Download, Loader2, AlertCircle, Sparkles, ArrowRight } from 'lucide-react'
import { usePatientReports } from '@/hooks/patients/usePatientReports'

function formatDate(iso: string | null): string {
  if (!iso) return 'Sin fecha'
  try {
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return 'Sin fecha'
  }
}

export default function MedicalReportsPage() {
  const { reports, loading, error, downloadPdf, downloading } = usePatientReports()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <motion.div className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="size-12 rounded-full border-2 border-neutral-300 border-t-neutral-900 animate-spin mx-auto" />
          <p className="mt-4 text-neutral-500">Cargando informes...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-neutral-900 px-6 lg:px-12 pt-16 pb-20">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white/80 rounded-full text-xs font-medium mb-6"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <FileText className="size-3.5" />
            {reports.length} {reports.length === 1 ? 'informe' : 'informes'}
          </motion.div>
          <motion.h1
            className="text-4xl lg:text-5xl text-white mb-4 leading-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Informes médicos
          </motion.h1>
          <motion.p
            className="text-lg text-white/60 max-w-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Reportes clínicos generados después de cada consulta
          </motion.p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 lg:px-12 -mt-8 pb-32">
        {error && (
          <motion.div
            className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-6 flex items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <AlertCircle className="size-5 text-red-500 shrink-0" />
            <p className="text-red-700">{error}</p>
          </motion.div>
        )}

        {reports.length === 0 && !error && (
          <motion.div
            className="text-center py-24"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="size-20 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-8">
              <FileText className="size-10 text-neutral-400" />
            </div>
            <h2 className="text-3xl text-neutral-900 mb-4">Sin informes aún</h2>
            <p className="text-neutral-500 mb-10 max-w-md mx-auto">
              Después de tu primera consulta, el informe médico aparecerá acá para descargarlo como PDF.
            </p>
            <motion.a
              href="/patients/appointments?type=telemedicine"
              className="group inline-flex items-center gap-2 px-7 py-4 bg-neutral-900 text-white rounded-full font-medium hover:bg-neutral-800 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Agendar consulta
              <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" />
            </motion.a>
          </motion.div>
        )}

        <div className="space-y-4">
          {reports.map((report, i) => (
            <motion.div
              key={report.id}
              className="group flex items-center justify-between p-6 border border-neutral-200 rounded-2xl hover:border-neutral-900 transition-all bg-white"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ y: -4 }}
            >
              <div className="flex items-start gap-4">
                <div className="size-12 rounded-xl bg-neutral-100 flex items-center justify-center group-hover:bg-neutral-900 transition-colors">
                  <FileText className="size-5 text-neutral-400 group-hover:text-white transition-colors" />
                </div>
                <div>
                  <h3 className="font-medium text-neutral-900">{report.title}</h3>
                  <div className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
                    <span>{formatDate(report.dateRecorded)}</span>
                    {report.doctorName && (
                      <>
                        <span className="text-neutral-300">·</span>
                        <span>Dr/a. {report.doctorName}</span>
                      </>
                    )}
                    {report.aiGenerated && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-medium text-white">
                        <Sparkles className="size-3" /> IA
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <motion.button
                onClick={() => downloadPdf(report.id)}
                disabled={downloading === report.id}
                className="flex size-10 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 transition-all disabled:opacity-50"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Descargar PDF"
              >
                {downloading === report.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
              </motion.button>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  )
}
