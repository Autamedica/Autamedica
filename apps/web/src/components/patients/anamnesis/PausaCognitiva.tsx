'use client';

import { useState, useEffect } from 'react';
import { Coffee, Brain, MessageCircle, Droplets } from 'lucide-react';

interface PausaCognitivaProps {
  stepNumber: number;
  onContinue: () => void;
}

/** Seconds the patient must wait before continuing */
const PAUSE_DURATION_S = 15;

export function PausaCognitiva({ stepNumber, onContinue }: PausaCognitivaProps) {
  const [secondsLeft, setSecondsLeft] = useState(PAUSE_DURATION_S);
  const canContinue = secondsLeft <= 0;

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/95 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl shadow-2xl p-8 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Coffee className="h-8 w-8 text-white" />
        </div>

        <h2 className="text-2xl font-bold text-stone-900 mb-2">
          Pausa breve
        </h2>

        <p className="text-sm text-stone-600 mb-4">
          Completaste {stepNumber} pasos. Tomate un momento antes de continuar.
        </p>

        <div className="bg-white/80 rounded-xl p-4 mb-4">
          <ul className="text-left space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Brain className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
              <span className="text-stone-700">Revisá si respondiste con detalle</span>
            </li>
            <li className="flex items-start gap-2">
              <MessageCircle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
              <span className="text-stone-700">Cada dato importa para tu médico</span>
            </li>
            <li className="flex items-start gap-2">
              <Droplets className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
              <span className="text-stone-700">Relajate y tomá agua si necesitás</span>
            </li>
          </ul>
        </div>

        <button
          onClick={onContinue}
          disabled={!canContinue}
          className={`w-full px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
            canContinue
              ? 'bg-orange-600 text-white hover:bg-orange-700'
              : 'bg-stone-200 text-stone-400 cursor-not-allowed'
          }`}
        >
          {canContinue ? 'Continuar' : `Esperá ${secondsLeft}s`}
        </button>
      </div>
    </div>
  );
}
