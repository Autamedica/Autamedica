import type { CallFailureCode } from '../calls/types'

const FAILURE_MESSAGES: Record<CallFailureCode, string> = {
  signaling_timeout: 'No pudimos conectar con el servidor de llamadas. Verifica tu conexion y recarga la pagina.',
  signaling_reconnect_exhausted: 'Se perdio la conexion con el servidor. Recarga la pagina para reintentar.',
  sfu_connection_failed: 'El servidor de video no responde. Intenta de nuevo en unos segundos.',
  session_publish_failed: 'No se pudo iniciar el video. Recarga la pagina.',
  remote_media_timeout: 'El otro participante aun no tiene video disponible. Podes continuar con audio.',
  camera_permission_denied: 'Necesitamos acceso a tu camara. Revisa los permisos del navegador.',
  microphone_permission_denied: 'Necesitamos acceso a tu microfono. Revisa los permisos del navegador.',
  media_acquisition_failed: 'No se encontro camara o microfono. Verifica que esten conectados.',
  turn_unavailable: 'Problema de conectividad de red. Intenta desde otra red o recarga.',
  network_offline: 'Sin conexion a internet. Verifica tu red.',
  unknown: 'Ocurrio un error inesperado. Recarga la pagina para reintentar.',
}

/**
 * Get a user-friendly message for a classified failure code.
 */
export function messageForFailureCode(code: CallFailureCode): string {
  return FAILURE_MESSAGES[code]
}

/**
 * Sanitize a raw error message into a user-friendly string.
 * Used as fallback when no CallFailureCode is available.
 */
export function sanitizeErrorForUser(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('permission') || lower.includes('notallowed') || lower.includes('not allowed'))
    return FAILURE_MESSAGES.camera_permission_denied
  if (lower.includes('notfound') || lower.includes('not found') || lower.includes('no device'))
    return FAILURE_MESSAGES.media_acquisition_failed
  if (lower.includes('signaling') || lower.includes('websocket'))
    return FAILURE_MESSAGES.signaling_timeout
  if (lower.includes('icecandidate') || lower.includes('ice candidate') || lower.includes('ice failed') || lower.includes('stun') || lower.includes('relay'))
    return FAILURE_MESSAGES.turn_unavailable
  if (lower.includes('timeout') || lower.includes('timed out'))
    return FAILURE_MESSAGES.signaling_timeout
  return FAILURE_MESSAGES.unknown
}
