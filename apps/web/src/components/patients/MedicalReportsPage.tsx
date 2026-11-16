'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FileText, Download, Loader2, AlertCircle, Sparkles, ArrowRight } from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import { usePatientReports } from '@/hooks/patients/usePatientReports'

type Certificate = Record<string, unknown>

function formatDate(value: string | null, locale: string): string {
  if (!value) return locale === 'pt-BR' ? 'Sem data' : 'Sin fecha'
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return locale === 'pt-BR' ? 'Sem data' : 'Sin fecha'
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed)
}

export default function MedicalReportsPage() {
  const { reports, loading, error, downloadPdf, downloading } = usePatientReports()
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [certificatesLoading, setCertificatesLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'reports' | 'certificates'>('reports')
  const isPortuguese = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('pt')
  const locale = isPortuguese ? 'pt-BR' : 'es-AR'

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const result = await fetchApi<{ certificates?: Certificate[] }>('/api/patients/medical-history')
        if (active) setCertificates(result.certificates ?? [])
      } catch {
        if (active) setCertificates([])
      } finally {
        if (active) setCertificatesLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  if (loading && activeTab === 'reports') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <motion.div className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="mx-auto size-12 animate-spin rounded-full border-2 border-slate-200 border-t-[#10B981]" />
          <p className="mt-4 text-slate-500">{isPortuguese ? 'Carregando relatórios...' : 'Cargando informes...'}</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="bg-[#0F2537] px-4 pb-16 pt-10 sm:px-6 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80">
            <FileText className="size-3.5" />
            {reports.length + certificates.length} {isPortuguese ? 'documentos' : 'documentos'}
          </div>
          <h1 className="mb-3 text-3xl leading-tight text-white sm:text-4xl lg:text-5xl">
            {isPortuguese ? 'Documentos médicos' : 'Documentos médicos'}
          </h1>
          <p className="max-w-lg text-sm leading-6 text-white/70 sm:text-base">
            {isPortuguese ? 'Acesse relatórios, certificados e atestados emitidos nas suas consultas.' : 'Accedé a informes, certificados y atestados emitidos durante tus consultas.'}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-32 sm:px-6 lg:px-12">
        <div className="mb-5 -mt-7 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`min-h-11 rounded-xl px-3 text-xs font-semibold transition ${activeTab === 'reports' ? 'bg-[#10B981] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {isPortuguese ? 'Relatórios de consulta' : 'Informes de consulta'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('certificates')}
            className={`min-h-11 rounded-xl px-3 text-xs font-semibold transition ${activeTab === 'certificates' ? 'bg-[#10B981] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {isPortuguese ? 'Atestados e certificados' : 'Certificados / Atestados'}
          </button>
        </div>

        {activeTab === 'reports' && error && (
          <motion.div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <AlertCircle className="size-5 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </motion.div>
        )}

        {activeTab === 'reports' && reports.length === 0 && !error && (
          <motion.div className="rounded-2xl border border-slate-200 bg-white px-5 py-16 text-center shadow-sm" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-slate-100">
              <FileText className="size-8 text-slate-400" />
            </div>
            <h2 className="mb-3 text-2xl font-semibold text-slate-900">{isPortuguese ? 'Ainda não há relatórios' : 'Todavía no hay informes'}</h2>
            <p className="mx-auto mb-8 max-w-md text-sm leading-6 text-slate-500">
              {isPortuguese ? 'Após sua primeira consulta, o relatório médico aparecerá aqui para download em PDF.' : 'Después de tu primera consulta, el informe médico aparecerá acá para descargarlo como PDF.'}
            </p>
            <motion.a href="/patients/appointments?type=telemedicine" className="group inline-flex min-h-12 items-center gap-2 rounded-full bg-[#10B981] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0D9488]" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              {isPortuguese ? 'Agendar consulta' : 'Agendar consulta'}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </motion.a>
          </motion.div>
        )}

        {activeTab === 'reports' && reports.length > 0 && (
          <div className="space-y-3">
            {reports.map((report, index) => (
              <motion.article
                key={report.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 sm:p-5"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                    <FileText className="size-5 text-slate-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-900">{report.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{formatDate(report.dateRecorded, locale)}</span>
                      {report.doctorName && <span>· Dr/a. {report.doctorName}</span>}
                      {report.aiGenerated && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"><Sparkles className="size-3" /> IA</span>}
                    </div>
                  </div>
                </div>
                <motion.button
                  type="button"
                  onClick={() => void downloadPdf(report.id)}
                  disabled={downloading === report.id}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-[#10B981] hover:text-[#0D9488] disabled:opacity-50"
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.95 }}
                  title={isPortuguese ? 'Baixar PDF' : 'Descargar PDF'}
                  aria-label={isPortuguese ? 'Baixar PDF' : 'Descargar PDF'}
                >
                  {downloading === report.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                </motion.button>
              </motion.article>
            ))}
          </div>
        )}

        {activeTab === 'certificates' && (
          <div className="space-y-3">
            {certificatesLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{isPortuguese ? 'Carregando atestados...' : 'Cargando certificados...'}</div>
            ) : certificates.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{isPortuguese ? 'Nenhum atestado foi emitido.' : 'Todavía no hay certificados ni atestados emitidos.'}</div>
            ) : certificates.map((certificate) => {
              const id = String(certificate.id ?? '')
              const status = String(certificate.status ?? 'draft')
              const code = String(certificate.cuir ?? '')
              const type = String(certificate.certificate_type ?? 'otro').replace(/_/g, ' ')
              return (
                <article key={id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold capitalize text-slate-900">{type}</h3>
                    <p className="mt-1 text-sm text-slate-500">{formatDate(String(certificate.created_at ?? ''), locale)} · {status === 'signed' ? (isPortuguese ? 'Assinado' : 'Firmado') : status}</p>
                    {code && <p className="mt-1 text-xs text-slate-500">{isPortuguese ? 'Código de verificação' : 'Código de verificación'}: <span className="font-mono font-semibold text-slate-800">{code}</span></p>}
                  </div>
                  <div className="flex gap-2">
                    {status === 'signed' && <a href={'/api/doctors/certificates/' + encodeURIComponent(id) + '/pdf'} target="_blank" rel="noreferrer" className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-[#10B981] px-4 text-xs font-semibold text-white hover:bg-[#0D9488]">{isPortuguese ? 'Abrir PDF' : 'Abrir PDF'}</a>}
                    {code && <a href={'/verify/' + encodeURIComponent(code)} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700">{isPortuguese ? 'Verificar' : 'Verificar'}</a>}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
