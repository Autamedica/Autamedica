/**
 * AutaMedica Design Tokens — Color Palette
 *
 * White surfaces, black text, and one saturated sky-blue accent
 * shared across portals.
 */

export const colors = {
  /* ── Primary (blue — trust, calm, professionalism) ── */
  primary: {
    50: '#F0F9FF',
    100: '#E0F2FE',
    200: '#BAE6FD',
    300: '#7DD3FC',
    400: '#38BDF8',
    500: '#0EA5E9',
    600: '#0284C7',
    700: '#0369A1',
    800: '#075985',
    900: '#0C4A6E',
  },

  /* ── Role accents (unified) ── */
  doctor: {
    50: '#F0F9FF',
    100: '#E0F2FE',
    200: '#BAE6FD',
    400: '#38BDF8',
    500: '#0EA5E9',
    600: '#0284C7',
    700: '#0369A1',
  },
  patient: {
    50: '#F0F9FF',
    100: '#E0F2FE',
    200: '#BAE6FD',
    400: '#38BDF8',
    500: '#0EA5E9',
    600: '#0284C7',
    700: '#0369A1',
  },

  /* ── Surfaces ── */
  surface: {
    white: '#FFFFFF',
    50: '#F8FBFF',
    100: '#F1F7FD',
    200: '#DCE9F5',
    300: '#C5D6E6',
    400: '#8AA0B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#0F172A',
    900: '#050505',
  },

  /* ── Semantic ── */
  success: { light: '#D1FAE5', DEFAULT: '#10B981', dark: '#065F46' },
  warning: { light: '#FEF3C7', DEFAULT: '#F59E0B', dark: '#92400E' },
  danger: { light: '#FEE2E2', DEFAULT: '#EF4444', dark: '#991B1B' },
  info: { light: '#DBEAFE', DEFAULT: '#3B82F6', dark: '#1E40AF' },

  /* ── Text ── */
  text: {
    primary: '#050505',
    secondary: '#475569',
    tertiary: '#94A3B8',
    inverse: '#FFFFFF',
  },

  /* ── Dark mode (video call surfaces) ── */
  dark: {
    bg: '#0F172A',
    surface: '#1E293B',
    elevated: '#334155',
    border: '#475569',
  },
} as const

export type ColorToken = typeof colors
