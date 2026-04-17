import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CallGuestInviteRecord,
  Database,
  ICallGuestInviteRepository,
} from '@autamedica/types'
import { logger } from '@autamedica/shared'

type Db = SupabaseClient<Database>

const INVITE_COLUMNS =
  'id, call_id, room_id, guest_name, expires_at, used_at, created_at' as const

export function createCallGuestInviteAdapter(supabase: Db): ICallGuestInviteRepository {
  return {
    async findByIdForRoom(inviteId, roomId) {
      const { data, error } = await supabase
        .from('call_guest_invites')
        .select(INVITE_COLUMNS)
        .eq('id', inviteId)
        .eq('room_id', roomId)
        .maybeSingle()

      if (error) {
        logger.error('[callGuestInvitesRepo] findByIdForRoom failed', error)
        throw error
      }

      return (data as CallGuestInviteRecord | null) ?? null
    },

    async markRedeemed(inviteId, redeemedAt) {
      const { data, error } = await supabase
        .from('call_guest_invites')
        .update({ used_at: redeemedAt })
        .eq('id', inviteId)
        .select('id')
        .maybeSingle()

      if (error) {
        logger.error('[callGuestInvitesRepo] markRedeemed failed', error)
        throw error
      }

      return Boolean(data)
    },
  }
}
