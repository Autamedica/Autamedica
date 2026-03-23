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
import { useEffect, useMemo, useState } from 'react'

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

  const handleSave = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    }
    setSaveMessage('Configuración guardada en este navegador.')
  }

  const renderSettingControl = (setting: SettingItem) => {
    switch (setting.type) {
      case 'toggle':
        return (
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings[setting.id] ? 'bg-emerald-500' : 'bg-slate-600'
            }`}
            onClick={() => handleSettingChange(setting.id, !settings[setting.id])}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
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
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        )
    }
  }

  const currentSettings = settingsByCategory[activeCategory] || []

  return (
    <div className="flex h-full rounded-xl border border-slate-800/60 bg-[#101d32] shadow-xl">
      <div className="w-64 border-r border-slate-800/60 bg-[#0a1526] p-4">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-100">Configuración</h2>
          <p className="text-sm text-slate-400">Personaliza tu experiencia médica</p>
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
                    ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'text-slate-300 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <Icon className={`mt-0.5 h-5 w-5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <div>
                  <p className="text-sm font-medium">{category.title}</p>
                  <p className="text-xs text-slate-500">{category.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-slate-100">
            {categories.find(c => c.id === activeCategory)?.title}
          </h3>
          <p className="text-sm text-slate-400">
            {categories.find(c => c.id === activeCategory)?.description}
          </p>
          {saveMessage && <p className="mt-2 text-xs text-emerald-400">{saveMessage}</p>}
        </div>

        <div className="space-y-6">
          {currentSettings.map((setting) => (
            <div key={setting.id} className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h4 className="text-sm font-medium text-slate-200">{setting.label}</h4>
                <p className="text-xs text-slate-400">{setting.description}</p>
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
            className="rounded-lg border border-slate-600 bg-transparent px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800/40"
            onClick={() => setSaveMessage('Cambios descartados visualmente. Nada fue persistido.')}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
            onClick={handleSave}
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  )
}
