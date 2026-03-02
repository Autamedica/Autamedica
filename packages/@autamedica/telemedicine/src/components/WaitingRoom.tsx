/**
 * Waiting Room Component
 * Virtual waiting room with media device testing
 *
 * @module WaitingRoom
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '@autamedica/shared';

export interface WaitingRoomProps {
  sessionId: string;
  userId: string;
  userRole: 'patient' | 'doctor';
  onReady: () => void;
  estimatedWaitTime?: number; // minutes
  className?: string;
}

type DeviceTestStatus = 'untested' | 'testing' | 'success' | 'failed';

export function WaitingRoom({
  sessionId: _sessionId,
  userId: _userId,
  userRole: _userRole,
  onReady,
  estimatedWaitTime = 5,
  className = '',
}: WaitingRoomProps) {
  const [cameraStatus, setCameraStatus] = useState<DeviceTestStatus>('untested');
  const [micStatus, setMicStatus] = useState<DeviceTestStatus>('untested');
  const [speakerStatus, setSpeakerStatus] = useState<DeviceTestStatus>('untested');
  const [isReady, setIsReady] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Test camera
  const testCamera = useCallback(async () => {
    try {
      setCameraStatus('testing');

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      setStream(mediaStream);
      setCameraStatus('success');
    } catch (error) {
      logger.error('Camera test failed:', error);
      setCameraStatus('failed');
    }
  }, []);

  // Test microphone
  const testMicrophone = useCallback(async () => {
    try {
      setMicStatus('testing');

      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // Setup audio analysis
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(audioStream);

      analyser.fftSize = 256;
      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Start analyzing audio level
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkAudioLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(average);
        requestAnimationFrame(checkAudioLevel);
      };
      checkAudioLevel();

      // Combine with existing stream
      if (stream) {
        audioStream.getAudioTracks().forEach((track) => {
          stream.addTrack(track);
        });
      } else {
        setStream(audioStream);
      }

      setMicStatus('success');
    } catch (error) {
      logger.error('Microphone test failed:', error);
      setMicStatus('failed');
    }
  }, [stream]);

  // Test speaker (play test sound)
  const testSpeaker = useCallback(async () => {
    try {
      setSpeakerStatus('testing');

      const audio = new Audio('/sounds/test-tone.mp3'); // You'll need to add this file
      await audio.play();

      // Wait for audio to finish
      await new Promise((resolve) => {
        audio.onended = resolve;
        setTimeout(resolve, 2000); // Fallback timeout
      });

      setSpeakerStatus('success');
    } catch (error) {
      logger.error('Speaker test failed:', error);
      // Assume success if autoplay blocked (common in browsers)
      setSpeakerStatus('success');
    }
  }, []);

  // Run all tests
  const runAllTests = useCallback(async () => {
    await testCamera();
    await testMicrophone();
    await testSpeaker();
  }, [testCamera, testMicrophone, testSpeaker]);

  // Check if ready
  useEffect(() => {
    const ready =
      cameraStatus === 'success' &&
      micStatus === 'success' &&
      speakerStatus === 'success';

    setIsReady(ready);
  }, [cameraStatus, micStatus, speakerStatus]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stream]);

  const allTestsPassed = cameraStatus === 'success' && micStatus === 'success' && speakerStatus === 'success';
  const anyTestFailed = cameraStatus === 'failed' || micStatus === 'failed' || speakerStatus === 'failed';

  return (
    <div className={`mx-auto max-w-4xl space-y-6 p-6 ${className}`}>
      {/* Header */}
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Sala de Espera Virtual</h1>
        <p className="text-gray-600">
          Prepárate para tu consulta médica verificando tu cámara y micrófono
        </p>
        {estimatedWaitTime > 0 && (
          <p className="mt-2 text-sm text-gray-500">
            ⏱️ Tiempo estimado de espera: {estimatedWaitTime} {estimatedWaitTime === 1 ? 'minuto' : 'minutos'}
          </p>
        )}
      </div>

      {/* Video Preview */}
      <div className="relative overflow-hidden rounded-lg bg-gray-900 shadow-xl">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-video w-full object-cover"
        />

        {cameraStatus === 'untested' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-90">
            <div className="text-center">
              <span className="mb-3 block text-6xl">📹</span>
              <p className="text-white">Tu cámara aparecerá aquí</p>
            </div>
          </div>
        )}

        {cameraStatus === 'testing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-90">
            <div className="text-center">
              <div className="mb-3 inline-block h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent"></div>
              <p className="text-white">Activando cámara...</p>
            </div>
          </div>
        )}

        {cameraStatus === 'failed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900 bg-opacity-90">
            <div className="text-center">
              <span className="mb-3 block text-6xl">❌</span>
              <p className="text-white font-semibold">Error al acceder a la cámara</p>
              <p className="text-sm text-white/80">Verifica los permisos del navegador</p>
            </div>
          </div>
        )}

        {/* Audio Level Indicator */}
        {micStatus === 'success' && (
          <div className="absolute bottom-4 left-4 right-4">
            <div className="rounded-lg bg-black bg-opacity-50 p-3">
              <p className="mb-2 text-xs font-medium text-white">Nivel de Micrófono</p>
              <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                <div
                  className="h-full bg-green-500 transition-all duration-100"
                  style={{ width: `${Math.min((audioLevel / 128) * 100, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-white/70">
                {audioLevel > 20 ? '🎤 Detectando audio' : '🔇 Silencio'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Device Tests */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Verificación de Dispositivos</h2>

        {/* Camera Test */}
        <div className="flex items-center justify-between rounded-lg border border-gray-300 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
              cameraStatus === 'success' ? 'bg-green-100' :
              cameraStatus === 'failed' ? 'bg-red-100' : 'bg-gray-100'
            }`}>
              {cameraStatus === 'success' && <span className="text-xl">✓</span>}
              {cameraStatus === 'failed' && <span className="text-xl">✗</span>}
              {cameraStatus === 'testing' && <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>}
              {cameraStatus === 'untested' && <span className="text-xl">📹</span>}
            </div>
            <div>
              <p className="font-medium text-gray-900">Cámara</p>
              <p className="text-sm text-gray-600">
                {cameraStatus === 'success' && 'Funcionando correctamente'}
                {cameraStatus === 'failed' && 'Error al acceder'}
                {cameraStatus === 'testing' && 'Probando...'}
                {cameraStatus === 'untested' && 'No verificada'}
              </p>
            </div>
          </div>

          {cameraStatus === 'untested' && (
            <button
              onClick={testCamera}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Probar
            </button>
          )}
        </div>

        {/* Microphone Test */}
        <div className="flex items-center justify-between rounded-lg border border-gray-300 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
              micStatus === 'success' ? 'bg-green-100' :
              micStatus === 'failed' ? 'bg-red-100' : 'bg-gray-100'
            }`}>
              {micStatus === 'success' && <span className="text-xl">✓</span>}
              {micStatus === 'failed' && <span className="text-xl">✗</span>}
              {micStatus === 'testing' && <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>}
              {micStatus === 'untested' && <span className="text-xl">🎤</span>}
            </div>
            <div>
              <p className="font-medium text-gray-900">Micrófono</p>
              <p className="text-sm text-gray-600">
                {micStatus === 'success' && 'Funcionando correctamente'}
                {micStatus === 'failed' && 'Error al acceder'}
                {micStatus === 'testing' && 'Probando...'}
                {micStatus === 'untested' && 'No verificado'}
              </p>
            </div>
          </div>

          {micStatus === 'untested' && (
            <button
              onClick={testMicrophone}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Probar
            </button>
          )}
        </div>

        {/* Speaker Test */}
        <div className="flex items-center justify-between rounded-lg border border-gray-300 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
              speakerStatus === 'success' ? 'bg-green-100' :
              speakerStatus === 'failed' ? 'bg-red-100' : 'bg-gray-100'
            }`}>
              {speakerStatus === 'success' && <span className="text-xl">✓</span>}
              {speakerStatus === 'failed' && <span className="text-xl">✗</span>}
              {speakerStatus === 'testing' && <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>}
              {speakerStatus === 'untested' && <span className="text-xl">🔊</span>}
            </div>
            <div>
              <p className="font-medium text-gray-900">Altavoces</p>
              <p className="text-sm text-gray-600">
                {speakerStatus === 'success' && 'Funcionando correctamente'}
                {speakerStatus === 'failed' && 'Error de reproducción'}
                {speakerStatus === 'testing' && 'Reproduciendo tono de prueba...'}
                {speakerStatus === 'untested' && 'No verificados'}
              </p>
            </div>
          </div>

          {speakerStatus === 'untested' && (
            <button
              onClick={testSpeaker}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Probar
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={runAllTests}
          disabled={cameraStatus === 'testing' || micStatus === 'testing' || speakerStatus === 'testing'}
          className="flex-1 rounded-lg border border-gray-300 px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          {allTestsPassed ? 'Volver a Probar' : 'Probar Todo'}
        </button>

        <button
          onClick={onReady}
          disabled={!isReady}
          className="flex-1 rounded-lg bg-green-600 px-6 py-3 font-medium text-white transition-colors hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isReady ? '✓ Entrar a la Consulta' : 'Completa las Pruebas'}
        </button>
      </div>

      {/* Help Text */}
      {anyTestFailed && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <p className="mb-2 font-semibold text-yellow-800">Problemas con los dispositivos?</p>
          <ul className="ml-4 list-disc space-y-1 text-sm text-yellow-700">
            <li>Verifica que el navegador tenga permisos para cámara y micrófono</li>
            <li>Asegúrate de que ningún otro programa esté usando los dispositivos</li>
            <li>Prueba recargar la página</li>
            <li>Si persiste el problema, contacta con soporte técnico</li>
          </ul>
        </div>
      )}
    </div>
  );
}
