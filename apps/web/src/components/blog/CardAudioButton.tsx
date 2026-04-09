import { useEffect, useRef, useState } from 'react';
import { Volume2, Square, Loader2 } from 'lucide-react';
import { extractReadableText, isSpeechSynthesisSupported, speakText } from '@/lib/blog/speech';

interface CardAudioButtonProps {
  title: string;
  slug: string;
}

export default function CardAudioButton({ title, slug }: CardAudioButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [synth, setSynth] = useState<SpeechSynthesis | null>(null);
  const sessionRef = useRef(0);

  useEffect(() => {
    if (isSpeechSynthesisSupported()) {
      setSynth(window.speechSynthesis);
      setIsSupported(true);
    }

    return () => {
      sessionRef.current += 1;
      window.speechSynthesis?.cancel();
    };
  }, []);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!synth || !isSupported) return;

    if (isPlaying) {
      sessionRef.current += 1;
      synth.cancel();
      setIsPlaying(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/blog/${slug}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch article: ${response.status}`);
      }

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const content = doc.querySelector('.blog-prose');
      const fullText = extractReadableText(content) || title;

      if (!fullText) {
        setIsLoading(false);
        return;
      }

      const sessionId = sessionRef.current + 1;
      sessionRef.current = sessionId;

      await speakText({
        synth,
        text: fullText,
        lang: 'es-AR',
        rate: 0.84,
        pitch: 1.2,
        maxSegmentLength: 220,
        onStart: () => {
          if (sessionRef.current !== sessionId) return;
          setIsLoading(false);
          setIsPlaying(true);
        },
        onComplete: () => {
          if (sessionRef.current !== sessionId) return;
          setIsPlaying(false);
          setIsLoading(false);
        },
        onError: () => {
          if (sessionRef.current !== sessionId) return;
          setIsPlaying(false);
          setIsLoading(false);
        },
      });
    } catch (error) {
      console.error('[CardAudioButton] Error:', error);
      setIsPlaying(false);
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isLoading || !isSupported}
      className={`inline-flex h-12 w-12 items-center justify-center rounded-full border shadow-sm transition-all active:scale-90 ${
        isPlaying 
          ? 'border-stone-400 bg-stone-300 text-stone-800' 
          : 'border-stone-300 bg-stone-200 text-stone-600 hover:border-stone-400 hover:bg-stone-300 hover:text-stone-800'
      } ${isLoading || !isSupported ? 'cursor-not-allowed opacity-50' : ''}`}
      title={isPlaying ? 'Detener audio' : 'Escuchar'}
      aria-label={isPlaying ? 'Detener audio del artículo' : 'Escuchar audio del artículo'}
    >
      {isLoading ? (
        <Loader2 size={22} className="animate-spin" />
      ) : isPlaying ? (
        <Square size={18} fill="currentColor" />
      ) : (
        <Volume2 size={22} />
      )}
    </button>
  );
}
