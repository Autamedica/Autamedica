/**
 * Authentication module for signaling server
 * 
 * Valida JWT tokens de Supabase para autenticar conexiones Socket.io
 */

import type { Database } from '@autamedica/types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase: SupabaseClient<Database> | null = supabaseUrl && supabaseKey
  ? createClient<Database>(supabaseUrl, supabaseKey)
  : null;

export interface AuthResult {
  authenticated: boolean;
  role?: 'patient' | 'doctor';
  userId?: string;
}

/**
 * Authenticate socket connection using JWT token
 */
export async function authenticateSocket(
  userId: string,
  token?: string
): Promise<AuthResult> {
  // En desarrollo, permitir sin token si está configurado
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    logger.warn('[Auth] Skipping authentication (development mode)');
    return {
      authenticated: true,
      role: 'patient', // Default
      userId,
    };
  }

  // Validar que hay token
  if (!token) {
    logger.warn('[Auth] No token provided');
    return { authenticated: false };
  }

  // Si no hay Supabase configurado, permitir en desarrollo
  if (!supabase) {
    logger.error('[Auth] Supabase not configured; refusing unauthenticated socket');
    return { authenticated: false };
  }

  try {
    // Validar token con Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      logger.warn('[Auth] Invalid token:', error?.message);
      return { authenticated: false };
    }

    // Verificar que el userId coincide
    if (data.user.id !== userId) {
      logger.warn('[Auth] User ID mismatch');
      return { authenticated: false };
    }

    // Privileged roles must come from server-managed app_metadata only.
    const role = data.user.app_metadata?.role === 'doctor' ? 'doctor' : 'patient';

    logger.info(`[Auth] User authenticated: ${userId} (${role})`);

    return {
      authenticated: true,
      role: role as 'patient' | 'doctor',
      userId,
    };
  } catch (error) {
    logger.error('[Auth] Authentication error:', error);
    return { authenticated: false };
  }
}

/**
 * Verify JWT token (sin Supabase, solo validación de firma)
 */
export function verifyJWT(token: string): unknown {
  try {
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;

    if (!jwtSecret) {
      logger.warn('[Auth] JWT secret not configured');
      return null;
    }

    const decoded = jwt.verify(token, jwtSecret);
    return decoded;
  } catch (error) {
    logger.error('[Auth] JWT verification failed:', error);
    return null;
  }
}
