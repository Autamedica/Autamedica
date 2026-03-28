export function sanitizeErrorForUser(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('permission') || lower.includes('notallowed') || lower.includes('not allowed'))
    return 'Necesitamos acceso a tu cámara y micrófono. Revisá los permisos del navegador.'
  if (lower.includes('notfound') || lower.includes('not found') || lower.includes('no device'))
    return 'No se encontró cámara o micrófono. Verificá que estén conectados.'
  if (lower.includes('signaling') || lower.includes('websocket'))
    return 'No pudimos conectar con el servidor. Recargá la página para reintentar.'
  if (lower.includes('icecandidate') || lower.includes('ice candidate') || lower.includes('ice failed') || lower.includes('stun') || lower.includes('relay'))
    return 'Problema de red. Verificá tu conexión a internet.'
  if (lower.includes('timeout') || lower.includes('timed out'))
    return 'La conexión tardó demasiado. Intentá de nuevo.'
  return 'Ocurrió un error. Recargá la página para reintentar.'
}
