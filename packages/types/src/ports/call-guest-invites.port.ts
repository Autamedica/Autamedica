/**
 * Port: Call Guest Invite Repository
 *
 * Interfaz abstracta mínima para acceso a invitaciones opacas de invitados
 * a videollamadas. Solo expone las operaciones requeridas por el flujo de
 * redención; se extenderá cuando otros flujos (issue, revoke) se migren a
 * la arquitectura hexagonal.
 */

export interface CallGuestInviteRecord {
  id: string
  call_id: string
  room_id: string
  guest_name: string
  expires_at: string
  used_at: string | null
  created_at: string
}

export interface ICallGuestInviteRepository {
  /**
   * Obtiene una invitación por su ID opaco, restringida al room.
   * Retorna null si no existe o pertenece a otra sala.
   */
  findByIdForRoom(inviteId: string, roomId: string): Promise<CallGuestInviteRecord | null>

  /**
   * Marca una invitación como redimida registrando el timestamp.
   * Retorna true si se actualizó la fila, false si no existía.
   */
  markRedeemed(inviteId: string, redeemedAt: string): Promise<boolean>
}
