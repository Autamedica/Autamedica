import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Camera, CameraOff, Mic, RefreshCw, ShieldCheck, Wifi } from 'lucide-react';

type PermissionState = 'idle' | 'starting' | 'active' | 'blocked' | 'unsupported';

function describeError(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return 'No se pudo iniciar la camara. Revisar permisos del navegador.';
  }

  if (error.name === 'NotAllowedError') {
    return 'Chrome bloqueo el permiso. Tocar el candado de la barra de direcciones y permitir camara y microfono.';
  }

  if (error.name === 'NotFoundError') {
    return 'No se encontro una camara disponible en este dispositivo.';
  }

  if (error.name === 'NotReadableError') {
    return 'La camara esta ocupada por otra aplicacion. Cerrar otras apps de camara y reintentar.';
  }

  return `${error.name}: ${error.message}`;
}

export default function CameraTestPage(): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<PermissionState>('idle');
  const [message, setMessage] = useState('Listo para probar la camara del celular.');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const stopPreview = (): void => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setState('idle');
    setMessage('Vista previa detenida.');
  };

  const refreshDevices = async (): Promise<void> => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const foundDevices = await navigator.mediaDevices.enumerateDevices();
    setDevices(foundDevices.filter((device) => device.kind === 'videoinput'));
  };

  const startPreview = async (): Promise<void> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      setMessage('Este navegador no soporta acceso a camara.');
      return;
    }

    setState('starting');
    setMessage('Solicitando permiso de camara y microfono...');

    try {
      stopPreview();
      setState('starting');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          height: { ideal: 720 },
          width: { ideal: 1280 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      await refreshDevices();
      setState('active');
      setMessage('Camara activa en este navegador.');
    } catch (error) {
      setState('blocked');
      setMessage(describeError(error));
    }
  };

  useEffect(() => {
    void refreshDevices();
    return () => stopPreview();
  }, []);

  const isActive = state === 'active';
  const isStarting = state === 'starting';

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-300">
              AutaMedica
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
              Prueba de camara
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Verifica permisos de camara y microfono antes de grabar contenido o entrar a una
              videoconsulta.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
            <ShieldCheck className="h-4 w-4" />
            Preview local
          </div>
        </header>

        <section className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="relative min-h-[420px] overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl">
            <video
              ref={videoRef}
              className="h-full min-h-[420px] w-full bg-black object-cover"
              autoPlay
              muted
              playsInline
            />
            {!isActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/88 p-6 text-center">
                <Camera className="h-12 w-12 text-cyan-300" />
                <p className="max-w-sm text-sm leading-6 text-slate-300">{message}</p>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-semibold text-white">Estado</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{message}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void startPreview()}
                disabled={isStarting}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isStarting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Iniciar
              </button>
              <button
                type="button"
                onClick={stopPreview}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/15 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <CameraOff className="h-4 w-4" />
                Detener
              </button>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <Wifi className="h-4 w-4 text-cyan-300" />
                Conexion
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Abrir desde el celular como <span className="font-mono text-cyan-200">http://localhost:3000/patients/test-camera</span>.
              </p>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <Mic className="h-4 w-4 text-cyan-300" />
                Camaras detectadas
              </p>
              <p className="mt-2 text-sm text-slate-300">
                {devices.length > 0 ? `${devices.length} disponible(s)` : 'Aun sin permiso o sin camaras listadas.'}
              </p>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
