/**
 * Waiting Room Component — Minimalist
 * Auto-requests camera (front) + mic, shows preview and enter button.
 * No device selection, no speaker test, no individual test buttons.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '@autamedica/shared';

export interface WaitingRoomProps {
  sessionId: string;
  userId: string;
  userRole: 'patient' | 'doctor';
  onReady: () => void;
  estimatedWaitTime?: number;
  className?: string;
}

type MediaStatus = 'requesting' | 'ready' | 'denied' | 'error';

export function WaitingRoom({
  sessionId: _sessionId,
  userId: _userId,
  userRole,
  onReady,
  estimatedWaitTime,
  className = '',
}: WaitingRoomProps) {
  const [mediaStatus, setMediaStatus] = useState<MediaStatus>('requesting');
  const [audioLevel, setAudioLevel] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const requestMedia = useCallback(async () => {
    try {
      setMediaStatus('requesting');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      // Audio level analysis
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        setAudioLevel(buf.reduce((a, b) => a + b, 0) / buf.length);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      setMediaStatus('ready');
    } catch (err) {
      logger.error('[WaitingRoom] Media access failed:', err);
      const name = (err as DOMException)?.name;
      setMediaStatus(name === 'NotAllowedError' ? 'denied' : 'error');
    }
  }, []);

  // Auto-request on mount
  useEffect(() => {
    requestMedia();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
      cancelAnimationFrame(rafRef.current);
    };
  }, [requestMedia]);

  const isDoctor = userRole === 'doctor';

  return (
    <div className={`mx-auto flex max-w-lg flex-col items-center gap-4 p-4 ${className}`}>
      {/* Video preview */}
      <div className="relative w-full overflow-hidden rounded-2xl bg-neutral-900 shadow-lg">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-[4/3] w-full object-cover"
        />

        {mediaStatus === 'requesting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-800/90">
            <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <p className="text-sm text-white/80">Activando camara y microfono...</p>
          </div>
        )}

        {(mediaStatus === 'denied' || mediaStatus === 'error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-800/95 px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
              <svg className="h-7 w-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-center text-sm text-white">
              {mediaStatus === 'denied'
                ? 'Necesitamos acceso a tu camara y microfono para la consulta.'
                : 'No se pudo acceder a los dispositivos.'}
            </p>
            <button
              onClick={requestMedia}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Mic level — subtle bar at bottom */}
        {mediaStatus === 'ready' && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700">
            <div
              className="h-full bg-green-500 transition-all duration-75"
              style={{ width: `${Math.min((audioLevel / 80) * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Status text */}
      <div className="text-center">
        {mediaStatus === 'ready' && (
          <p className="text-sm text-neutral-500">
            {isDoctor ? 'Listo para la consulta' : 'Tu doctor te esta esperando'}
            {estimatedWaitTime != null && estimatedWaitTime > 0 && !isDoctor && (
              <span className="ml-1 text-neutral-400">
                (~{estimatedWaitTime} min)
              </span>
            )}
          </p>
        )}
      </div>

      {/* Enter button */}
      <button
        onClick={onReady}
        disabled={mediaStatus !== 'ready'}
        className="w-full rounded-xl bg-green-600 py-3 text-base font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {mediaStatus === 'ready' ? 'Entrar a la consulta' : 'Preparando...'}
      </button>
    </div>
  );
}
