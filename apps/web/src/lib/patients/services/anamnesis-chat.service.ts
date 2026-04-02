import { GoogleGenerativeAI } from '@google/generative-ai';
import { ensureEnv } from '@autamedica/shared';

const genAI = new GoogleGenerativeAI(ensureEnv('GEMINI_API_KEY'));
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Refactorizado para permitir inyección del chat (para testing)
export async function processAnamnesisChat(
  message: string, 
  history: ChatMessage[], 
  checkpoint: 'partial' | 'final',
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

  const prompt = `Actúa como un médico empático realizando un triage. 
  Tu objetivo es obtener información vital faltante sobre el estado de salud del paciente.
  Responde a: "${message}".
  Si consideras que tienes suficiente información, responde solo con "FINALIZAR_INTERVENCION" seguido de una despedida cordial.
  No preguntes más de 3 cosas en total.`;

  const result = await chat.sendMessage(prompt);
  const responseText = result.response.text();

  const isFinished = responseText.includes('FINALIZAR_INTERVENCION');
  const finalReply = isFinished ? responseText.replace('FINALIZAR_INTERVENCION', '').trim() : responseText;

  return { reply: finalReply, isFinished };
}
