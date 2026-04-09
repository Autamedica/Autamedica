import { useState, useEffect } from 'react';
import { Volume2, Square, Loader2 } from 'lucide-react';

interface CardAudioButtonProps {
  title: string;
  slug: string;
}

export default function CardAudioButton({ title, slug }: CardAudioButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [synth, setSynth] = useState<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSynth(window.speechSynthesis);
    }
    return () => window.speechSynthesis?.cancel();
  }, []);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!synth) return;

    if (isPlaying) {
      synth.cancel();
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/blog/${slug}`);
      const html = await response.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const content = doc.querySelector('.blog-prose');
      
      const fullText = content 
        ? content.textContent?.replace(/\s+/g, ' ').trim() 
        : title;

      if (!fullText) {
        setIsLoading(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(fullText);
      
      // SOLUCIÓN TÉCNICA: Humanización de voz
      const voices = synth.getVoices();
      // Preferir voces premium de Google o voces locales de alta calidad en español
      const preferredVoice = voices.find(v => 
        (v.name.includes('Google') || v.name.includes('Premium')) && 
        (v.lang.includes('es-AR') || v.lang.includes('es-ES') || v.lang.includes('es-US'))
      ) || voices.find(v => v.lang.includes('es'));

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.lang = 'es-AR';
      utterance.rate = 0.92; // Cadencia humana ligeramente más pausada
      utterance.pitch = 1.05; // Tono ligeramente más cálido

      utterance.onstart = () => {
        setIsLoading(false);
        setIsPlaying(true);
      };

      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => {
        setIsPlaying(false);
        setIsLoading(false);
      };

      synth.cancel();
      synth.speak(utterance);
    } catch (error) {
      console.error('[CardAudioButton] Error:', error);
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-all active:scale-90 ${
        isPlaying 
          ? 'bg-stone-200 text-stone-600' 
          : 'bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-500'
      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={isPlaying ? "Detener" : "Escuchar"}
    >
      {isLoading ? (
        <Loader2 size={10} className="animate-spin text-stone-400" />
      ) : isPlaying ? (
        <Square size={8} fill="currentColor" />
      ) : (
        <Volume2 size={10} />
      )}
    </button>
  );
}
