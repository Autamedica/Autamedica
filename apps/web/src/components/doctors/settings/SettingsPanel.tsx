"use client"

import {
    Bell,
    Lock,
    Palette,
    Shield,
    User,
    Video
} from 'lucide-react'
import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

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
        const res = await fetch('/api/profiles/doctors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            specialty: String(settings.specialty).trim(),
            license_number: String(settings.license).trim(),
          }),
        })
        const result = await res.json()
        if (!result.ok) {
          setSaveMessage(`Error al guardar perfil: ${result.error}`)
          return
        }
        setSaveMessage('Perfil y preferencias guardados.')
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
              settings[setting.id] ? 'bg-blue-600' : 'bg-gray-300'
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
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )
    }
  }

  const currentSettings = settingsByCategory[activeCategory] || []

  return (
    <div className="flex h-full rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="w-64 border-r border-gray-200 bg-neutral-50 p-4">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Configuración</h2>
          <p className="text-sm text-gray-500">Personaliza tu experiencia médica</p>
        </div>

        <div className="space-y-2">
          {categories.map((category) => {
            const Icon = category.icon
            const isActive = activeCategory === category.id

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                  isActive
                    ? 'border border-blue-200 bg-blue-50 text-blue-600'
                    : 'border border-transparent text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon className={`mt-0.5 h-5 w-5 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} />
                <div>
                  <p className="text-sm font-medium">{category.title}</p>
                  <p className="text-xs text-gray-400">{category.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-gray-900">
            {categories.find(c => c.id === activeCategory)?.title}
          </h3>
          <p className="text-sm text-gray-500">
            {categories.find(c => c.id === activeCategory)?.description}
          </p>
          {saveMessage && <p className="mt-2 text-xs text-blue-600">{saveMessage}</p>}
        </div>

        <div className="space-y-6">
          {currentSettings.map((setting) => (
            <div key={setting.id} className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h4 className="text-sm font-medium text-gray-800">{setting.label}</h4>
                <p className="text-xs text-gray-500">{setting.description}</p>
              </div>
              <div className="flex-shrink-0">
                {renderSettingControl(setting)}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-transparent px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100"
            onClick={() => setSaveMessage('Cambios descartados visualmente. Nada fue persistido.')}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
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
