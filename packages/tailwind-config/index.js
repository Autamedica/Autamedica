/**
 * AutaMedica Design System — Tailwind Preset
 *
 * Paleta calida (stone), sombras con profundidad,
 * acentos por rol (violeta doctor, sky paciente),
 * sistema de elevacion y transiciones premium.
 *
 * @type {import('tailwindcss').Config}
 */
const autamedicaPreset = {
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        "am-primary": {
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
        "am-doctor": {
          50: '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
        },
        "am-patient": {
          50: '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
          700: '#0369A1',
        },
        // Warm neutrals (stone-based, not cold slate)
        "am-surface": {
          white: '#FFFFFF',
          50: '#FAFAF9',
          100: '#F5F5F4',
          200: '#E7E5E4',
          300: '#D6D3D1',
          400: '#A8A29E',
          500: '#78716C',
          600: '#57534E',
          700: '#44403C',
          800: '#292524',
          900: '#1C1917',
        },
        "am-success": { light: '#D1FAE5', DEFAULT: '#10B981', dark: '#065F46' },
        "am-warning": { light: '#FEF3C7', DEFAULT: '#F59E0B', dark: '#92400E' },
        "am-danger": { light: '#FEE2E2', DEFAULT: '#EF4444', dark: '#991B1B' },
        "am-info": { light: '#DBEAFE', DEFAULT: '#3B82F6', dark: '#1E40AF' },

        // Legacy brand colors (backward compat)
        "autamedica-ivory": "var(--ivory)",
        "autamedica-beige": "var(--beige)",
        "autamedica-negro": "var(--negro)",
        "autamedica-blanco": "var(--blanco)",
        "autamedica-primary": "var(--primary)",
        "autamedica-primary-dark": "var(--primary-dark)",
        "autamedica-secondary": "var(--secondary)",
        "autamedica-accent": "var(--accent)",
        "autamedica-text": "var(--text-primary)",
        "autamedica-text-secondary": "var(--text-secondary)",
        "autamedica-text-light": "var(--text-light)",
      },

      fontFamily: {
        sans: [
          "'Plus Jakarta Sans'",
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
        serif: [
          "'Source Serif 4'",
          'Georgia',
          '"Times New Roman"',
          'serif',
        ],
        heading: [
          "'Source Serif 4'",
          'Georgia',
          'serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },

      boxShadow: {
        'am-xs': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'am-sm': '0 1px 3px 0 rgb(0 0 0 / 0.10), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
        'am-md': '0 4px 8px -1px rgb(0 0 0 / 0.12), 0 2px 4px -2px rgb(0 0 0 / 0.08)',
        'am-lg': '0 10px 20px -3px rgb(0 0 0 / 0.15), 0 4px 8px -4px rgb(0 0 0 / 0.08)',
        'am-xl': '0 20px 30px -5px rgb(0 0 0 / 0.15), 0 8px 12px -6px rgb(0 0 0 / 0.08)',
        'am-primary': '0 4px 14px -3px rgb(59 130 246 / 0.35)',
        'am-doctor': '0 4px 14px -3px rgb(139 92 246 / 0.35)',
        'am-success': '0 4px 14px -3px rgb(16 185 129 / 0.30)',
        'am-card-hover': '0 12px 28px -8px rgb(0 0 0 / 0.18), 0 4px 10px -4px rgb(0 0 0 / 0.08)',
      },

      transitionDuration: {
        'am-fast': '150ms',
        'am-base': '200ms',
        'am-slow': '300ms',
        'am-spring': '500ms',
      },

      transitionTimingFunction: {
        'am-ease': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'am-bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 2s infinite',
        'typing': 'typing 1.4s infinite ease-in-out',
        'popIn': 'popIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'slideIn': 'slideIn 0.3s ease',
        'slideInRight': 'slideInRight 0.25s ease-out',
        'fadeIn': 'fadeIn 0.2s ease-out',
        'float': 'float 3s ease-in-out infinite',
        'pulse-ring': 'pulseRing 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scale-in': 'scaleIn 0.3s ease-out',
        'am-shimmer': 'amShimmer 1.5s linear infinite',
        'am-press': 'amPress 0.15s ease-out',
      },

      keyframes: {
        typing: {
          '0%, 80%, 100%': { transform: 'scale(1)', opacity: '0.5' },
          '40%': { transform: 'scale(1.3)', opacity: '1' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.3) translateY(20px)' },
          '70%': { transform: 'scale(1.05) translateY(-5px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        amShimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        amPress: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.97)' },
          '100%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};

export default autamedicaPreset;
