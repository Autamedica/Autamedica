import type { APIRoute } from 'astro'
import { POST as dispatchRequestPost } from '../dispatch/request'

/**
 * POST /api/pharmacy/on-demand/entry
 * Endpoint de captura clínica on-demand de mostrador.
 * Recibe los datos del paciente y crea el registro en pharmacy_dispatch_requests.
 */
export const POST: APIRoute = async (context) => {
  return dispatchRequestPost(context)
}
