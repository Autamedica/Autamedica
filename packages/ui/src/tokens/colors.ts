/**
 * AutaMedica Design Tokens — Color Palette
 *
 * Inspired by Doctolib's medical-professional aesthetic:
 * blue for trust, role-specific accents, clean neutral surfaces.
 */

export const colors = {
  /* ── Primary (blue — trust, calm, professionalism) ── */
  primary: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
  },

  /* ── Role accents ── */
  doctor: {
    50: '#F5F3FF',
    100: '#EDE9FE',
    200: '#DDD6FE',
    400: '#A78BFA',
    500: '#8B5CF6',
    600: '#7C3AED',
    700: '#6D28D9',
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

  /* ── Surfaces (slate-based neutrals) ── */
  surface: {
    white: '#FFFFFF',
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },

  /* ── Semantic ── */
  success: { light: '#D1FAE5', DEFAULT: '#10B981', dark: '#065F46' },
  warning: { light: '#FEF3C7', DEFAULT: '#F59E0B', dark: '#92400E' },
  danger: { light: '#FEE2E2', DEFAULT: '#EF4444', dark: '#991B1B' },
  info: { light: '#DBEAFE', DEFAULT: '#3B82F6', dark: '#1E40AF' },

  /* ── Text ── */
  text: {
    primary: '#0F172A',
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
