'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, Info, Lightbulb, Users } from 'lucide-react';

interface StoryCardProps {
  intro: string;
  why: string;
  example?: string;
  didYouKnow?: string;
}

export function StoryCard({ intro, why, example, didYouKnow }: StoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const preview = why.length > 160 ? `${why.slice(0, 157).trimEnd()}...` : why;

  return (
    <div className="mb-3 rounded-2xl border border-stone-200 bg-white/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Contexto clínico
          </p>
          <p className="mt-1 text-sm text-stone-700">{preview}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center gap-2 rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
        >
          {expanded ? 'Ocultar detalle' : 'Ver por qué te lo preguntamos'}
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="grid grid-cols-1 gap-1.5 pt-3 md:grid-cols-2">
      {/* Introducción */}
      <div className="card-ivory-elevated overflow-hidden bg-gradient-to-br from-blue-50 to-white p-1.5">
        <div className="flex items-start gap-1.5 min-w-0">
          <BookOpen className="h-3.5 w-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[11px] font-semibold text-blue-900 mb-0.5">La Historia</h3>
            <p className="text-[10px] text-blue-800 leading-snug break-words">{intro}</p>
          </div>
        </div>
      </div>

      {/* Por qué preguntamos esto */}
      <div className="card-ivory p-1.5 border-l-4 border-emerald-500 overflow-hidden">
        <div className="flex items-start gap-1.5 min-w-0">
          <Info className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h4 className="text-[11px] font-semibold text-emerald-900 mb-0.5">¿Por qué preguntamos?</h4>
            <p className="text-[10px] text-emerald-800 leading-snug break-words">{why}</p>
          </div>
        </div>
      </div>

      {/* Ejemplo clínico */}
      {example && (
        <div className="card-ivory p-1.5 bg-amber-50 border border-amber-200 overflow-hidden">
          <div className="flex items-start gap-1.5 min-w-0">
            <Users className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h4 className="text-[11px] font-semibold text-amber-900 mb-0.5">Ejemplo Real</h4>
              <p className="text-[10px] text-amber-800 whitespace-pre-line leading-snug break-words">{example}</p>
            </div>
          </div>
        </div>
      )}

      {/* ¿Sabías que? */}
      {didYouKnow && (
        <div className="card-ivory-elevated overflow-hidden border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-white p-1.5">
          <div className="flex items-start gap-1.5 min-w-0">
            <Lightbulb className="h-3.5 w-3.5 text-purple-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h4 className="text-[11px] font-semibold text-purple-900 mb-0.5">💡 ¿Sabías que...?</h4>
              <p className="text-[10px] text-purple-800 whitespace-pre-line leading-snug break-words">{didYouKnow}</p>
            </div>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
}
