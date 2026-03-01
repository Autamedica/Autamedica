'use client';

import { parsePatient, type Patient } from '@/lib/zod/patients';
import { safeParseProfile, type Profile } from '@/lib/zod/profiles';
import { useSupabase } from '@autamedica/auth/react';
import { logger } from '@autamedica/shared';
import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

interface PatientSessionState {
  user: User | null;
  profile: Profile | null;
  patient: Patient | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: PatientSessionState = {
  user: null,
  profile: null,
  patient: null,
  loading: true,
  error: null,
};

function ensureEmail(user: User): string {
  const candidate = user.email ?? (user.user_metadata as Record<string, unknown> | undefined)?.email;
  if (typeof candidate === 'string' && candidate.length > 0) {
    return candidate;
  }
  return `${user.id}@patients.autamedica.local`;
}

export interface UsePatientSessionResult extends PatientSessionState {
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function usePatientSession(): UsePatientSessionResult {
  const supabase = useSupabase();
  const [state, setState] = useState<PatientSessionState>(INITIAL_STATE);
  const isMountedRef = useRef(false);

  const safeSetState = useCallback(
    (updater: (prev: PatientSessionState) => PatientSessionState) => {
      if (isMountedRef.current) {
        setState(updater);
      }
    },
    [],
  );

  const fetchOrCreateProfile = useCallback(
    async (user: User): Promise<Profile> => {
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      const email = ensureEmail(user);

      // Intento 1: esquema nuevo (user_id)
      let { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      // Si la columna no existe o no hay fila, intentar esquema legacy (id)
      if ((error && error.code !== 'PGRST116') || (!data && !error)) {
        const tryLegacy = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        data = tryLegacy.data as Record<string, unknown> | null;
        error = tryLegacy.error;
      }

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      let profileRow: Record<string, unknown> | null = (data as Record<string, unknown> | null) ?? null;
      // Normalizar id -> user_id si fuese legacy
      if (profileRow && !profileRow['user_id'] && profileRow['id']) {
        profileRow = { ...profileRow, user_id: profileRow['id'] };
      }

      if (!profileRow) {
        // Intentar insertar con user_id; si falla por columna, probar con id
        let inserted: Record<string, unknown> | null = null;
        let insertError: Error | null = null;
        const insert = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            email,
            role: 'patient',
            external_id: user.id,
          })
          .select('*')
          .single();
        inserted = insert.data as Record<string, unknown> | null;
        insertError = insert.error;

        if (insertError) {
          // Reintentar esquema legacy
          const legacy = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              email,
              role: 'patient',
              external_id: user.id,
            })
            .select('*')
            .single();
          inserted = legacy.data as Record<string, unknown> | null;
          insertError = legacy.error;
        }

        if (insertError) {
          throw insertError;
        }

        profileRow = inserted;
      } else {
        const updates: Record<string, unknown> = {};

        if (!profileRow.email) {
          updates.email = email;
        }

        // Evitar escribir columnas que podrían no existir en ciertos esquemas (role/external_id)

        if (Object.keys(updates).length > 0) {
          // Update por user_id o por id según exista
          const updateTry = await supabase
            .from('profiles')
            .update(updates)
            .eq(profileRow['user_id'] ? 'user_id' : 'id', user.id)
            .select('*')
            .single();
          const updated = updateTry.data as Record<string, unknown> | null;
          const updateError = updateTry.error;

          if (updateError) {
            throw updateError;
          }

          profileRow = updated;
        }
      }

      if (!profileRow) {
        throw new Error('Could not retrieve or create profile');
      }

      // Parse robusto: intentar zod; si falla, normalizar mínimamente
      const parsed = safeParseProfile(profileRow);
      if (parsed) return parsed;
      return {
        userId: (profileRow['user_id'] ?? profileRow['id']) as string,
        email: (profileRow['email'] ?? email) as string,
        role: (typeof profileRow['role'] === 'string' ? profileRow['role'] : 'patient') as 'patient' | 'admin',
        firstName: typeof profileRow['first_name'] === 'string' ? profileRow['first_name'] : null,
        lastName: typeof profileRow['last_name'] === 'string' ? profileRow['last_name'] : null,
        phone: typeof profileRow['phone'] === 'string' ? profileRow['phone'] : null,
        avatarUrl: typeof profileRow['avatar_url'] === 'string' ? profileRow['avatar_url'] : null,
        active: typeof profileRow['active'] === 'boolean' ? profileRow['active'] : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as unknown as Profile;
    },
    [supabase],
  );

  const fetchOrCreatePatient = useCallback(
    async (userId: string): Promise<Patient | null> => {
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      let patientRow = data ?? null;

      if (!patientRow) {
        const { data: inserted, error: insertError } = await supabase
          .from('patients')
          .insert({
            user_id: userId,
            active: true,
          })
          .select('*');

        if (insertError) {
          throw insertError;
        }

        if (Array.isArray(inserted) && inserted.length > 0) {
          patientRow = inserted[0];
        } else if (inserted && !Array.isArray(inserted)) {
          patientRow = inserted as Record<string, unknown>;
        }
      }

      return patientRow ? parsePatient(patientRow) : null;
    },
    [supabase],
  );

  const refresh = useCallback(async () => {
    // SSR guard: Don't try to fetch session during server-side rendering
    if (!supabase) {
      if (typeof window === 'undefined') {
        safeSetState(prev => ({ ...prev, loading: false }));
      }
      return;
    }

    safeSetState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      const session = sessionData.session;

      if (!session?.user) {
        safeSetState(() => ({ ...INITIAL_STATE, loading: false, error: null }));
        return;
      }

      const user = session.user;
      const profile = await fetchOrCreateProfile(user);

      if (profile.role && profile.role !== 'patient') {
        safeSetState(() => ({
          user,
          profile,
          patient: null,
          loading: false,
          error: 'Tu cuenta no tiene acceso al portal de pacientes.',
        }));
        return;
      }

      const patient = await fetchOrCreatePatient(user.id);

      safeSetState(() => ({
        user,
        profile,
        patient,
        loading: false,
        error: null,
      }));
    } catch (error) {
      logger.error('[usePatientSession] Failed to sync session', error);
      safeSetState(prev => ({
        ...prev,
        loading: false,
        error: 'No pudimos cargar tu sesión. Intentá nuevamente.',
      }));
    }
  }, [fetchOrCreatePatient, fetchOrCreateProfile, safeSetState, supabase]);

  useEffect(() => {
    isMountedRef.current = true;

    // SSR guard
    if (typeof window === 'undefined') {
      safeSetState(prev => ({ ...prev, loading: false }));
      return () => {
        isMountedRef.current = false;
      };
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [safeSetState]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    refresh();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMountedRef.current) {
        return;
      }

      if (event === 'SIGNED_OUT') {
        safeSetState(() => ({ ...INITIAL_STATE, loading: false }));
        return;
      }

      if (session?.user) {
        refresh();
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [refresh, safeSetState, supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    safeSetState(() => ({ ...INITIAL_STATE, loading: false }));
  }, [safeSetState, supabase]);

  return {
    ...state,
    refresh,
    signOut,
  };
}
