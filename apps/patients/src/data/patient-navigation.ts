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
    eyebrow: 'Panel',
    description: 'Actividad, agenda y accesos principales.',
    href: '/',
    icon: Home,
    aside: 'summary',
    showInSidebar: true,
    showInBottomNav: true,
  },
  {
    id: 'appointments',
    label: 'Citas',
    shortLabel: 'Citas',
    eyebrow: 'Agenda',
    description: 'Consultas, videollamadas y reprogramaciones.',
    href: '/appointments',
    icon: Calendar,
    aside: 'appointments',
    showInSidebar: true,
    showInBottomNav: true,
  },
  {
    id: 'medical-history',
    label: 'Historia',
    shortLabel: 'Historia',
    eyebrow: 'Historia',
    description: 'Anamnesis, antecedentes, recetas y estudios.',
    href: '/medical-history',
    icon: FileText,
    aside: 'history',
    showInSidebar: true,
    showInBottomNav: true,
    contextLinkLabel: 'Ir a historia clínica',
  },
  {
    id: 'preventive-health',
    label: 'Prevención',
    shortLabel: 'Prevención',
    eyebrow: 'Prevención',
    description: 'Chequeos y próximos estudios.',
    href: '/preventive-health',
    icon: Heart,
    aside: 'summary',
    showInSidebar: true,
    showInBottomNav: true,
  },
  {
    id: 'pregnancy-prevention',
    label: 'Reproductiva',
    shortLabel: 'Reproductiva',
    eyebrow: 'Reproductiva',
    description: 'Seguimiento, consejería y recursos.',
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
    eyebrow: 'Cuenta',
    description: 'Datos personales y configuración.',
    href: '/profile',
    icon: User,
    aside: 'summary',
    showInSidebar: false,
    showInBottomNav: false,
  },
  {
    id: 'results',
    label: 'Resultados',
    shortLabel: 'Resultados',
    eyebrow: 'Estudios',
    description: 'Laboratorio, imágenes e informes.',
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
    description: 'Tendencias y evolución.',
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
