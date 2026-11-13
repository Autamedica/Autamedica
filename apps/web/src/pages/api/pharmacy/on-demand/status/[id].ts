import type { APIRoute } from 'astro'

// Gen 2 dispatch is canonical. Preserve Gen 1 history without exposing clinical data.
export const GET: APIRoute = async () => new Response(JSON.stringify({
  success: false,
  error: { code: 'legacy_pharmacy_queue_retired', message: 'Usa el acceso de consulta en /farmacia/solicitar' },
}), { status: 410, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })
