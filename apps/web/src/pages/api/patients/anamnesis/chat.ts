import type { APIRoute } from 'astro';
import { processAnamnesisChat } from '@/lib/patients/services/anamnesis-chat.service';

export const POST: APIRoute = async ({ request }) => {
  const { message, history, checkpoint, guidanceQuestions, coverageGaps, coverageSummary } = await request.json();
  const result = await processAnamnesisChat(message, history, checkpoint, {
    guidanceQuestions,
    coverageGaps,
    coverageSummary,
  });
  
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
