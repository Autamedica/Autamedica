"use client"

import {
    Bell,
    Lock,
    Palette,
    Shield,
    User,
    Video,
    ChevronLeft
} from 'lucide-react'
import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchApi, ApiError } from '@/lib/api-client'

type SettingsCategory = {
  id: string
  title: string
  icon: typeof User
  description: string
}

type SettingItem = {
  id: string
  label: string
  description: string
  type: 'toggle' | 'select' | 'input'
  value: boolean | string | number
  options?: string[]
}

type SettingsState = Record<string, boolean | string | number>

interface SettingsPanelProps {
  doctorName?: string
  specialty?: string
  licenseNumber?: string
}

const SETTINGS_STORAGE_KEY = 'autamedica-doctors-settings'

export function SettingsPanel({ doctorName, specialty, licenseNumber }: SettingsPanelProps): JSX.Element {
  const resolvedDoctorName = doctorName?.trim() || 'Sin nombre'
  const resolvedSpecialty = specialty?.trim() || 'Sin especialidad'
  const resolvedLicense = licenseNumber?.trim() || 'Sin registro'

  const [activeCategory, setActiveCategory] = useState('profile')
  const [isDetailView, setIsDetailView] = useState(false)
  const [isDesktopLayout, setIsDesktopLayout] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [settings, setSettings] = useState<SettingsState>({
    fullName: resolvedDoctorName,
    specialty: resolvedSpecialty,
    license: resolvedLicense,
    notifications: true,
    emailNotifications: true,
    appointmentReminders: true,
    darkMode: true,
    language: 'es',
    fontSize: 'medium',
    videoQuality: 'HD',
    microphoneGain: 75,
    cameraResolution: '1080p',
    autoRecording: false,
    privacyMode: true,
    dataRetention: '7 años',
    shareAnalytics: false,
    twoFactorAuth: false,
    sessionTimeout: '30 minutos',
    loginAlerts: true,
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const storedSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!storedSettings) {
      return
    }

    try {
      const parsed = JSON.parse(storedSettings) as SettingsState
      setSettings(prev => ({
        ...prev,
        ...parsed,
        fullName: resolvedDoctorName,
        specialty: resolvedSpecialty,
        license: resolvedLicense,
      }))
    } catch {
      setSaveMessage('Se detectó una configuración previa inválida y se restauraron valores seguros.')
    }
  }, [resolvedDoctorName, resolvedSpecialty, resolvedLicense])

  useEffect(() => {
    setSettings(prev => ({
      ...prev,
      fullName: resolvedDoctorName,
      specialty: resolvedSpecialty,
      license: resolvedLicense,
    }))
  }, [resolvedDoctorName, resolvedSpecialty, resolvedLicense])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const syncLayoutMode = () => {
      const desktop = window.innerWidth >= 768
      setIsDesktopLayout(desktop)

      if (desktop) {
        setIsDetailView(false)
      }
    }

    syncLayoutMode()
    window.addEventListener('resize', syncLayoutMode)

    return () => window.removeEventListener('resize', syncLayoutMode)
  }, [])

  const categories: SettingsCategory[] = [
    {
      id: 'profile',
      title: 'Perfil',
      icon: User,
      description: 'Información personal y preferencias de cuenta'
    },
    {
      id: 'video',
      title: 'Video y Audio',
      icon: Video,
      description: 'Configuración de cámara, micrófono y calidad'
    },
    {
      id: 'notifications',
      title: 'Notificaciones',
      icon: Bell,
      description: 'Alertas, recordatorios y comunicaciones'
    },
    {
      id: 'privacy',
      title: 'Privacidad',
      icon: Shield,
      description: 'Seguridad y protección de datos médicos'
    },
    {
      id: 'appearance',
      title: 'Apariencia',
      icon: Palette,
      description: 'Temas, idioma y personalización visual'
    },
    {
      id: 'security',
      title: 'Seguridad',
      icon: Lock,
      description: 'Autenticación y acceso a la cuenta'
    }
  ]

  const settingsByCategory: Record<string, SettingItem[]> = useMemo(() => ({
    profile: [
      {
        id: 'fullName',
        label: 'Nombre completo',
        description: 'Tu nombre como aparece en el sistema',
        type: 'input',
        value: settings.fullName ?? '',
      },
      {
        id: 'specialty',
        label: 'Especialidad médica',
        description: 'Tu área de especialización',
        type: 'input',
        value: settings.specialty ?? '',
      },
      {
        id: 'license',
        label: 'Número de licencia médica',
        description: 'Tu número de colegiatura profesional',
        type: 'input',
        value: settings.license ?? '',
      }
    ],
    video: [
      {
        id: 'videoQuality',
        label: 'Calidad de video',
        description: 'Resolución predeterminada para videollamadas',
        type: 'select',
        value: settings.videoQuality ?? 'HD',
        options: ['SD', 'HD', '4K']
      },
      {
        id: 'cameraResolution',
        label: 'Resolución de cámara',
        description: 'Calidad de captura de video',
        type: 'select',
        value: settings.cameraResolution ?? '1080p',
        options: ['720p', '1080p', '4K']
      },
      {
        id: 'microphoneGain',
        label: 'Ganancia del micrófono',
        description: 'Nivel de amplificación del audio',
        type: 'input',
        value: settings.microphoneGain ?? 75
      },
      {
        id: 'autoRecording',
        label: 'Grabación automática',
        description: 'Grabar consultas automáticamente (con consentimiento)',
        type: 'toggle',
        value: !!settings.autoRecording
      }
    ],
    notifications: [
      {
        id: 'notifications',
        label: 'Notificaciones push',
        description: 'Recibir alertas en tiempo real',
        type: 'toggle',
        value: !!settings.notifications
      },
      {
        id: 'emailNotifications',
        label: 'Notificaciones por email',
        description: 'Recibir resúmenes y recordatorios por correo',
        type: 'toggle',
        value: !!settings.emailNotifications
      },
      {
        id: 'appointmentReminders',
        label: 'Recordatorios de citas',
        description: 'Alertas antes de consultas programadas',
        type: 'toggle',
        value: !!settings.appointmentReminders
      }
    ],
    privacy: [
      {
        id: 'privacyMode',
        label: 'Modo privacidad mejorada',
        description: 'Encriptación adicional para datos sensibles',
        type: 'toggle',
        value: !!settings.privacyMode
      },
      {
        id: 'dataRetention',
        label: 'Retención de datos',
        description: 'Tiempo de almacenamiento de información médica',
        type: 'select',
        value: settings.dataRetention ?? '7 años',
        options: ['1 año', '3 años', '5 años', '7 años', '10 años']
      },
      {
        id: 'shareAnalytics',
        label: 'Compartir análisis anónimos',
        description: 'Ayudar a mejorar el sistema con datos anónimos',
        type: 'toggle',
        value: !!settings.shareAnalytics
      }
    ],
    appearance: [
      {
        id: 'darkMode',
        label: 'Modo oscuro',
        description: 'Interfaz con colores oscuros para reducir fatiga visual',
        type: 'toggle',
        value: !!settings.darkMode
      },
      {
        id: 'language',
        label: 'Idioma',
        description: 'Idioma de la interfaz',
        type: 'select',
        value: settings.language ?? 'es',
        options: ['es', 'en', 'pt', 'fr']
      },
      {
        id: 'fontSize',
        label: 'Tamaño de fuente',
        description: 'Tamaño del texto en la interfaz',
        type: 'select',
        value: settings.fontSize ?? 'medium',
        options: ['small', 'medium', 'large', 'extra-large']
      }
    ],
    security: [
      {
        id: 'twoFactorAuth',
        label: 'Autenticación de dos factores',
        description: 'Seguridad adicional para tu cuenta',
        type: 'toggle',
        value: !!settings.twoFactorAuth
      },
      {
        id: 'sessionTimeout',
        label: 'Tiempo de sesión',
        description: 'Cerrar sesión automáticamente por inactividad',
        type: 'select',
        value: settings.sessionTimeout ?? '30 minutos',
        options: ['15 minutos', '30 minutos', '1 hora', '2 horas', 'Nunca']
      },
      {
        id: 'loginAlerts',
        label: 'Alertas de inicio de sesión',
        description: 'Notificar cuando se accede a tu cuenta',
        type: 'toggle',
        value: !!settings.loginAlerts
      }
    ]
  }), [settings])

  const handleSettingChange = (settingId: string, value: boolean | string | number) => {
    setSettings(prev => ({
      ...prev,
      [settingId]: value
    }))
  }

  const [isSaving, setIsSaving] = useState(false)

  const persistSettings = useCallback(async () => {
    setIsSaving(true)
    setSaveMessage(null)

    try {
      // Persist UI preferences to localStorage
      const uiSettings = { ...settings }
      delete uiSettings.fullName
      delete uiSettings.specialty
      delete uiSettings.license
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(uiSettings))
      }

      // Persist profile fields to backend
      const profileChanged =
        String(settings.specialty) !== resolvedSpecialty ||
        String(settings.license) !== resolvedLicense

      if (profileChanged) {
        try {
          await fetchApi('/api/profiles/doctors', {
            body: {
              specialty: String(settings.specialty).trim(),
              license_number: String(settings.license).trim(),
            },
          })
          setSaveMessage('Perfil y preferencias guardados.')
        } catch (err) {
          setSaveMessage(`Error al guardar perfil: ${err instanceof ApiError ? err.message : 'desconocido'}`)
          return
        }
      } else {
        setSaveMessage('Preferencias guardadas.')
      }
    } catch {
      setSaveMessage('Error al guardar. Intente nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }, [settings, resolvedSpecialty, resolvedLicense])

  const renderSettingControl = (setting: SettingItem) => {
    switch (setting.type) {
      case 'toggle':
        return (
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings[setting.id] ? 'bg-am-doctor-600' : 'bg-am-surface-300'
            }`}
            onClick={() => handleSettingChange(setting.id, !settings[setting.id])}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                settings[setting.id] ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        )
      case 'select':
        return (
          <select
            value={String(settings[setting.id])}
            onChange={(e) => handleSettingChange(setting.id, e.target.value)}
            className="w-full rounded-lg border border-am-surface-300 bg-white px-3 py-2 text-sm text-am-surface-900 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500 sm:w-auto"
          >
            {setting.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )
      case 'input':
        return (
          <input
            type={typeof setting.value === 'number' ? 'number' : 'text'}
            value={settings[setting.id] as string | number}
            onChange={(e) => handleSettingChange(setting.id, e.target.value)}
            className="w-full rounded-lg border border-am-surface-300 bg-white px-3 py-2 text-sm text-am-surface-900 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500 sm:min-w-[220px]"
          />
        )
    }
  }

  const currentSettings = settingsByCategory[activeCategory] || []
  const activeCategoryTitle = categories.find(c => c.id === activeCategory)?.title

  return (
    <div className="flex h-full w-full flex-col rounded-2xl border border-am-surface-200 bg-white shadow-am-sm md:flex-row">
      {/* Sidebar / Menu */}
      <div
        className={`w-full border-b border-am-surface-200 bg-am-surface-50 p-4 transition-all md:w-64 md:border-b-0 md:border-r ${
          !isDesktopLayout && isDetailView ? 'hidden' : 'block'
        }`}
      >
        <div className="mb-6 hidden md:block">
          <h2 className="text-lg font-semibold text-am-surface-900">Configuración</h2>
          <p className="text-sm text-am-surface-500">Personaliza tu experiencia</p>
        </div>

        <div className="space-y-2">
          {categories.map((category) => {
            const Icon = category.icon
            const isActive = activeCategory === category.id
            const isCategorySelected = isActive && (isDesktopLayout || isDetailView)

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => { setActiveCategory(category.id); setIsDetailView(true); }}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-all ${
                  isCategorySelected
                    ? 'border border-am-doctor-200 bg-am-doctor-50 text-am-doctor-600'
                    : 'border border-transparent text-am-surface-700 hover:bg-am-surface-100 hover:text-am-surface-900'
                }`}
              >
                <Icon className={`mt-0.5 h-5 w-5 ${isActive ? 'text-am-doctor-600' : 'text-am-surface-500'}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{category.title}</p>
                  <p className="hidden text-xs text-am-surface-400 md:block">{category.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div
        className={`flex-1 p-4 sm:p-6 ${
          isDesktopLayout || isDetailView ? 'block' : 'hidden'
        }`}
      >
        <div className="mb-6 flex items-center gap-3">
            {/* Back button for mobile */}
            <button 
                className="rounded-full p-2 -ml-2 hover:bg-am-surface-100 md:hidden"
                onClick={() => setIsDetailView(false)}
                aria-label="Volver a categorías"
            >
                <ChevronLeft className="h-5 w-5 text-am-surface-600" />
            </button>
            <div>
              <h3 className="text-xl font-semibold text-am-surface-900">{activeCategoryTitle}</h3>
              <p className="text-sm text-am-surface-500">
                {categories.find(c => c.id === activeCategory)?.description}
              </p>
            </div>
        </div>
        
        {saveMessage && <p className="mb-4 text-xs text-am-doctor-600">{saveMessage}</p>}

        <div className="space-y-6">
          {currentSettings.map((setting) => (
            <div
              key={setting.id}
              className="flex flex-col gap-3 rounded-xl border border-am-surface-100 bg-am-surface-50/60 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:border-0 sm:bg-transparent sm:p-0"
            >
              <div className="flex-1">
                <h4 className="text-sm font-medium text-am-surface-800">{setting.label}</h4>
                <p className="text-xs text-am-surface-500">{setting.description}</p>
              </div>
              <div className="w-full flex-shrink-0 self-start sm:w-auto sm:self-auto">
                {renderSettingControl(setting)}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-lg border border-am-surface-300 bg-transparent px-4 py-2 text-sm text-am-surface-700 transition hover:bg-am-surface-100"
            onClick={() => setSaveMessage('Cambios descartados.')}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-lg bg-am-doctor-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-am-doctor-700 disabled:opacity-50"
            onClick={() => void persistSettings()}
            disabled={isSaving}
          >
            {isSaving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
