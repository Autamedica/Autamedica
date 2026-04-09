import React, { useState, useEffect } from 'react';

interface AudioReaderProps {
  selector?: string;
}

export default function AudioReader({ selector = '.blog-prose' }: AudioReaderProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [synth, setSynthesis] = useState<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSynthesis(window.speechSynthesis);
    }
    
    // Cleanup on unmount
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const handlePlay = () => {
    if (!synth) return;

    if (isPaused) {
      synth.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    const content = document.querySelector(selector);
    if (!content) {
      console.warn('[AudioReader] Content not found for selector:', selector);
      return;
    }

    // Extraer texto y limpiar espacios extra
    const text = content.textContent?.replace(/\s+/g, ' ').trim() || '';
    
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Configuración de voz
    utterance.lang = 'es-AR';
    utterance.rate = 0.95; // Un poco más lento para mejor claridad médica
    utterance.pitch = 1;

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utterance.onerror = (event) => {
      console.error('[AudioReader] TTS Error:', event);
      setIsPlaying(false);
      setIsPaused(false);
    };

    synth.cancel(); // Detener cualquier lectura previa
    synth.speak(utterance);
    setIsPlaying(true);
  };

  const handlePause = () => {
    if (!synth) return;
    synth.pause();
    setIsPaused(true);
    setIsPlaying(false);
  };

  const handleStop = () => {
    if (!synth) return;
    synth.cancel();
    setIsPlaying(false);
    setIsPaused(false);
  };

  return (
    <div className="audio-reader-wrapper flex items-center gap-3 my-8 p-4 bg-gray-50 rounded-xl border border-gray-200 max-w-fit">
      <button
        onClick={isPlaying ? handlePause : handlePlay}
        className="flex items-center gap-2 px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg transition-all active:scale-95 shadow-sm"
        aria-label={isPlaying ? "Pausar lectura" : "Escuchar artículo"}
      >
        {isPlaying ? (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
            <span>Pausar lectura</span>
          </>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <span>{isPaused ? 'Reanudar lectura' : 'Escuchar artículo'}</span>
          </>
        )}
      </button>

      {(isPlaying || isPaused) && (
        <button
          onClick={handleStop}
          className="p-2 text-gray-500 hover:text-red-600 transition-colors"
          title="Detener"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="6" y="6" width="12" height="12" rx="1"/>
          </svg>
        </button>
      )}
      
      <div className="text-xs text-gray-400 font-medium hidden sm:block">
        Lectura asistida por IA
      </div>
    </div>
  );
}
