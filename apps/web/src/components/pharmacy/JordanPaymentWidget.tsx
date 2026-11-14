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
  onStatusChange,
  sourceLabel = 'Farmacia Express',
}: {
  dispatchId: string
  guestToken: string
  onStatusChange?: (status: PaymentStatus) => void
  sourceLabel?: string
}) {
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
      setError('Não foi possível preparar o pagamento. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="fixed top-16 right-3 z-40 w-[min(310px,calc(100vw-24px))] rounded-2xl border border-sky-200 bg-white p-3.5 shadow-xl shadow-slate-200/70 text-sm text-slate-900" aria-label="Pagamento da consulta">
      <div className="font-semibold text-slate-900">Consulta médica · R$ 79,00</div>
      <p className="mt-1 text-xs text-slate-600">
        Origem: {sourceLabel}. Pagamento seguro pelo Mercado Pago.
      </p>
      {status === 'approved' ? (
        <p role="status" className="mt-2 font-semibold text-emerald-700">Pagamento confirmado.</p>
      ) : (
        <>
          {checkoutUrl ? (
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex rounded-lg bg-[#0EA5E9] px-3 py-2 font-semibold text-white hover:bg-sky-600">
              Abrir pagamento
            </a>
          ) : (
            <button onClick={() => void beginCheckout()} disabled={busy} type="button" className="mt-3 rounded-lg bg-[#0EA5E9] px-3 py-2 font-semibold text-white hover:bg-sky-600 disabled:opacity-50">
              {busy ? 'Preparando...' : 'Pagar consulta'}
            </button>
          )}
          {status === 'pending' && <p role="status" className="mt-2 text-xs text-amber-200">Aguardando confirmação do pagamento.</p>}
          {status === 'refunded' && <p role="status" className="mt-2 text-xs text-amber-200">Pagamento estornado.</p>}
          {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
        </>
      )}
    </aside>
  )
}
