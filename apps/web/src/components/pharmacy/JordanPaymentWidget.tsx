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
}: {
  dispatchId: string
  guestToken: string
  onStatusChange?: (status: PaymentStatus) => void
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
      setCheckoutUrl(res.checkoutUrl)
    } catch {
      setError('Não foi possível preparar o pagamento. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="fixed top-16 right-3 z-40 w-[min(310px,calc(100vw-24px))] rounded-2xl border border-emerald-500/30 bg-zinc-950/95 p-3.5 shadow-xl backdrop-blur-lg text-sm text-white" aria-label="Pagamento da consulta">
      <div className="font-semibold">Consulta médica · R$ 79,00</div>
      <p className="mt-1 text-xs text-zinc-300">
        Origem: Cantina Jordan. Pagamento seguro pelo Mercado Pago.
      </p>
      {status === 'approved' ? (
        <p role="status" className="mt-2 text-emerald-400 font-semibold">Pagamento confirmado.</p>
      ) : (
        <>
          {checkoutUrl ? (
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex rounded-lg bg-emerald-600 px-3 py-2 font-semibold hover:bg-emerald-500">
              Abrir pagamento
            </a>
          ) : (
            <button onClick={() => void beginCheckout()} disabled={busy} type="button" className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 font-semibold disabled:opacity-50">
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
