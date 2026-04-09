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
      // SOLUCIÓN TÉCNICA: Fetch del contenido completo en segundo plano
      const response = await fetch(`/blog/${slug}`);
      const html = await response.text();
      
      // Parsear el HTML para extraer solo el texto del artículo
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const content = doc.querySelector('.blog-prose');
      
      const fullText = content 
        ? content.textContent?.replace(/\s+/g, ' ').trim() 
        : title; // Fallback al título si no se encuentra el contenido

      if (!fullText) {
        setIsLoading(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(fullText);
      utterance.lang = 'es-AR';
      utterance.rate = 0.95;

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
      console.error('[CardAudioButton] Error fetching full text:', error);
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`inline-flex items-center justify-center p-1 rounded-full transition-all active:scale-90 ${
        isPlaying 
          ? 'bg-am-accent/10 text-am-accent' 
          : 'bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-600'
      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={isPlaying ? "Detener" : "Escuchar artículo completo"}
      aria-label={isPlaying ? "Detener" : "Escuchar artículo completo"}
    >
      {isLoading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : isPlaying ? (
        <Square size={12} fill="currentColor" />
      ) : (
        <Volume2 size={12} />
      )}
    </button>
  );
}
