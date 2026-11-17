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
  const [manualApprovalRequired, setManualApprovalRequired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const result = await fetchApi<{ status: PaymentStatus; manualApprovalRequired?: boolean }>(
        '/api/pharmacy/dispatch/payment/status', {
          method: 'POST',
          body: { requestId: dispatchId, accessToken: guestToken },
        },
      )
      setStatus(result.status)
      setManualApprovalRequired(result.manualApprovalRequired === true)
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
      const res = await fetchApi<{ status: PaymentStatus; checkoutUrl: string | null; manualApprovalRequired?: boolean }>(
        '/api/pharmacy/dispatch/payment/create', {
          method: 'POST',
          body: { requestId: dispatchId, accessToken: guestToken },
        },
      )
      setStatus(res.status)
      setManualApprovalRequired(res.manualApprovalRequired === true)
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
      {status === 'approved' ? <p role="status" className="mt-2 text-sm font-semibold text-emerald-700">{countryCode === 'AR' ? 'Pago confirmado.' : 'Pagamento confirmado.'}</p> : (
        <>
          {manualApprovalRequired ? <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{countryCode === 'AR' ? 'Estamos preparando tu pago. Volvé a intentar en unos segundos.' : 'Estamos preparando seu pagamento. Tente novamente em alguns segundos.'}</p> : checkoutUrl ? <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#0EA5E9] px-4 py-3 font-semibold text-white transition hover:bg-sky-600">{countryCode === 'AR' ? 'Continuar al pago' : 'Continuar pagamento'}</a> : <button onClick={() => void beginCheckout()} disabled={busy} type="button" className="mt-3 min-h-12 w-full rounded-xl bg-[#0EA5E9] px-4 py-3 font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50">{busy ? (countryCode === 'AR' ? 'Abriendo el pago...' : 'Abrindo pagamento...') : (countryCode === 'AR' ? 'Pagar consulta' : 'Pagar consulta')}</button>}
          {status === 'pending' && !manualApprovalRequired && <p role="status" className="mt-2 text-xs text-amber-700">{countryCode === 'AR' ? 'Esperando confirmación del pago.' : 'Aguardando confirmação do pagamento.'}</p>}
          {status === 'refunded' && <p role="status" className="mt-2 text-xs text-amber-700">{countryCode === 'AR' ? 'Pago reembolsado.' : 'Pagamento estornado.'}</p>}
          {status === 'rejected' && <p role="status" className="mt-2 text-xs text-rose-700">{countryCode === 'AR' ? 'El pago no fue aprobado. Intentá nuevamente.' : 'Pagamento não aprovado. Tente novamente.'}</p>}
          {status === 'cancelled' && <p role="status" className="mt-2 text-xs text-slate-600">{countryCode === 'AR' ? 'Pago cancelado.' : 'Pagamento cancelado.'}</p>}
          {status === 'failed' && <p role="status" className="mt-2 text-xs text-rose-700">{countryCode === 'AR' ? 'No se pudo completar el pago. Intentá nuevamente.' : 'Falha no pagamento. Tente novamente.'}</p>}
          {error && <p role="alert" className="mt-2 text-xs text-rose-700">{countryCode === 'AR' ? 'No pudimos abrir Mercado Pago. Intentá nuevamente.' : 'Não foi possível abrir o pagamento. Tente novamente.'}</p>}
        </>
      )}
    </aside>
  )
}
