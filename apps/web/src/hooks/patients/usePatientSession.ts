'use client';

import type { Patient } from '@/lib/patients/lib/zod/patients';
import type { Profile } from '@/lib/patients/lib/zod/profiles';
import { patientSessionService } from '@/lib/patients/services/patient-session.service';
import { useSupabase } from '@autamedica/auth/react';
import { logger } from '@autamedica/shared';
import { clearManualSignout, markManualSignout, wasManualSignout } from '@/lib/auth/browser-storage';
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
      return patientSessionService.fetchOrCreateProfile(supabase, user);
    },
    [supabase],
  );

  const fetchOrCreatePatient = useCallback(
    async (userId: string): Promise<Patient | null> => {
      if (!supabase) {
        throw new Error('Supabase client not available');
      }
      return patientSessionService.fetchOrCreatePatient(supabase, userId);
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
	          error: 'Esta cuenta corresponde a otro portal. Cambiá de acceso o contactá soporte.',
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
        // If the user didn't trigger logout manually, redirect with expired flag
        if (!wasManualSignout()) {
          window.location.href = '/auth/login?expired=true';
        }
        clearManualSignout();
        return;
      }

      // Only re-fetch on actual sign-in, not on token refreshes
      // (TOKEN_REFRESHED doesn't change profile/patient data)
      if (event === 'SIGNED_IN' && session?.user) {
        refresh();
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [refresh, safeSetState, supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    markManualSignout();
    await supabase.auth.signOut();
    safeSetState(() => ({ ...INITIAL_STATE, loading: false }));
  }, [safeSetState, supabase]);

  return {
    ...state,
    refresh,
    signOut,
  };
}
