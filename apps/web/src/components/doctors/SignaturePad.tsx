'use client'

import { useState, useRef, useCallback } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'
import { Loader2, Upload, Eraser, Check, Pen, Image as ImageIcon } from 'lucide-react'

interface SignaturePadProps {
  type: 'signature' | 'stamp'
  currentUrl?: string | null
  onSaved: (url: string) => void
}

const LABELS = {
  signature: {
    title: 'Firma Profesional',
    description: 'Dibujá tu firma o subí una imagen PNG con fondo transparente.',
    placeholder: 'Dibujá tu firma aquí',
  },
  stamp: {
    title: 'Sello Profesional',
    description: 'Subí una foto de tu sello profesional.',
    placeholder: 'Subí la imagen de tu sello',
  },
} as const

export function SignaturePad({ type, currentUrl, onSaved }: SignaturePadProps) {
  const sigCanvasRef = useRef<SignatureCanvas | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [mode, setMode] = useState<'draw' | 'upload'>(type === 'stamp' ? 'upload' : 'draw')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl ?? null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const label = LABELS[type]

  const handleClear = useCallback(() => {
    sigCanvasRef.current?.clear()
    setPreviewUrl(null)
    setSaved(false)
    setError(null)
  }, [])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 500 * 1024) {
      setError('La imagen no puede superar 500KB')
      return
    }

    if (!['image/png', 'image/webp', 'image/jpeg'].includes(file.type)) {
      setError('Formato no soportado. Usá PNG, WebP o JPEG')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setPreviewUrl(reader.result as string)
      setSaved(false)
      setError(null)
    }
    reader.readAsDataURL(file)
  }, [])

  const getImageDataUrl = useCallback((): string | null => {
    if ((mode === 'upload' || type === 'stamp') && previewUrl) {
      return previewUrl
    }

    if (mode === 'draw' && sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      return sigCanvasRef.current.toDataURL('image/png')
    }

    return null
  }, [mode, previewUrl, type])

  const handleSave = useCallback(async () => {
    const dataUrl = getImageDataUrl()
    if (!dataUrl) {
      setError(type === 'signature' ? 'Dibujá tu firma primero' : 'Subí una imagen primero')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const result = await fetchApi('/api/doctors/signature', {
        body: { type, image: dataUrl },
      })

      const data = result as { url: string }
      setPreviewUrl(data.url)
      setSaved(true)
      onSaved(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
      logger.error('[SignaturePad] save error', err)
    } finally {
      setIsSubmitting(false)
    }
  }, [getImageDataUrl, type, onSaved])

  return (
    <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-am-surface-800">{label.title}</h3>
          <p className="text-xs text-am-surface-500">{label.description}</p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            <Check className="h-3 w-3" /> Guardada
          </span>
        )}
      </div>

      {/* Mode Toggle (only for signature, stamps are always upload) */}
      {type === 'signature' && (
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => { setMode('draw'); handleClear() }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'draw'
                ? 'bg-am-doctor-500 text-white'
                : 'bg-white text-am-surface-600 border border-am-surface-200 hover:bg-am-surface-100'
            }`}
          >
            <Pen className="h-3 w-3" /> Dibujar
          </button>
          <button
            type="button"
            onClick={() => { setMode('upload'); handleClear() }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'upload'
                ? 'bg-am-doctor-500 text-white'
                : 'bg-white text-am-surface-600 border border-am-surface-200 hover:bg-am-surface-100'
            }`}
          >
            <ImageIcon className="h-3 w-3" /> Subir imagen
          </button>
        </div>
      )}

      {/* Drawing Canvas */}
      {mode === 'draw' && type === 'signature' && (
        <div className="relative rounded-lg border-2 border-dashed border-am-surface-300 bg-white">
          <SignatureCanvas
            ref={sigCanvasRef}
            penColor="#0f172a"
            canvasProps={{
              className: 'w-full h-32 rounded-lg',
              style: { width: '100%', height: '128px' },
            }}
            onEnd={() => { setSaved(false); setError(null) }}
          />
          <button
            type="button"
            onClick={handleClear}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-am-surface-100 px-2 py-1 text-xs text-am-surface-600 hover:bg-am-surface-200 transition-colors"
          >
            <Eraser className="h-3 w-3" /> Limpiar
          </button>
        </div>
      )}

      {/* Upload Area */}
      {(mode === 'upload' || type === 'stamp') && (
        <div>
          {previewUrl && !previewUrl.startsWith('data:') ? (
            <div className="relative rounded-lg border border-am-surface-200 bg-white p-3">
              <img
                src={previewUrl}
                alt={label.title}
                className="mx-auto h-24 object-contain"
              />
              <button
                type="button"
                onClick={() => { setPreviewUrl(null); setSaved(false) }}
                className="absolute top-2 right-2 rounded-md bg-am-surface-100 p-1 text-am-surface-500 hover:bg-am-surface-200"
              >
                <Eraser className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : previewUrl?.startsWith('data:') ? (
            <div className="relative rounded-lg border border-am-surface-200 bg-white p-3">
              <img
                src={previewUrl}
                alt="Preview"
                className="mx-auto h-24 object-contain"
              />
              <button
                type="button"
                onClick={() => { setPreviewUrl(null); setSaved(false) }}
                className="absolute top-2 right-2 rounded-md bg-am-surface-100 p-1 text-am-surface-500 hover:bg-am-surface-200"
              >
                <Eraser className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-am-surface-300 bg-white text-am-surface-400 hover:border-am-doctor-400 hover:text-am-doctor-500 transition-colors"
            >
              <Upload className="h-6 w-6" />
              <span className="text-xs">Click para subir imagen</span>
              <span className="text-[10px]">PNG, WebP o JPEG · max 500KB</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/webp,image/jpeg"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}

      {/* Save Button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={isSubmitting || saved}
        className="mt-3 w-full rounded-lg bg-am-doctor-500 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-am-doctor-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando...
          </span>
        ) : saved ? (
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" /> Guardada
          </span>
        ) : (
          `Guardar ${type === 'signature' ? 'firma' : 'sello'}`
        )}
      </button>
    </div>
  )
}
