'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, ExternalLink, Loader2, Save } from 'lucide-react'

type PublicProfileEditorData = {
  id: string
  first_name?: string | null
  last_name?: string | null
  care_country: 'AR' | 'BR'
  education?: unknown
  certifications?: unknown
  clinical_focus_areas?: unknown
  professional_experience?: unknown
  academic_activity?: unknown
  public_profile_enabled: boolean
  public_profile_consent_confirmed_at?: string | null
  public_profile_consent_version?: string | null
}

type EditorForm = {
  education: string
  certifications: string
  clinical_focus_areas: string
  professional_experience: string
  academic_activity: string
  public_profile_enabled: boolean
}

function entriesToText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value.flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : []
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>
      const title = [record.title, record.name, record.degree, record.program, record.position, record.description]
        .find((entry) => typeof entry === 'string' && entry.trim())
      const institution = [record.institution, record.university, record.organization, record.hospital]
        .find((entry) => typeof entry === 'string' && entry.trim())
      const period = [record.period, record.year, record.date]
        .find((entry) => typeof entry === 'string' && entry.trim())
      const text = [title, institution, period].filter((entry) => typeof entry === 'string').join(' — ')
      return text ? [text] : []
    }
    return []
  }).join('\n')
}

function toLines(value: string): string[] {
  return value.split('\n').map((entry) => entry.trim()).filter(Boolean)
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function PublicProfileEditor() {
  const [profile, setProfile] = useState<PublicProfileEditorData | null>(null)
  const [form, setForm] = useState<EditorForm>({
    education: '',
    certifications: '',
    clinical_focus_areas: '',
    professional_experience: '',
    academic_activity: '',
    public_profile_enabled: false,
  })
  const [consentAcknowledged, setConsentAcknowledged] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPortuguese, setIsPortuguese] = useState(false)

  useEffect(() => {
    setIsPortuguese(document.documentElement.lang.toLowerCase().startsWith('pt'))
    void load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/doctors/public-profile', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      const payload = await response.json()
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error || 'profile_load_failed')
      }
      const data = payload.data as PublicProfileEditorData
      setProfile(data)
      setForm({
        education: entriesToText(data.education),
        certifications: entriesToText(data.certifications),
        clinical_focus_areas: entriesToText(data.clinical_focus_areas),
        professional_experience: entriesToText(data.professional_experience),
        academic_activity: entriesToText(data.academic_activity),
        public_profile_enabled: Boolean(data.public_profile_enabled),
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'profile_load_failed')
    } finally {
      setLoading(false)
    }
  }

  const previewPath = useMemo(() => {
    if (!profile) return ''
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
    return '/' + profile.care_country.toLowerCase() + '/medicos/' + (slugify(fullName) || 'perfil') + '-' + profile.id
  }, [profile])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return

    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const response = await fetch('/api/doctors/public-profile', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          education: toLines(form.education),
          certifications: toLines(form.certifications),
          clinical_focus_areas: toLines(form.clinical_focus_areas),
          professional_experience: toLines(form.professional_experience),
          academic_activity: toLines(form.academic_activity),
          public_profile_enabled: form.public_profile_enabled,
          consentAcknowledged,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || 'profile_save_failed')

      setProfile((current) => current ? { ...current, ...payload.data } : current)
      setConsentAcknowledged(false)
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'profile_save_failed')
    } finally {
      setSaving(false)
    }
  }

  const copy = {
    title: isPortuguese ? 'Perfil profissional público' : 'Perfil profesional público',
    description: isPortuguese
      ? 'Apresente sua prática e trajetória com informações profissionais que você escolhe compartilhar.'
      : 'Presentá tu práctica y trayectoria con información profesional que elegís compartir.',
    loading: isPortuguese ? 'Carregando perfil…' : 'Cargando perfil…',
    education: isPortuguese ? 'Formação acadêmica' : 'Formación académica',
    certifications: isPortuguese ? 'Residência e pós-graduação' : 'Residencia y posgrados',
    focus: isPortuguese ? 'Áreas de atuação' : 'Áreas de atención',
    experience: isPortuguese ? 'Trajetória profissional' : 'Trayectoria profesional',
    academic: isPortuguese ? 'Atividade acadêmica e reconhecimentos' : 'Actividad académica y reconocimientos',
    hint: isPortuguese
      ? 'Um item por linha. Seções sem conteúdo não aparecem na página pública.'
      : 'Un dato por línea. Las secciones sin contenido no aparecen en la página pública.',
    publish: isPortuguese ? 'Publicar meu perfil' : 'Publicar mi perfil',
    consent: isPortuguese
      ? 'Confirmo que autorizo a publicação na internet das informações profissionais que incluí neste perfil. Posso desativá-lo a qualquer momento.'
      : 'Confirmo que autorizo la publicación en internet de la información profesional que incluí en este perfil. Puedo desactivarlo en cualquier momento.',
    save: isPortuguese ? 'Salvar alterações' : 'Guardar cambios',
    saving: isPortuguese ? 'Salvando…' : 'Guardando…',
    saved: isPortuguese ? 'Alterações salvas.' : 'Cambios guardados.',
    preview: isPortuguese ? 'Abrir meu perfil público' : 'Abrir mi perfil público',
    unavailable: isPortuguese ? 'Não foi possível carregar o perfil.' : 'No se pudo cargar el perfil.',
    error: isPortuguese ? 'Não foi possível salvar as alterações.' : 'No se pudieron guardar los cambios.',
  }

  const fields = [
    {
      key: 'education' as const,
      label: copy.education,
      rows: 3,
      placeholder: isPortuguese ? 'Uma formação por linha: título — instituição — ano' : 'Una formación por línea: título — institución — año',
    },
    {
      key: 'certifications' as const,
      label: copy.certifications,
      rows: 3,
      placeholder: isPortuguese ? 'Uma residência ou pós-graduação por linha' : 'Una residencia o posgrado por línea',
    },
    {
      key: 'clinical_focus_areas' as const,
      label: copy.focus,
      rows: 3,
      placeholder: isPortuguese ? 'Ex.: cardiologia preventiva\nHipertensão arterial' : 'Ej.: Cardiología preventiva\nHipertensión arterial',
    },
    {
      key: 'professional_experience' as const,
      label: copy.experience,
      rows: 4,
      placeholder: isPortuguese ? 'Uma instituição ou função por linha' : 'Una institución o función por línea',
    },
    {
      key: 'academic_activity' as const,
      label: copy.academic,
      rows: 4,
      placeholder: isPortuguese ? 'Uma publicação, atividade docente ou reconhecimento por linha' : 'Una publicación, actividad docente o reconocimiento por línea',
    },
  ]

  return (
    <section className="mt-8 rounded-2xl border border-am-surface-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-am-surface-500">
          {copy.title}
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-am-surface-900">
          {copy.description}
        </h2>
        {loading ? (
          <div className="mt-6 flex items-center gap-2 py-5 text-sm text-am-surface-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {copy.loading}
          </div>
        ) : !profile ? (
          <p className="mt-5 text-sm text-am-surface-600">{error || copy.unavailable}</p>
        ) : (
          <form onSubmit={save} className="mt-6 space-y-4">
            <p className="text-sm leading-6 text-am-surface-600">{copy.hint}</p>

            {fields.map((field) => (
              <details key={field.key} className="group border-t border-am-surface-200 py-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-am-surface-800 marker:hidden">
                  {field.label}
                  <span className="float-right text-am-surface-400 group-open:rotate-180">⌄</span>
                </summary>
                <textarea
                  value={form[field.key]}
                  onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                  rows={field.rows}
                  maxLength={field.key === 'clinical_focus_areas' ? 2400 : 7200}
                  placeholder={field.placeholder}
                  className="mt-3 w-full rounded-xl border border-am-surface-300 bg-white px-3.5 py-3 text-sm text-am-surface-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </details>
            ))}

            <div className="border-t border-am-surface-200 pt-4">
              <label className="flex items-start gap-3 text-sm leading-6 text-am-surface-700">
                <input
                  type="checkbox"
                  checked={form.public_profile_enabled}
                  onChange={(event) => setForm((current) => ({ ...current, public_profile_enabled: event.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-am-surface-300 accent-sky-600"
                />
                <span>{copy.publish}</span>
              </label>
              {form.public_profile_enabled && !profile.public_profile_consent_confirmed_at && (
                <label className="mt-3 flex items-start gap-3 text-sm leading-6 text-am-surface-600">
                  <input
                    type="checkbox"
                    required
                    checked={consentAcknowledged}
                    onChange={(event) => setConsentAcknowledged(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-am-surface-300 accent-sky-600"
                  />
                  <span>{copy.consent}</span>
                </label>
              )}
            </div>

            {error && <p role="alert" className="text-sm text-red-700">{error === 'public_profile_consent_required' ? copy.consent : copy.error}</p>}
            {saved && <p role="status" className="flex items-center gap-2 text-sm text-sky-700"><CheckCircle2 className="h-4 w-4" />{copy.saved}</p>}

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="submit"
                disabled={saving || (form.public_profile_enabled && !profile.public_profile_consent_confirmed_at && !consentAcknowledged)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0EA5E9] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0284C7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? copy.saving : copy.save}
              </button>
              {profile.public_profile_enabled && (
                <a href={previewPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:text-sky-800">
                  {copy.preview}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
