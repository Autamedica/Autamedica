'use client'

const RADAR_POINTS = [
  { left: '21%', top: '24%' },
  { left: '77%', top: '29%' },
  { left: '72%', top: '76%' },
  { left: '23%', top: '72%' },
] as const

interface LiveMedicalPresenceRadarProps {
  onlineCount: number | null
  isPortuguese?: boolean
}

export function LiveMedicalPresenceRadar({
  onlineCount,
  isPortuguese = false,
}: LiveMedicalPresenceRadarProps) {
  const availabilityLabel =
    onlineCount === null
      ? (isPortuguese ? 'Buscando médicos disponíveis...' : 'Buscando médicos disponibles...')
      : onlineCount === 0
        ? (isPortuguese ? 'Nenhum médico disponível agora' : 'Sin médicos disponibles ahora')
        : isPortuguese
          ? onlineCount + ' ' + (onlineCount === 1 ? 'médico de plantão' : 'médicos de plantão')
          : onlineCount + ' ' + (onlineCount === 1 ? 'médico disponible' : 'médicos disponibles')

  const visibleSignals = onlineCount === null ? 0 : Math.min(onlineCount, RADAR_POINTS.length)

  return (
    <section className="flex w-full flex-col items-center" aria-label={isPortuguese ? 'Radar de presença médica' : 'Radar de presencia médica'}>
      <div className="am-medical-radar relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-full">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,#f0f9ff_0%,#f8fcff_52%,#ffffff_100%)]" />
        <div className="absolute inset-[5%] rounded-full border border-sky-500/20" />
        <div className="absolute inset-[17%] rounded-full border border-sky-500/20" />
        <div className="absolute inset-[30%] rounded-full border border-sky-500/20 border-dashed" />
        <div className="absolute inset-[43%] rounded-full border border-sky-500/20" />

        <div className="absolute left-1/2 top-[5%] h-[90%] border-l border-dashed border-sky-500/15" />
        <div className="absolute left-[5%] top-1/2 w-[90%] border-t border-dashed border-sky-500/15" />

        <div className="am-radar-wave absolute inset-[27%] rounded-full border border-sky-400/45" />
        <div className="am-radar-wave absolute inset-[27%] rounded-full border border-sky-400/40" style={{ animationDelay: '-0.93s' }} />
        <div className="am-radar-wave absolute inset-[27%] rounded-full border border-sky-400/35" style={{ animationDelay: '-1.86s' }} />

        <div className="am-radar-sweep absolute inset-0 rounded-full" />
        <div className="am-radar-beam absolute left-1/2 top-1/2 h-px w-[45%] origin-left bg-gradient-to-r from-sky-500/80 to-transparent" />

        {RADAR_POINTS.slice(0, visibleSignals).map((point, index) => (
          <span
            key={index}
            className="absolute z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500/15"
            style={{ left: point.left, top: point.top }}
            aria-hidden="true"
          >
            <span className="h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.65)]" />
          </span>
        ))}

        <div className="am-radar-core absolute left-1/2 top-1/2 z-20 flex h-[70px] w-[70px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-sky-500/35 bg-white shadow-[0_8px_24px_rgba(14,165,233,0.16)]">
          <img src="/logo_bioceramic.png" alt="AutaMedica" width={44} height={44} className="h-11 w-11 object-contain" />
        </div>
      </div>

      <p className="mt-3 text-center text-sm font-semibold text-slate-700" aria-live="polite">
        {availabilityLabel}
      </p>
      <style>{`
        @keyframes am-radar-spin { to { transform: rotate(360deg); } }
        @keyframes am-radar-wave {
          0% { transform: scale(.28); opacity: .48; }
          100% { transform: scale(2.65); opacity: 0; }
        }
        @keyframes am-radar-core-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(.96); }
          50% { transform: translate(-50%, -50%) scale(1.04); }
        }
        .am-radar-sweep {
          background: conic-gradient(from 0deg, transparent 0deg, transparent 278deg, rgba(14,165,233,.04) 315deg, rgba(14,165,233,.24) 360deg);
          animation: am-radar-spin 4.8s linear infinite;
        }
        .am-radar-beam {
          animation: am-radar-spin 4.8s linear infinite;
          box-shadow: 0 0 7px rgba(14,165,233,.45);
        }
        .am-radar-wave {
          animation: am-radar-wave 2.8s linear infinite;
          transform-origin: center;
        }
        .am-radar-core {
          animation: am-radar-core-pulse 1.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .am-radar-sweep, .am-radar-beam, .am-radar-wave, .am-radar-core { animation: none; }
        }
      `}</style>
    </section>
  )
}
