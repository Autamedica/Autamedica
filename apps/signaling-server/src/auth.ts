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

  if (!supabase) {
    logger.error('[Auth] Supabase not configured: rejecting socket');
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

    // Authenticated PostgREST query: a global anon client alone does not
    // carry the incoming user's JWT and would be denied by profiles RLS.
    const scopedClient = createClient<Database>(supabaseUrl!, supabaseKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: profile, error: profileError } = await scopedClient
      .from('profiles').select('role').eq('user_id', userId).maybeSingle();
    const role = profile?.role;
    if (profileError || (role !== 'patient' && role !== 'doctor')) {
      return { authenticated: false };
    }

    // A self-selected doctor role is only an onboarding request.
    // Signaling access to clinical rooms requires an approved non-provisional
    // doctor record, not just a profile role or JWT metadata.
    if (role === 'doctor') {
      const { data: doctor, error: doctorError } = await scopedClient
        .from('doctors')
        .select('active, license_number')
        .eq('user_id', userId)
        .maybeSingle();
      if (
        doctorError ||
        doctor?.active !== true ||
        !doctor.license_number?.trim() ||
        /^PENDING(?:-|$)/i.test(doctor.license_number.trim())
      ) {
        return { authenticated: false };
      }
    }

    return { authenticated: true, role, userId };
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
