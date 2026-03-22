/**
 * Funciones de manejo de sesión
 *
 * Este módulo provee funciones para obtener, validar y manejar sesiones de usuario
 * con integración completa con los tipos de @autamedica/types.
 *
 * Framework-agnostic: lanza RedirectError que el caller (Astro middleware, etc.) debe manejar.
 * Todas las funciones que requieren un cliente Supabase reciben un Request como parámetro.
 */

import { createServerClientFromRequest } from "./server";
import type { User, UserSession } from "@autamedica/types";
import { toISODateString } from "@autamedica/types";
import type { UserRole, Portal } from "./roles";
import { canAccessPortal, isUserRole, ROLES } from "./roles";
import { logger } from '@autamedica/shared';

const DEFAULT_PORTAL_REDIRECT: Record<UserRole, string> = {
  patient: "/patients",
  doctor: "/doctors",
  company: "/companies",
  company_admin: "/companies",
  organization_admin: "/admin",
  admin: "/admin",
  platform_admin: "/admin",
};

function normalizeRole(role: unknown): UserRole {
  if (typeof role === "string") {
    if (role === ROLES.COMPANY_ADMIN) {
      return ROLES.ORGANIZATION_ADMIN;
    }

    if (isUserRole(role)) {
      return role;
    }
  }

  return ROLES.PATIENT;
}

function getCentralAuthOrigin(): string {
  if (process.env.PUBLIC_APP_URL) {
    return process.env.PUBLIC_APP_URL;
  }

  return process.env.NODE_ENV === 'production'
    ? 'https://www.autamedica.com'
    : 'http://localhost:3000';
}

function buildCentralLoginUrl(returnTo?: string): string {
  const loginUrl = new URL('/auth/login', getCentralAuthOrigin());

  if (returnTo && !returnTo.startsWith('/auth/')) {
    loginUrl.searchParams.set('returnTo', returnTo);
  }

  return loginUrl.toString();
}

/**
 * Redirect helper: throws a RedirectError that the caller must handle.
 */
export class RedirectError extends Error {
  public readonly url: string;
  constructor(url: string) {
    super(`Redirect to ${url}`);
    this.name = 'RedirectError';
    this.url = url;
  }
}

function performRedirect(url: string): never {
  throw new RedirectError(url);
}

/**
 * Obtiene la sesión actual del usuario a partir de un Request.
 * @returns La sesión del usuario o null si no está autenticado
 */
export async function getSession(request: Request): Promise<UserSession | null> {
  try {
    const supabase = createServerClientFromRequest(request);
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      return null;
    }

    const userSession: UserSession = {
      user: {
        id: session.user.id,
        email: session.user.email ?? "",
        emailVerified: !!session.user.email_confirmed_at,
        role: normalizeRole(session.user.user_metadata?.role),
        createdAt: toISODateString(new Date(session.user.created_at)),
        updatedAt: toISODateString(new Date(session.user.updated_at ?? session.user.created_at)),
      },
      accessToken: session.access_token,
      refreshToken: session.refresh_token || "",
      expiresAt: toISODateString(new Date((session.expires_at ?? 0) * 1000)),
    };

    return userSession;
  } catch (error) {
    logger.error("Error getting session:", error);
    return null;
  }
}

/**
 * Requiere una sesión válida, lanza RedirectError si no está autenticado.
 */
export async function requireSession(
  request: Request,
  redirectTo?: string
): Promise<UserSession> {
  const session = await getSession(request);

  if (!session) {
    performRedirect(buildCentralLoginUrl(redirectTo));
  }

  return session as UserSession;
}

/**
 * Requiere acceso a un portal específico
 */
export async function requirePortalAccess(
  request: Request,
  portal: Portal,
  redirectTo?: string
): Promise<UserSession> {
  const session = await requireSession(request, redirectTo);

  if (!canAccessPortal(session.user.role, portal)) {
    performRedirect(DEFAULT_PORTAL_REDIRECT[session.user.role] || "/");
  }

  return session;
}

/**
 * Cierra la sesión del usuario
 */
export async function signOut(request: Request): Promise<never> {
  const supabase = createServerClientFromRequest(request);
  const { error } = await supabase.auth.signOut();

  if (error) {
    logger.error("Error signing out:", error);
  }

  performRedirect("/");
}

/**
 * Obtiene solo el usuario actual sin la información completa de sesión
 */
export async function getCurrentUser(request: Request): Promise<User | null> {
  const session = await getSession(request);
  return session?.user || null;
}

/**
 * Verifica si el usuario actual tiene un rol específico
 */
export async function hasRole(request: Request, role: UserRole): Promise<boolean> {
  const user = await getCurrentUser(request);
  return user?.role === role;
}

/**
 * Verifica si el usuario actual puede acceder a un portal
 */
export async function hasPortalAccess(request: Request, portal: Portal): Promise<boolean> {
  const user = await getCurrentUser(request);
  return user ? canAccessPortal(user.role, portal) : false;
}
