'use client'

import { useState, useRef, useCallback } from 'react'
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'
import { Loader2, User, Camera } from 'lucide-react'

interface AvatarUploadProps {
  currentUrl?: string | null
  onSaved: (url: string) => void
  size?: 'sm' | 'md' | 'lg'
}

export function AvatarUpload({ currentUrl, onSaved, size = 'md' }: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl ?? null)
  const [error, setError] = useState<string | null>(null)

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 1024 * 1024) {
      setError('La imagen no puede superar 1MB')
      return
    }

    if (!['image/png', 'image/webp', 'image/jpeg'].includes(file.type)) {
      setError('Formato no soportado. Usá PNG, WebP o JPEG')
      return
    }

    // Read as base64
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      setPreviewUrl(dataUrl)
      setError(null)
      
      // Auto-save on selection
      setIsSubmitting(true)
      try {
        const result = await fetchApi('/api/profiles/avatar', {
          body: { image: dataUrl },
        })
        const data = result as { url: string }
        setPreviewUrl(data.url)
        onSaved(data.url)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al subir')
        logger.error('[AvatarUpload] upload error', err)
      } finally {
        setIsSubmitting(false)
      }
    }
    reader.readAsDataURL(file)
  }, [onSaved])

  const sizeClasses = {
    sm: 'h-12 w-12',
    md: 'h-24 w-24',
    lg: 'h-32 w-32'
  }

  const iconSize = {
    sm: 'h-6 w-6',
    md: 'h-10 w-10',
    lg: 'h-14 w-14'
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative group">
        <div className={`${sizeClasses[size]} rounded-full border-2 border-am-surface-200 bg-am-surface-50 flex items-center justify-center overflow-hidden transition-colors group-hover:border-am-doctor-400`}>
          {previewUrl ? (
            <img src={previewUrl} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <User className={`${iconSize[size]} text-am-surface-300`} />
          )}
          
          {isSubmitting && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>
        
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSubmitting}
          className="absolute bottom-0 right-0 p-2 bg-white rounded-full border border-am-surface-200 shadow-am-sm text-am-surface-600 hover:text-am-doctor-600 hover:border-am-doctor-400 transition-all active:scale-90"
          title="Cambiar foto"
        >
          <Camera className="h-4 w-4" />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        onChange={handleFileUpload}
        className="hidden"
      />

      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}
    </div>
  )
}
