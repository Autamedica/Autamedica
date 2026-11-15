import { useCallback, useEffect, useState } from 'react'
import { fetchApi } from '@/lib/api-client'

type PaymentStatus = 'not_started' | 'initializing' | 'pending' | 'approved' | 'refunded' | 'cancelled' | 'rejected' | 'failed'

/**
 * Commercial-only widget: does not inspect video, diagnoses or documents.
 * The signed guest token is submitted only in the POST body, never a URL.
 */
export function JordanPaymentWidget({
  dispatchId,
  guestToken,
  currency = 'BRL',
  amountMinor = 7900,
  countryCode = 'BR',
  onStatusChange,
}: {
  dispatchId: string
  guestToken: string
  currency?: 'BRL' | 'ARS'
  amountMinor?: number
  countryCode?: 'BR' | 'AR'
  onStatusChange?: (status: PaymentStatus) => void
}) {
  const amountLabel = new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'es-AR', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(amountMinor / 100)
  const [status, setStatus] = useState<PaymentStatus>('not_started')
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const result = await fetchApi<{ status: PaymentStatus }>(
        '/api/pharmacy/dispatch/payment/status', {
          method: 'POST',
          body: { requestId: dispatchId, accessToken: guestToken },
        },
      )
      setStatus(result.status)
      onStatusChange?.(result.status)
      if (result.status === 'approved') {
        setCheckoutUrl(null)
        setError(null)
      }
    } catch {
      // No status result means unknown; close any previously opened UI gate.
      onStatusChange?.('not_started')
    }
  }, [dispatchId, guestToken, onStatusChange])

  useEffect(() => {
    void refreshStatus()
    const id = setInterval(() => { void refreshStatus() }, 8000)
    return () => clearInterval(id)
  }, [refreshStatus])

  const beginCheckout = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchApi<{ status: PaymentStatus; checkoutUrl: string | null }>(
        '/api/pharmacy/dispatch/payment/create', {
          method: 'POST',
          body: { requestId: dispatchId, accessToken: guestToken },
        },
      )
      setStatus(res.status)
      onStatusChange?.(res.status)
      setCheckoutUrl(res.checkoutUrl)
    } catch {
      setError('Não foi possível abrir o pagamento. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="mx-auto w-full max-w-sm rounded-2xl border border-sky-200 bg-white p-3.5 text-sm text-slate-900 shadow-sm" aria-label={countryCode === 'AR' ? 'Pago de la consulta' : 'Pagamento da consulta'}>
      <div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-900">Consulta médica</span><strong className="text-base tabular-nums text-slate-900">{amountLabel}</strong></div>
      {status === 'approved' ? <p role="status" className="mt-2 text-sm font-semibold text-emerald-700">Pagamento confirmado.</p> : (
        <>
          {checkoutUrl ? <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#0EA5E9] px-4 py-3 font-semibold text-white transition hover:bg-sky-600">Continuar pagamento</a> : <button onClick={() => void beginCheckout()} disabled={busy} type="button" className="mt-3 min-h-12 w-full rounded-xl bg-[#0EA5E9] px-4 py-3 font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50">{busy ? 'Abrindo pagamento...' : 'Pagar consulta'}</button>}
          {status === 'pending' && <p role="status" className="mt-2 text-xs text-amber-700">Aguardando confirmação.</p>}
          {status === 'refunded' && <p role="status" className="mt-2 text-xs text-amber-700">Pagamento estornado.</p>}
          {status === 'rejected' && <p role="status" className="mt-2 text-xs text-rose-700">Pagamento não aprovado. Tente novamente.</p>}
          {status === 'cancelled' && <p role="status" className="mt-2 text-xs text-slate-600">Pagamento cancelado.</p>}
          {status === 'failed' && <p role="status" className="mt-2 text-xs text-rose-700">Falha no pagamento. Tente novamente.</p>}
          {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
        </>
      )}
    </aside>
  )
}
