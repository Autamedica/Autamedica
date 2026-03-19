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

