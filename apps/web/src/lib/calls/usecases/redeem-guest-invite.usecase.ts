import type {
  CallGuestInviteRecord,
  ICallGuestInviteRepository,
} from '@autamedica/types'

export interface RedeemGuestInviteInput {
  inviteId: string
  roomId: string
  now?: Date
}

export interface RedeemGuestInviteData {
  callId: string
  roomId: string
  guestName: string
}

export type RedeemGuestInviteResult =
  | { kind: 'ok'; data: RedeemGuestInviteData }
  | {
      kind: 'error'
      reason: 'not_found' | 'already_redeemed' | 'expired'
    }

export interface RedeemGuestInviteDeps {
  inviteRepo: ICallGuestInviteRepository
}

function isExpired(invite: CallGuestInviteRecord, now: Date): boolean {
  const expiresAt = new Date(invite.expires_at).getTime()
  if (Number.isNaN(expiresAt)) {
    return true
  }
  return expiresAt < now.getTime()
}

export async function redeemGuestInviteUseCase(
  deps: RedeemGuestInviteDeps,
  input: RedeemGuestInviteInput,
): Promise<RedeemGuestInviteResult> {
  const now = input.now ?? new Date()

  const invite = await deps.inviteRepo.findByIdForRoom(input.inviteId, input.roomId)
  if (!invite) {
    return { kind: 'error', reason: 'not_found' }
  }

  if (invite.used_at) {
    return { kind: 'error', reason: 'already_redeemed' }
  }

  if (isExpired(invite, now)) {
    return { kind: 'error', reason: 'expired' }
  }

  await deps.inviteRepo.markRedeemed(invite.id, now.toISOString())

  return {
    kind: 'ok',
    data: {
      callId: invite.call_id,
      roomId: invite.room_id,
      guestName: invite.guest_name,
    },
  }
}
