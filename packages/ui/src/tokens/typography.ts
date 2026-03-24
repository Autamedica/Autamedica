/**
 * AutaMedica Design Tokens — Typography
 *
 * Geist Variable (primary) with Inter fallback.
 * Semantic scale for consistent hierarchy across the portal.
 */

export const fontFamily = {
  sans: [
    "'Geist'",
    'Inter',
    'system-ui',
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    'sans-serif',
  ],
  mono: [
    '"JetBrains Mono"',
    'ui-monospace',
    'SFMono-Regular',
    'Menlo',
    'monospace',
  ],
} as const

export const fontSize = {
  xs: ['0.75rem', { lineHeight: '1rem' }],
  sm: ['0.875rem', { lineHeight: '1.25rem' }],
  base: ['1rem', { lineHeight: '1.5rem' }],
  lg: ['1.125rem', { lineHeight: '1.75rem' }],
  xl: ['1.25rem', { lineHeight: '1.75rem' }],
  '2xl': ['1.5rem', { lineHeight: '2rem' }],
  '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
  '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
} as const

export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const

/**
 * Semantic typography scale for the doctor portal.
 * Maps roles to specific size/weight/tracking combinations.
 *
 * Usage in Tailwind classes:
 *   display-lg  → text-4xl font-bold tracking-tight
 *   display-sm  → text-3xl font-bold -tracking-wide (custom)
 *   heading-lg  → text-xl font-semibold -tracking-[0.01em]
 *   heading-sm  → text-base font-semibold
 *   body-lg     → text-base font-normal
 *   body-sm     → text-sm font-normal
 *   caption     → text-xs font-medium tracking-wide
 *   overline    → text-[0.6875rem] font-semibold uppercase tracking-[0.08em]
 */
export const typographyScale = {
  'display-lg': { size: '2.25rem', lineHeight: '2.5rem', weight: '700', tracking: '-0.025em' },
  'display-sm': { size: '1.875rem', lineHeight: '2.25rem', weight: '700', tracking: '-0.02em' },
  'heading-lg': { size: '1.25rem', lineHeight: '1.75rem', weight: '600', tracking: '-0.01em' },
  'heading-sm': { size: '1rem', lineHeight: '1.5rem', weight: '600', tracking: '0' },
  'body-lg':    { size: '1rem', lineHeight: '1.625rem', weight: '400', tracking: '0' },
  'body-sm':    { size: '0.875rem', lineHeight: '1.375rem', weight: '400', tracking: '0' },
  'caption':    { size: '0.75rem', lineHeight: '1rem', weight: '500', tracking: '0.01em' },
  'overline':   { size: '0.6875rem', lineHeight: '1rem', weight: '600', tracking: '0.08em' },
} as const
