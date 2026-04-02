'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Send, Sparkles, X } from 'lucide-react';

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface AnamnesisChatModalProps {
  onClose: () => void;
  onComplete: () => void;
  checkpoint: 'partial' | 'final';
}

export function AnamnesisChatModal({ onClose, onComplete, checkpoint }: AnamnesisChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hola, soy tu asistente de salud. Estoy revisando tu historia clínica. ¿Hay algún detalle adicional que quieras comentar sobre tus síntomas o antecedentes?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    
    const userMessage: Message = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/patients/anamnesis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage.content,
          history: messages,
          checkpoint 
        }),
      });

      const data = await response.json();
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      
      if (data.isFinished) {
        // Enviar respuesta estructurada de vuelta al padre
        onComplete(); 
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsTyping(false);
    }
  }, [input, messages, checkpoint, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col h-[80vh]">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-sky-600" />
            <h3 className="font-bold text-stone-900">Dr. IA</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full">
            <X className="h-5 w-5 text-stone-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
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
