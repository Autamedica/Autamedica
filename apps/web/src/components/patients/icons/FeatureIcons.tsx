import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

/** Video call — camera with signal waves */
export function IconVideoconsulta(props: P) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2" y="8" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M22 13l6-3.5v13L22 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <path d="M26 4c1.5 1 2.5 2.8 2.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <path d="M24 6c1 .7 1.5 1.8 1.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    </svg>
  )
}

/** Calendar with clock — turnos/agenda */
export function IconTurnos(props: P) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3" y="6" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h20" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <path d="M9 3v5M17 3v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="23" cy="23" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M23 20v3.5l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Clipboard with heart — anamnesis/historia clínica */
export function IconAnamnesis(props: P) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="5" y="4" width="22" height="26" rx="3" stroke="currentColor" strokeWidth="2" />
      <rect x="10" y="2" width="12" height="5" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 15c-1-1.5-3.5-2-4.5-.5s.5 3.5 4.5 6c4-2.5 5.5-4.5 4.5-6s-3.5-1-4.5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 24h12M10 27h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
    </svg>
  )
}

/** Pill bottle with Rx — recetas */
export function IconRecetas(props: P) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="7" y="8" width="18" height="22" rx="3" stroke="currentColor" strokeWidth="2" />
      <rect x="9" y="4" width="14" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 17h6M16 14v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <circle cx="25" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M23 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M22.5 5.5l5 5" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    </svg>
  )
}

/** Document with timeline — historial */
export function IconHistorial(props: P) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M6 5h14l6 6v18a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" />
      <path d="M20 5v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.4" />
      <circle cx="11" cy="16" r="1.5" fill="currentColor" opacity="0.5" />
      <circle cx="11" cy="21" r="1.5" fill="currentColor" opacity="0.5" />
      <circle cx="11" cy="26" r="1.5" fill="currentColor" opacity="0.5" />
      <path d="M15 16h6M15 21h4M15 26h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M11 17.5v2M11 22.5v2" stroke="currentColor" strokeWidth="1" opacity="0.2" />
    </svg>
  )
}

/** Speech bubbles with people — comunidad */
export function IconComunidad(props: P) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M4 8a3 3 0 013-3h12a3 3 0 013 3v7a3 3 0 01-3 3h-3l-4 3.5V18H7a3 3 0 01-3-3V8z" stroke="currentColor" strokeWidth="2" />
      <path d="M22 12h3a3 3 0 013 3v7a3 3 0 01-3 3h-2v3.5L19 25h-4a3 3 0 01-3-3v-1" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <circle cx="10" cy="10.5" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="13.5" cy="10.5" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="17" cy="10.5" r="1" fill="currentColor" opacity="0.4" />
    </svg>
  )
}
