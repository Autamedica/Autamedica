import type { APIRoute } from 'astro';
import { processAnamnesisChat } from '@/lib/patients/services/anamnesis-chat.service';

export const POST: APIRoute = async ({ request }) => {
  const { message, history, checkpoint } = await request.json();
  const result = await processAnamnesisChat(message, history, checkpoint);
  
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
