'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useFocusTrap } from '@/hooks/shared/useFocusTrap';
import { Loader2, Send, Sparkles, X } from 'lucide-react';
import { logger } from '@autamedica/shared';
import type { ExtractionGuidance } from '@/lib/patients/services/anamnesis-guidance.service';

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface ChatApiResponse {
  success?: boolean;
  reply?: string;
  isFinished?: boolean;
  error?: string;
}

interface ClarificationTurn {
  question: string;
  answer: string;
}

interface AnamnesisChatModalProps {
  onClose: () => void;
  onComplete: (turns: ClarificationTurn[]) => void;
  checkpoint: 'partial' | 'final';
  guidance: ExtractionGuidance;
}

function buildInitialAssistantMessage(guidance: ExtractionGuidance, checkpoint: 'partial' | 'final'): string {
  const firstQuestion = guidance.questions[0]?.text;
  if (firstQuestion) {
    return checkpoint === 'final'
      ? `Antes de finalizar quiero confirmar algunos datos. ${firstQuestion}`
      : `Estoy revisando tu historia clínica y necesito precisar algunos datos. ${firstQuestion}`;
  }

  if (guidance.gaps.length > 0) {
    return checkpoint === 'final'
      ? `Antes de terminar quiero completar la información faltante en ${guidance.gaps.join(', ')}. ¿Qué dato importante sentís que todavía falta contarle a tu médico?`
      : `Veo que todavía faltan datos en ${guidance.gaps.join(', ')}. Contame qué información adicional creés que debería quedar registrada ahora.`;
  }

  return 'Hola, soy tu asistente de salud. Estoy revisando tu historia clínica. ¿Hay algún detalle adicional que quieras comentar sobre tus síntomas o antecedentes?';
}

function getLastAssistantPrompt(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') {
      return messages[i].content.trim();
    }
  }

  return 'Aclaración clínica';
}

export function AnamnesisChatModal({
  onClose,
  onComplete,
  checkpoint,
  guidance,
}: AnamnesisChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: buildInitialAssistantMessage(guidance, checkpoint) }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [turns, setTurns] = useState<ClarificationTurn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { containerRef } = useFocusTrap({ isOpen: true, onClose });

  const appendFallbackMessage = useCallback(() => {
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: 'No pude continuar el chat ahora. Podés cerrar esta ventana y seguir con el formulario.',
      },
    ]);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;

    const patientAnswer = input.trim();
    const userMessage: Message = { role: 'user', content: patientAnswer };
    const answeredQuestion = getLastAssistantPrompt(messages);
    const nextTurns = [
      ...turns,
      { question: answeredQuestion, answer: patientAnswer },
    ];

    setMessages(prev => [...prev, userMessage]);
    setTurns(nextTurns);
    setInput('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/patients/anamnesis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage.content,
          history: messages,
          checkpoint,
          guidanceQuestions: guidance.questions.map((question) => question.text),
          coverageGaps: guidance.gaps,
          coverageSummary: guidance.coverageSummary,
        }),
      });

      const rawText = await response.text();
      const data: ChatApiResponse | null = rawText
        ? JSON.parse(rawText) as ChatApiResponse
        : null;

      if (!response.ok) {
        throw new Error(data?.error ?? `chat_http_${response.status}`);
      }

      if (!data || typeof data.reply !== 'string') {
        throw new Error('invalid_chat_response');
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);

      if (data.isFinished) {
        onComplete(nextTurns);
      }
    } catch (error) {
      logger.error('[AnamnesisChatModal] Chat error', error);
      appendFallbackMessage();
    } finally {
      setIsTyping(false);
    }
  }, [appendFallbackMessage, input, messages, turns, checkpoint, guidance, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-sm p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Chat de aclaración clínica"
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col h-[80vh]"
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-sky-600" />
            <h3 className="font-bold text-stone-900">Dr. IA</h3>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 hover:bg-stone-100 rounded-full">
            <X className="h-5 w-5 text-stone-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef} aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl ${
                m.role === 'user' 
                  ? 'bg-stone-900 text-white rounded-tr-none' 
                  : 'bg-stone-100 text-stone-900 rounded-tl-none'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-stone-100 p-3 rounded-2xl rounded-tl-none">
                <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Tu respuesta..."
              className="flex-1 bg-stone-100 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-sky-500"
            />
            <button 
              onClick={handleSend}
              disabled={isTyping}
              className="bg-sky-600 text-white p-3 rounded-xl disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
