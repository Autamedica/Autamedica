/**
 * @fileoverview Configuración centralizada de enrutamiento por roles
 * @module shared/role-routing
 *
 * Este módulo centraliza toda la lógica de routing basada en roles de usuario,
 * permitiendo un sistema de autenticación de dominio único con redirección
 * automática a los portales correspondientes.
 */

// Importar UserRole desde auth/portals para evitar dependencia circular
import type { UserRole } from './auth/portals';
import { ensureServerEnv } from './env';

/**
 * URLs base para cada aplicación por entorno
 * CONFIGURACIÓN: URLs de deployment de Cloudflare Pages para producción
 * SEGURIDAD: Cada rol solo tiene acceso a su aplicación específica
 */
function getBaseUrlByRole(): Record<UserRole, string> {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  const readEnv = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = env?.[key];
      if (value) {
        return value;
      }
    }
    return undefined;
  };

  const isProduction = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

  if (isProduction) {
    return {
      'patient': readEnv('PUBLIC_BASE_URL_PATIENTS', 'PUBLIC_PATIENTS_URL')
        || 'https://paciente.autamedica.com',
      'doctor': readEnv('PUBLIC_BASE_URL_DOCTORS', 'PUBLIC_DOCTORS_URL')
        || 'https://doctor.autamedica.com',
      'company': readEnv('PUBLIC_BASE_URL_COMPANIES', 'PUBLIC_COMPANIES_URL')
        || 'https://empresa.autamedica.com',
      'company_admin': readEnv('PUBLIC_BASE_URL_COMPANIES', 'PUBLIC_COMPANIES_URL')
        || 'https://empresa.autamedica.com',
      'organization_admin': readEnv('PUBLIC_BASE_URL_ADMIN', 'PUBLIC_ADMIN_URL')
        || 'https://autamedica-admin.pages.dev',
      'platform_admin': readEnv('PUBLIC_BASE_URL_ADMIN', 'PUBLIC_ADMIN_URL')
        || 'https://autamedica-admin.pages.dev',
    };
  }

  // Development: localhost con puertos específicos
  return {
    'patient': 'http://localhost:3002',
    'doctor': 'http://localhost:3001',
    'company': 'http://localhost:3003',
    'company_admin': 'http://localhost:3003',
    'organization_admin': 'http://localhost:3004',
    'platform_admin': 'http://localhost:3004',
  };
}

export const BASE_URL_BY_ROLE: Record<UserRole, string> = getBaseUrlByRole();

/**
 * Rutas home por defecto dentro de cada aplicación
 */
export const HOME_BY_ROLE: Record<UserRole, string> = {
  'patient': '/',
  'doctor': '/',
  'company': '/',
  'company_admin': '/',
  'organization_admin': '/',
  'platform_admin': '/',
};

/**
 * Genera la URL completa de destino para un rol específico
 * @param role - Rol del usuario
 * @param path - Ruta específica (opcional, usa home por defecto)
 * @returns URL completa de destino
 */
export function getTargetUrlByRole(role: UserRole, path?: string): string {
  const baseUrl = BASE_URL_BY_ROLE[role];
  if (!baseUrl) {
    throw new Error(`No base URL configured for role: ${role}`);
  }

  const targetPath = path || HOME_BY_ROLE[role];
  if (!targetPath) {
    throw new Error(`No home path configured for role: ${role}`);
  }

  return new URL(targetPath, baseUrl).toString();
}

/**
 * Obtiene la configuración de dominio para cookies compartidas
 * Solo funciona en servidor (acceso a ensureServerEnv)
 */
export function getCookieDomain(): string {
  try {
    const authDomain = ensureServerEnv('AUTH_COOKIE_DOMAIN');
    return authDomain;
  } catch {
    // Fallback si AUTH_COOKIE_DOMAIN no está definido
    try {
      const nodeEnv = ensureServerEnv('NODE_ENV');
      return nodeEnv === 'production' ? '.autamedica.com' : 'localhost';
    } catch {
      return 'localhost';
    }
  }
}

/**
 * Valida si un rol es válido
 * @param role - Rol a validar
 * @returns true si el rol es válido
 */
export function isValidRole(role: string): role is UserRole {
  return Object.keys(BASE_URL_BY_ROLE).includes(role);
}

/**
 * Obtiene el portal recomendado para un rol específico
 * Útil para configurar parámetros de redirección
 */
export function getPortalForRole(role: UserRole): string {
  const portalMap: Record<UserRole, string> = {
    'patient': 'patients',
    'doctor': 'doctors',
    'company': 'companies',
    'company_admin': 'companies',
    'organization_admin': 'admin',
    'platform_admin': 'admin',
  };

  const portal = portalMap[role];
  if (!portal) {
    throw new Error(`No portal configured for role: ${role}`);
  }

  return portal;
}

/**
 * Mapeo de portales a roles (inverso de getPortalForRole)
 */
export const PORTAL_TO_ROLE: Record<string, UserRole> = {
  patients: 'patient',
  doctors: 'doctor',
  companies: 'company_admin',
  admin: 'organization_admin',
};

const PORTAL_ALIASES: Record<string, keyof typeof PORTAL_TO_ROLE> = {
  medico: 'doctors',
  medicos: 'doctors',
  paciente: 'patients',
  pacientes: 'patients',
  company: 'companies',
  empresa: 'companies',
  empresas: 'companies',
};

/**
 * Obtiene el rol basado en el portal
 * @param portal - Nombre del portal
 * @returns Rol correspondiente o undefined si no es válido
 */
export function getRoleForPortal(portal: string): UserRole | undefined {
  return PORTAL_TO_ROLE[portal];
}

/**
 * Resuelve un rol desde un portal usando aliases comunes.
 * Acepta portales canónicos y variantes históricas/español.
 */
export function resolveRoleFromPortal(portal?: string | null): UserRole | undefined {
  if (!portal) {
    return undefined;
  }

  const normalized = portal.toLowerCase();
  const canonicalPortal = PORTAL_ALIASES[normalized] ?? normalized;
  return PORTAL_TO_ROLE[canonicalPortal];
}

/**
 * Configuración de URLs de autenticación centralizadas
 */
export const AUTH_URLS = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  CALLBACK: '/auth/callback',
  SELECT_ROLE: '/auth/select-role',
  FORGOT_PASSWORD: '/auth/forgot-password',
} as const;

/**
 * Genera URL de login con parámetros de redirección
 * @param returnTo - URL de retorno después del login
 * @param portal - Portal específico (opcional)
 * @returns URL de login completa
 */
export function getLoginUrl(returnTo?: string, portal?: string): string {
  let webAppUrl: string;
  try {
    webAppUrl = ensureServerEnv('PUBLIC_APP_URL');
  } catch {
    try {
      webAppUrl = ensureServerEnv('PUBLIC_BASE_URL_WEB_APP');
    } catch {
      webAppUrl = 'https://autamedica-web.pages.dev';
    }
  }
  const loginUrl = new URL(AUTH_URLS.LOGIN, webAppUrl);

  if (returnTo) {
    loginUrl.searchParams.set('returnTo', returnTo);
  }

  if (portal) {
    loginUrl.searchParams.set('portal', portal);
  }

  return loginUrl.toString();
}
