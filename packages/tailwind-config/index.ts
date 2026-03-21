import type { Config } from 'tailwindcss';

/**
 * Configuración compartida de Tailwind CSS para AutaMedica
 *
 * Design system inspirado en Doctolib:
 * - Azul primario (confianza, profesionalismo)
 * - Acentos por rol (violeta doctor, sky paciente)
 * - Superficies slate neutras
 * - Grid de 8px
 *
 * @see https://turborepo.com/docs/guides/tools/tailwind
 */
const autamedicaPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // CSS variable fallbacks (legacy compat)
        background: "var(--background)",
        foreground: "var(--foreground)",

        // AutaMedica unified palette
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
        "am-surface": {
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
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
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
      },
    },
  },
  plugins: [],
} satisfies Partial<Config>;

export default autamedicaPreset;
