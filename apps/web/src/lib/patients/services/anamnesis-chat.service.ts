import { GoogleGenerativeAI } from '@google/generative-ai';
import { getQuestionsModelName, resolveServerEnv } from '@/lib/patients/server/ai-provider';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnamnesisChatContext {
  guidanceQuestions?: string[];
  coverageGaps?: string[];
  coverageSummary?: string;
}

interface ChatSessionLike {
  sendMessage: (prompt: string) => Promise<{
    response: {
      text: () => string;
    };
  }>;
}

function createChatSession(history: ChatMessage[]): ChatSessionLike {
  const apiKey = resolveServerEnv('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: getQuestionsModelName() });

  return model.startChat({
    history: normalizeChatHistory(history),
    generationConfig: {
      temperature: 0.7,
    },
  });
}

function normalizeChatHistory(history: ChatMessage[]) {
  const trimmed = history
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      role: message.role === 'user' ? 'user' : 'model',
      parts: [{ text: message.content }],
    }))

  const firstUserIndex = trimmed.findIndex((message) => message.role === 'user')
  if (firstUserIndex === -1) {
    return []
  }

  return trimmed.slice(firstUserIndex)
}

// Refactorizado para permitir inyección del chat (para testing)
export async function processAnamnesisChat(
  message: string, 
  history: ChatMessage[], 
  checkpoint: 'partial' | 'final',
  context: AnamnesisChatContext = {},
  // Opcional: inyección para tests
  chatInstance?: ChatSessionLike
) {
  const chat = chatInstance || createChatSession(history);

  const guidanceQuestions = context.guidanceQuestions?.filter(Boolean) ?? [];
  const coverageGaps = context.coverageGaps?.filter(Boolean) ?? [];

  const prompt = `Actúa como un médico empático realizando un triage breve para completar una anamnesis clínica.
  Checkpoint actual: ${checkpoint}.
  Responde al mensaje del paciente: "${message}".
  ${context.coverageSummary ? `Resumen de cobertura: ${context.coverageSummary}.` : ''}
  ${coverageGaps.length > 0 ? `Áreas con datos faltantes: ${coverageGaps.join(', ')}.` : ''}
  ${guidanceQuestions.length > 0 ? `Prioriza cerrar estas preguntas clínicas: ${guidanceQuestions.join(' | ')}.` : ''}
  Haz solo UNA pregunta concreta por turno.
  No des diagnósticos, tratamientos ni consejos terapéuticos.
  Si ya tienes suficiente información para cerrar la intervención, responde solo con "FINALIZAR_INTERVENCION" seguido de una despedida cordial.
  No preguntes más de 3 cosas en total.`;

  const result = await chat.sendMessage(prompt);
  const responseText = result.response.text();

  const isFinished = responseText.includes('FINALIZAR_INTERVENCION');
  const finalReply = isFinished ? responseText.replace('FINALIZAR_INTERVENCION', '').trim() : responseText;

  return { reply: finalReply, isFinished };
}
