'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MediaState, ConnectionQuality, SessionParticipant, SessionEvent } from '@autamedica/types';
import { logger } from '@autamedica/shared';
import {
  telemedicineService,
  mapApiSession,
  type ApiSession,
  type StartSessionResponse,
} from '@/lib/patients/services/telemedicine.service';

interface UseTelemedicineReturn {
  session: ApiSession | null;
  participants: SessionParticipant[];
  events: SessionEvent[];
  localMediaState: MediaState;
  connectionQuality: ConnectionQuality;
  loading: boolean;
  error: string | null;
  startSession: (appointmentId: string, doctorId: string) => Promise<StartSessionResponse | null>;
  endSession: () => Promise<boolean>;
  toggleVideo: () => Promise<boolean>;
  toggleAudio: () => Promise<boolean>;
  toggleScreenShare: () => Promise<boolean>;
  updateConnectionQuality: (quality: ConnectionQuality) => void;
  refreshSession: () => Promise<void>;
  joinSession: (role?: string, sessionIdOverride?: string) => Promise<boolean>;
  leaveSession: (sessionIdOverride?: string) => Promise<boolean>;
  logEvent: (eventType: string, details?: string, sessionIdOverride?: string) => Promise<void>;
}

export function useTelemedicine(sessionId?: string): UseTelemedicineReturn {
  const [session, setSession] = useState<ApiSession | null>(null);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('good');
  const [localMediaState, setLocalMediaState] = useState<MediaState>({
    video_enabled: false,
    audio_enabled: false,
    screen_sharing: false,
    video_muted_by_user: false,
    audio_muted_by_user: false,
  });

  const localStreamRef = useRef<MediaStream | null>(null);

  const fetchSession = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await telemedicineService.getSession(sessionId);
      setSession(snapshot.session);
      setParticipants(snapshot.participants);
      setEvents(snapshot.events);
    } catch (err) {
      logger.error('[useTelemedicine] fetchSession error', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const startSession = useCallback(async (appointmentId: string, doctorId: string): Promise<StartSessionResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const data = await telemedicineService.startSession(appointmentId, doctorId);
      setSession(mapApiSession(data.session));
      setParticipants(data.participants ?? []);
      setEvents(data.events ?? []);
      return data;
    } catch (err) {
      logger.error('[useTelemedicine] startSession error', err);
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const endSession = useCallback(async (): Promise<boolean> => {
    if (!session) return false;
    setLoading(true);
    setError(null);
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      const result = await telemedicineService.endSession(session.session_id);
      setSession(prev => (prev ? { ...prev, status: result.status, ended_at: result.ended_at } : prev));
      return true;
    } catch (err) {
      logger.error('[useTelemedicine] endSession error', err);
      setError(err instanceof Error ? err.message : 'Error al finalizar sesión');
      return false;
    } finally {
      setLoading(false);
    }
  }, [session]);

  const toggleVideo = useCallback(async () => {
    if (!session) return false;
    const newState = !localMediaState.video_enabled;
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) track.enabled = newState;
    }
    setLocalMediaState(prev => ({ ...prev, video_enabled: newState, video_muted_by_user: !newState }));
    return true;
  }, [localMediaState, session]);

  const toggleAudio = useCallback(async () => {
    if (!session) return false;
    const newState = !localMediaState.audio_enabled;
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) track.enabled = newState;
    }
    setLocalMediaState(prev => ({ ...prev, audio_enabled: newState, audio_muted_by_user: !newState }));
    return true;
  }, [localMediaState, session]);

  const toggleScreenShare = useCallback(async () => {
    if (!session) return false;
    setLocalMediaState(prev => ({ ...prev, screen_sharing: !prev.screen_sharing }));
    return true;
  }, [session]);

  const updateConnectionQuality = useCallback((quality: ConnectionQuality) => {
    setConnectionQuality(quality);
  }, []);

  const refreshSession = useCallback(async () => {
    await fetchSession();
  }, [fetchSession]);

  const joinSession = useCallback(async (role = 'patient', sessionIdOverride?: string): Promise<boolean> => {
    const targetSession = sessionIdOverride ?? session?.session_id;
    if (!targetSession) return false;
    try {
      await telemedicineService.joinSession(targetSession, role);
      await fetchSession();
      return true;
    } catch (err) {
      logger.error('[useTelemedicine] joinSession error', err);
      setError(err instanceof Error ? err.message : 'Error al unir a la sesión');
      return false;
    }
  }, [session, fetchSession]);

  const leaveSession = useCallback(async (sessionIdOverride?: string): Promise<boolean> => {
    const targetSession = sessionIdOverride ?? session?.session_id;
    if (!targetSession) return false;
    try {
      await telemedicineService.leaveSession(targetSession);
      await fetchSession();
      return true;
    } catch (err) {
      logger.error('[useTelemedicine] leaveSession error', err);
      setError(err instanceof Error ? err.message : 'Error al abandonar la sesión');
      return false;
    }
  }, [session, fetchSession]);

  const logEvent = useCallback(async (eventType: string, details?: string, sessionIdOverride?: string) => {
    const targetSession = sessionIdOverride ?? session?.session_id;
    if (!targetSession) return;
    try {
      await telemedicineService.logEvent(targetSession, eventType, details);
      await fetchSession();
    } catch (err) {
      logger.error('[useTelemedicine] logEvent error', err);
      setError(err instanceof Error ? err.message : 'Error al registrar evento');
    }
  }, [session, fetchSession]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return {
    session,
    participants,
    events,
    localMediaState,
    connectionQuality,
    loading,
    error,
    startSession,
    endSession,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
    updateConnectionQuality,
    refreshSession,
    joinSession,
    leaveSession,
    logEvent,
  };
}
