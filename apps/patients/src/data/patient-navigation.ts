import {
  Activity,
  Calendar,
  FileText,
  Heart,
  Home,
  User,
  type LucideIcon,
} from 'lucide-react'

export type PatientPortalAside = 'none' | 'summary' | 'appointments' | 'history' | 'video'

export type PatientPortalRouteId =
  | 'home'
  | 'appointments'
  | 'medical-history'
  | 'preventive-health'
  | 'pregnancy-prevention'
  | 'profile'
  | 'results'
  | 'indicators'

export interface PatientPortalRoute {
  id: PatientPortalRouteId
  label: string
  shortLabel: string
  eyebrow: string
  description: string
  href: string
  icon: LucideIcon
  aside: PatientPortalAside
  showInSidebar: boolean
  showInBottomNav: boolean
  contextLinkLabel?: string
}

const patientPortalRoutes: readonly PatientPortalRoute[] = [
  {
    id: 'home',
    label: 'Inicio',
    shortLabel: 'Inicio',
    eyebrow: 'Panel principal',
    description: 'Resumen del día, agenda y accesos prioritarios del portal.',
    href: '/',
    icon: Home,
    aside: 'summary',
    showInSidebar: true,
    showInBottomNav: true,
  },
  {
    id: 'appointments',
    label: 'Mis Citas',
    shortLabel: 'Citas',
    eyebrow: 'Agenda clínica',
    description: 'Gestiona tus consultas, próximas videollamadas y reprogramaciones.',
    href: '/appointments',
    icon: Calendar,
    aside: 'appointments',
    showInSidebar: true,
    showInBottomNav: true,
  },
  {
    id: 'medical-history',
    label: 'Mi Historia Clinica',
    shortLabel: 'Historia',
    eyebrow: 'Registro clínico',
    description: 'Centraliza anamnesis, antecedentes, recetas y estudios en un solo flujo.',
    href: '/medical-history',
    icon: FileText,
    aside: 'history',
    showInSidebar: true,
    showInBottomNav: true,
    contextLinkLabel: 'Ir a historia clínica',
  },
  {
    id: 'preventive-health',
    label: 'Salud Preventiva',
    shortLabel: 'Salud',
    eyebrow: 'Prevención',
    description: 'Chequeos, prioridades preventivas y próximos estudios recomendados.',
    href: '/preventive-health',
    icon: Heart,
    aside: 'summary',
    showInSidebar: true,
    showInBottomNav: true,
  },
  {
    id: 'pregnancy-prevention',
    label: 'Salud Reproductiva',
    shortLabel: 'Reproductiva',
    eyebrow: 'Salud reproductiva',
    description: 'Seguimiento, consejería y recursos clínicos para salud sexual y reproductiva.',
    href: '/pregnancy-prevention',
    icon: Heart,
    aside: 'summary',
    showInSidebar: true,
    showInBottomNav: false,
  },
  {
    id: 'profile',
    label: 'Perfil',
    shortLabel: 'Perfil',
    eyebrow: 'Tu cuenta',
    description: 'Datos personales, configuración y control de tu información médica.',
    href: '/profile',
    icon: User,
    aside: 'summary',
    showInSidebar: true,
    showInBottomNav: true,
  },
  {
    id: 'results',
    label: 'Resultados',
    shortLabel: 'Resultados',
    eyebrow: 'Estudios e informes',
    description: 'Laboratorio, imágenes y reportes clínicos en una sola vista editorial.',
    href: '/results',
    icon: FileText,
    aside: 'none',
    showInSidebar: false,
    showInBottomNav: false,
    contextLinkLabel: 'Ver resultados',
  },
  {
    id: 'indicators',
    label: 'Indicadores',
    shortLabel: 'Indicadores',
    eyebrow: 'Seguimiento',
    description: 'Evolución de métricas, tendencias y señales clínicas relevantes.',
    href: '/indicators',
    icon: Activity,
    aside: 'none',
    showInSidebar: false,
    showInBottomNav: false,
    contextLinkLabel: 'Abrir indicadores',
  },
] as const

export const dashboardNavigationItems = patientPortalRoutes.filter((route) => route.showInSidebar)

export const dashboardBottomNavItems = patientPortalRoutes.filter((route) => route.showInBottomNav)

export const dashboardQuickCaptureLinks = patientPortalRoutes.filter((route) =>
  route.contextLinkLabel !== undefined
)

export function getPatientPortalRouteByPath(pathname: string): PatientPortalRoute | null {
  const normalizedPath = pathname === '/dashboard' ? '/' : pathname

  const matches = patientPortalRoutes
    .filter((route) => {
      if (route.href === '/') {
        return normalizedPath === '/'
      }

      return normalizedPath === route.href || normalizedPath.startsWith(`${route.href}/`)
    })
    .sort((left, right) => right.href.length - left.href.length)

  return matches[0] ?? null
}
