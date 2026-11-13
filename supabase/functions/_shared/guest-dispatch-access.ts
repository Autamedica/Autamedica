export type GuestDispatchRow = {
  id: string
  call_id: string | null
  cloudflare_room_id: string
  assigned_doctor_id: string | null
  status: string
}

export type DispatchCallRow = {
  id: string
  room_id: string
  doctor_id: string | null
}

/**
 * Resolves the signed guest dispatch ID to its distinct calls.id without
 * widening access to another doctor, request, room or unaccepted call.
 */
export function guestDispatchCallMatches(
  dispatch: GuestDispatchRow,
  guest: { callId: string; roomId: string },
  call: DispatchCallRow | null,
): boolean {
  return Boolean(
    call &&
    (dispatch.id === guest.callId || dispatch.call_id === guest.callId) &&
    dispatch.status === "in_call" &&
    dispatch.assigned_doctor_id &&
    dispatch.call_id === call.id &&
    dispatch.cloudflare_room_id === guest.roomId &&
    call.room_id === guest.roomId &&
    call.doctor_id === dispatch.assigned_doctor_id
  )
}
