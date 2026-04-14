'use client'

import { useCallback, useState } from 'react'
import { Link2, Check, Loader2 } from 'lucide-react'
import { fetchApi } from '@/lib/api-client'

interface GuestLinkButtonProps {
  callId: string
}

export function GuestLinkButton({ callId }: GuestLinkButtonProps) {
  const [step, setStep] = useState<'idle' | 'name' | 'loading' | 'done'>('idle')
  const [guestName, setGuestName] = useState('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async () => {
    const name = guestName.trim()
    if (!name) return

    setStep('loading')
    setError(null)

    try {
      const res = await fetchApi<{ guestLink: string }>(`/api/doctors/calls/${callId}/guest-link`, {
        method: 'POST',
        body: { guestName: name },
      })

      if (!res?.guestLink) throw new Error('No se pudo generar el enlace')

      setLink(res.guestLink)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar enlace')
      setStep('name')
    }
  }, [callId, guestName])

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = link
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [link])

  if (step === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setStep('name')}
        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        <Link2 className="h-4 w-4" />
        Invitar paciente externo
      </button>
    )
  }

  if (step === 'name' || step === 'loading') {
    return (
      <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
        <p className="text-sm font-semibold text-slate-900">Nombre del paciente</p>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate()}
            placeholder="Ej: Juan Perez"
            disabled={step === 'loading'}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-60"
            autoFocus
          />
          <button
            type="button"
            onClick={() => void generate()}
            disabled={step === 'loading' || !guestName.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {step === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generar'}
          </button>
          <button
            type="button"
            onClick={() => { setStep('idle'); setError(null) }}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    )
  }

  // step === 'done'
  return (
    <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
      <p className="text-sm font-semibold text-emerald-900">Enlace generado para {guestName}</p>
      <p className="mt-1 text-xs text-emerald-700/70">Valido por 2 horas. Comparti este link por WhatsApp o email.</p>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          readOnly
          value={link}
          className="flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-600"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button
          type="button"
          onClick={() => void copyToClipboard()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}
