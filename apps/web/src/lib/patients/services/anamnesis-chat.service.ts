import { GoogleGenerativeAI } from '@google/generative-ai';
import { ensureEnv } from '@autamedica/shared';

const genAI = new GoogleGenerativeAI(ensureEnv('GEMINI_API_KEY'));
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnamnesisChatContext {
  guidanceQuestions?: string[];
  coverageGaps?: string[];
  coverageSummary?: string;
}

// Refactorizado para permitir inyección del chat (para testing)
export async function processAnamnesisChat(
  message: string, 
  history: ChatMessage[], 
  checkpoint: 'partial' | 'final',
  context: AnamnesisChatContext = {},
  // Opcional: inyección para tests
  chatInstance?: any
) {
  const chat = chatInstance || model.startChat({
    history: history.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: 0.7,
    },
  });

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
