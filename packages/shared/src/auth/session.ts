/**
 * Server-side session verification using JWT
 * No Supabase client needed - direct JWT verification
 */

import { jwtVerify, type JWTPayload } from 'jose';
import type { NextRequest } from 'next/server';
import { logger } from '../services/logger.service';

export type SessionRole =
  | 'patient'
  | 'doctor'
  | 'company'
  | 'company_admin'
  | 'organization_admin'
  | 'platform_admin'
  | 'admin';

export interface Session {
  user: {
    id: string;
    email?: string;
    role?: SessionRole;
  };
}

interface CookieReader {
  get(name: string): { value: string } | undefined;
}

const SESSION_COOKIE_BASENAMES = ['sb-access-token', 'sb-auth-token'];
const BASE64_VALUE_PATTERN = /^[A-Za-z0-9+/_=-]+$/;
const JWT_PATTERN = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asSessionRole(role: unknown): SessionRole | undefined {
  if (typeof role !== 'string') {
    return undefined;
  }

  const normalized = role as SessionRole;
  const allowedRoles: SessionRole[] = [
    'patient',
    'doctor',
    'company',
    'company_admin',
    'organization_admin',
    'platform_admin',
    'admin',
  ];

  return allowedRoles.includes(normalized) ? normalized : undefined;
}

function getProjectRefFromSupabaseUrl(supabaseUrl?: string): string | null {
  if (!supabaseUrl) {
    return null;
  }

  try {
    const hostname = new URL(supabaseUrl).hostname;
    const projectRef = hostname.split('.')[0];
    return projectRef || null;
  } catch {
    return null;
  }
}

function getSessionCookieNames(): string[] {
  const names = [...SESSION_COOKIE_BASENAMES];
  const projectRef = getProjectRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (projectRef) {
    names.unshift(`sb-${projectRef}-auth-token`);
  }

  return Array.from(new Set(names));
}

function readCookieValue(cookies: CookieReader, cookieName: string): string | null {
  const directValue = cookies.get(cookieName)?.value;
  if (directValue) {
    return directValue;
  }

  const chunks: string[] = [];
  for (let index = 0; ; index += 1) {
    const chunk = cookies.get(`${cookieName}.${index}`)?.value;
    if (!chunk) {
      break;
    }
    chunks.push(chunk);
  }

  return chunks.length > 0 ? chunks.join('') : null;
}

function decodeBase64Url(encoded: string): string | null {
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

function extractTokenFromPayload(payload: unknown): string | null {
  if (typeof payload === 'string') {
    return payload;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const token = extractTokenFromPayload(item);
      if (token) {
        return token;
      }
    }
    return null;
  }

  if (!isRecord(payload)) {
    return null;
  }

  const accessToken = payload['access_token'];
  if (typeof accessToken === 'string') {
    return accessToken;
  }

  const accessTokenCamel = payload['accessToken'];
  if (typeof accessTokenCamel === 'string') {
    return accessTokenCamel;
  }

  const token = payload['token'];
  if (typeof token === 'string') {
    return token;
  }

  const nestedKeys = ['currentSession', 'session', 'data'] as const;
  for (const key of nestedKeys) {
    const nestedValue = payload[key];
    const nestedToken = extractTokenFromPayload(nestedValue);
    if (nestedToken) {
      return nestedToken;
    }
  }

  return null;
}

function resolveJwtFromCookieValue(rawValue: string): string | null {
  const queue: string[] = [rawValue];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate || visited.has(candidate)) {
      continue;
    }
    visited.add(candidate);

    if (JWT_PATTERN.test(candidate)) {
      return candidate;
    }

    try {
      const decodedURIComponentValue = decodeURIComponent(candidate);
      if (decodedURIComponentValue !== candidate) {
        queue.push(decodedURIComponentValue);
      }
    } catch {
      // Ignore malformed URI sequences and continue.
    }

    if (candidate.startsWith('base64-')) {
      const decoded = decodeBase64Url(candidate.slice('base64-'.length));
      if (decoded) {
        queue.push(decoded);
      }
      continue;
    }

    if (candidate.length > 24 && BASE64_VALUE_PATTERN.test(candidate)) {
      const decoded = decodeBase64Url(candidate);
      if (decoded && decoded !== candidate) {
        queue.push(decoded);
      }
    }

    try {
      const parsed = JSON.parse(candidate) as unknown;
      const token = extractTokenFromPayload(parsed);
      if (token) {
        queue.push(token);
      }
    } catch {
      // Ignore non-JSON values and continue.
    }
  }

  return null;
}

function extractSessionTokenFromCookies(cookies: CookieReader): string | null {
  const cookieNames = getSessionCookieNames();

  for (const cookieName of cookieNames) {
    const rawValue = readCookieValue(cookies, cookieName);
    if (!rawValue) {
      continue;
    }

    const token = resolveJwtFromCookieValue(rawValue);
    if (token) {
      return token;
    }
  }

  return null;
}

function extractRoleFromPayload(payload: JWTPayload): SessionRole | undefined {
  const directRole = asSessionRole(payload['user_role']) ?? asSessionRole(payload['role']);
  if (directRole) {
    return directRole;
  }

  const appMetadata = payload['app_metadata'];
  if (isRecord(appMetadata)) {
    const appRole = asSessionRole(appMetadata['role']);
    if (appRole) {
      return appRole;
    }
  }

  const userMetadata = payload['user_metadata'];
  if (isRecord(userMetadata)) {
    return asSessionRole(userMetadata['role']);
  }

  return undefined;
}

function extractEmailFromPayload(payload: JWTPayload): string | undefined {
  const email = payload['email'];
  return typeof email === 'string' ? email : undefined;
}

/**
 * Get session from request cookies using JWT verification
 * No Supabase client needed - prevents hardcoded credentials
 */
export async function getSession(req: NextRequest): Promise<Session | null> {
  const token = extractSessionTokenFromCookies(req.cookies);

  if (!token) {
    return null;
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error('SUPABASE_JWT_SECRET not configured - required for session verification');
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );

    const role = extractRoleFromPayload(payload);
    const email = extractEmailFromPayload(payload);

    return {
      user: {
        id: String(payload.sub || ''),
        email,
        role
      }
    };
  } catch (error) {
    // Invalid or expired token
    logger.error('Session verification failed:', error);
    return null;
  }
}

/**
 * Verify user has one of the allowed roles
 */
export function hasRole(session: Session | null, allowedRoles: SessionRole[]): boolean {
  if (!session?.user.role) {
    return false;
  }
  return allowedRoles.includes(session.user.role);
}
