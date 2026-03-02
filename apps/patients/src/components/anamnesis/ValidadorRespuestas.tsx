'use client';

import { AlertTriangle } from 'lucide-react';

interface ValidadorRespuestasProps {
  value: string;
  fieldType: string;
  onWarning: (_warning: string | null) => void;
}

export function ValidadorRespuestas({ value, fieldType, onWarning }: ValidadorRespuestasProps) {
  // Validar calidad de respuestas de texto largo
  const validarCalidadTexto = (texto: string): string | null => {
    if (!texto || texto.length === 0) return null;

    // Respuesta demasiado corta (menos de 10 caracteres para textarea)
    if (fieldType === 'textarea' && texto.length < 10) {
      return '⚠️ Tu respuesta parece muy breve. Intenta dar más detalles para ayudar a tu médico.';
    }

    // Solo letras repetidas (aaaa, bbbb, etc.)
    if (/^(.)\1+$/.test(texto)) {
      return '❌ Detectamos una respuesta no válida. Por favor, responde con información real.';
    }

    // Texto sin sentido (teclado aleatorio: asdfgh, qwerty, etc.)
    const sinSentido = ['asdfgh', 'qwerty', 'zxcvbn', 'qqqq', 'wwww', 'test', 'prueba'];
    if (sinSentido.some((patron) => texto.toLowerCase().includes(patron))) {
      return '⚠️ Tu respuesta parece no tener sentido. Recuerda que esta información es para tu médico.';
    }

    // Todas mayúsculas (gritar)
    if (texto === texto.toUpperCase() && texto.length > 20) {
      return '💡 Detectamos que escribiste todo en MAYÚSCULAS. ¿Podrías escribir en minúsculas para facilitar la lectura?';
    }

    // Muchos signos de exclamación/interrogación
    const signosCount = (texto.match(/[!?]{2,}/g) || []).length;
    if (signosCount > 3) {
      return '💡 Intenta escribir de forma más calmada. Esta información es solo para tu médico.';
    }

    // Respuesta muy larga sin puntuación (posible spam)
    if (texto.length > 200 && !texto.includes('.') && !texto.includes(',')) {
      return '💡 Tu respuesta es muy larga sin puntuación. ¿Podrías organizarla mejor con puntos y comas?';
    }

    return null;
  };

  const warning = validarCalidadTexto(value);

  // Notificar al padre
  if (warning !== onWarning.toString()) {
    onWarning(warning);
  }

  if (!warning) return null;

  return (
    <div className="mt-3 bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">{warning}</p>
      </div>
    </div>
  );
}

/**
 * Hook para validar tiempo de respuesta (detectar respuestas muy rápidas)
 */
export function useValidadorTiempo(minSegundos: number = 5) {
  const [tiempoInicio, setTiempoInicio] = useState<number | null>(null);

  const iniciarTimer = () => {
    setTiempoInicio(Date.now());
  };

  const validarTiempo = (): { valido: boolean; mensaje?: string } => {
    if (!tiempoInicio) return { valido: true };

    const tiempoTranscurrido = (Date.now() - tiempoInicio) / 1000;

    if (tiempoTranscurrido < minSegundos) {
      return {
        valido: false,
        mensaje: `⏱️ Respondiste muy rápido (${Math.round(tiempoTranscurrido)}s). Tómate al menos ${minSegundos} segundos para leer y pensar en tu respuesta.`,
      };
    }

    return { valido: true };
  };

  const resetTimer = () => {
    setTiempoInicio(null);
  };

  return { iniciarTimer, validarTiempo, resetTimer };
}

// Importar useState
import { useState } from 'react';
