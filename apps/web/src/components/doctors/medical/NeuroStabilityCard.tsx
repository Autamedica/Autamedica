'use client';

import { Brain, AlertCircle, CheckCircle2, Info, Activity, Heart, Scale } from 'lucide-react';
import type { StabilityScore } from '@/lib/patients/verticals/neuro/scoring.engine';

interface NeuroStabilityCardProps {
  score: StabilityScore;
  reasons: string[];
  vitals?: {
    bloodPressure?: string;
    heartRate?: number;
    weight?: number;
  };
  dateRecorded: string;
}

const SCORE_CONFIG = {
  GREEN: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    icon: CheckCircle2,
    label: 'Estable',
    description: 'Continuar con el protocolo actual.'
  },
  YELLOW: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    icon: Info,
    label: 'Precaución',
    description: 'Requiere revisión de ajuste de dosis o monitoreo cercano.'
  },
  RED: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: AlertCircle,
    label: 'Riesgo Clínico',
    description: 'Intervención inmediata requerida. Posible suspensión de tratamiento.'
  }
};

export function NeuroStabilityCard({ score, reasons, vitals, dateRecorded }: NeuroStabilityCardProps) {
  const config = SCORE_CONFIG[score] || SCORE_CONFIG.YELLOW;
  const Icon = config.icon;

  return (
    <div className={`rounded-2xl border ${config.border} ${config.bg} p-5 shadow-am-sm overflow-hidden relative`}>
      <div className="absolute top-0 right-0 p-4 opacity-5">
        <Brain className="h-24 w-24" />
      </div>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl bg-white shadow-sm ${config.text}`}>
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 uppercase tracking-tight">Reporte de Estabilidad Neuro</h3>
              <p className="text-[10px] text-stone-500 font-medium">{new Date(dateRecorded).toLocaleString('es-AR')}</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${config.border} bg-white ${config.text}`}>
            <Icon className="h-3.5 w-3.5" />
            {config.label}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-stone-800 mb-2">{config.description}</p>
              {reasons.length > 0 && (
                <ul className="space-y-1.5">
                  {reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-stone-600">
                      <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${score === 'RED' ? 'bg-red-400' : 'bg-amber-400'}`} />
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {vitals && (
            <div className="bg-white/60 rounded-xl p-3 border border-stone-100/50 flex flex-col gap-3 min-w-[140px]">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-stone-400" />
                <div>
                  <p className="text-[9px] font-bold text-stone-400 uppercase">Presión</p>
                  <p className="text-xs font-bold text-stone-700">{vitals.bloodPressure || '--/--'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Heart className="h-3.5 w-3.5 text-stone-400" />
                <div>
                  <p className="text-[9px] font-bold text-stone-400 uppercase">Frecuencia</p>
                  <p className="text-xs font-bold text-stone-700">{vitals.heartRate ? `${vitals.heartRate} bpm` : '--'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Scale className="h-3.5 w-3.5 text-stone-400" />
                <div>
                  <p className="text-[9px] font-bold text-stone-400 uppercase">Peso</p>
                  <p className="text-xs font-bold text-stone-700">{vitals.weight ? `${vitals.weight} kg` : '--'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
