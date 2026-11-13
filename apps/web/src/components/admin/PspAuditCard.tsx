import { useState } from 'react'
import { fetchApi } from '@/lib/api-client'

type Bucket = 'missing_reference' | 'invalid_reference' | 'psp_consistent' | 'psp_mismatch' | 'psp_pending' | 'provider_unavailable'
type BucketCounts = Record<Bucket, number>
type ProviderAudit = {
  auditedRecords: number
  truncatedAt50: boolean
  byCurrency: Record<string, { total: number; byBucket: BucketCounts }>
  bankSettled: false
}

const BUCKET_LABELS: { key: Bucket; label: string }[] = [
  { key: 'psp_consistent', label: 'Coinciden con Mercado Pago' },
  { key: 'psp_mismatch', label: 'Discrepancias' },
  { key: 'psp_pending', label: 'Pendientes en Mercado Pago' },
  { key: 'missing_reference', label: 'Sin identificador de cobro' },
  { key: 'invalid_reference', label: 'Referencia no verificable' },
  { key: 'provider_unavailable', label: 'Proveedor no accesible' },
]

export function PspAuditCard() {
  const [audit, setAudit] = useState<ProviderAudit | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runAudit = async () => {
    setPending(true)
    setError(null)
    try {
      const result = await fetchApi<ProviderAudit>('/api/admin/finance/psp-audit')
      setAudit(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo verificar con el proveedor')
    } finally {
      setPending(false)
    }
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="font-semibold text-slate-900">Conciliación preliminar con Mercado Pago</h3>
        <p className="text-xs text-slate-600">Consulta de solo lectura. No modifica pagos ni citas.</p>
      </div>
      <button type="button" onClick={() => void runAudit()} disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
        {pending ? 'Verificando…' : 'Verificar cobros con proveedor'}
      </button>
    </div>
    <p className="text-xs text-amber-900 bg-amber-50 p-2 rounded">
      Coincidencia con Mercado Pago NO equivale a dinero liquidado en el banco.
      Los cobros externos por PIX se concilian por separado.
    </p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {audit && <>
      <p className="text-sm text-slate-700">Operaciones examinadas: {audit.auditedRecords}{audit.truncatedAt50 ? ' (primeras 50)' : ''}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(audit.byCurrency).map(([currency, row]) => <div key={currency} className="border border-slate-200 rounded-lg p-3">
          <p className="font-semibold text-slate-900">{currency} · {row.total} registros</p>
          <dl className="mt-2 space-y-1 text-xs">
            {BUCKET_LABELS.map(item => <div key={item.key} className="flex justify-between gap-2">
              <dt className="text-slate-600">{item.label}</dt>
              <dd className="font-semibold text-slate-900">{row.byBucket[item.key] ?? 0}</dd>
            </div>)}
          </dl>
        </div>)}
      </div>
    </>}
  </section>
}
