import { useCallback, useEffect, useRef, useState } from 'react';

export interface TranscriptSegment {
  speaker: 'local' | 'remote';
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface AudioTranscriptionState {
  isTranscribing: boolean;
  segments: TranscriptSegment[];
  interimText: string;
  isSupported: boolean;
  error: string | null;
}

export interface AudioTranscriptionActions {
  start: () => void;
  stop: () => void;
  clear: () => void;
  getFullText: () => string;
}

type SpeechRecognitionType = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

function getSpeechRecognition(): (new () => SpeechRecognitionType) | null {
  if (typeof window === 'undefined') return null;

  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionType)
    | null;
}

export function useAudioTranscription(
  lang: string = 'es-AR',
): [AudioTranscriptionState, AudioTranscriptionActions] {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const shouldRestartRef = useRef(false);

  const isSupported = typeof window !== 'undefined' && getSpeechRecognition() !== null;

  const start = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) {
      setError('Transcripción no soportada en este navegador');
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          const segment: TranscriptSegment = {
            speaker: 'local',
            text: transcript.trim(),
            timestamp: Date.now(),
            isFinal: true,
          };
          setSegments(prev => [...prev, segment]);
          setInterimText('');
        } else {
          interim += transcript;
        }
      }

      if (interim) {
        setInterimText(interim);
      }
    };

    recognition.onerror = (event) => {
      // 'no-speech' and 'aborted' are expected and non-fatal
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      setError(`Error de transcripción: ${event.error}`);
    };

    recognition.onend = () => {
      // Auto-restart if still supposed to be transcribing
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch {
          // May fail if called too quickly
          setTimeout(() => {
            if (shouldRestartRef.current) {
              try { recognition.start(); } catch { /* give up */ }
            }
          }, 200);
        }
      } else {
        setIsTranscribing(false);
      }
    };

    recognitionRef.current = recognition;
    shouldRestartRef.current = true;
    setError(null);
    setIsTranscribing(true);

    try {
      recognition.start();
    } catch {
      setError('No se pudo iniciar la transcripción');
      shouldRestartRef.current = false;
      setIsTranscribing(false);
    }
  }, [lang]);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsTranscribing(false);
    setInterimText('');
  }, []);

  const clear = useCallback(() => {
    setSegments([]);
    setInterimText('');
    setError(null);
  }, []);

  const getFullText = useCallback(() => {
    return segments
      .filter(s => s.isFinal)
      .map(s => s.text)
      .join(' ');
  }, [segments]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  return [
    { isTranscribing, segments, interimText, isSupported, error },
    { start, stop, clear, getFullText },
  ];
}
