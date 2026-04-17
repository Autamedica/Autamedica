import { describe, expect, it, vi } from 'vitest'
import type {
  CallGuestInviteRecord,
  ICallGuestInviteRepository,
} from '@autamedica/types'
import { redeemGuestInviteUseCase } from './redeem-guest-invite.usecase'

function makeInvite(overrides: Partial<CallGuestInviteRecord> = {}): CallGuestInviteRecord {
  return {
    id: 'invite-1',
    call_id: 'call-1',
    room_id: 'room-1',
    guest_name: 'Acompañante',
    expires_at: '2099-01-01T00:00:00.000Z',
    used_at: null,
    created_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRepo(overrides: Partial<ICallGuestInviteRepository> = {}): ICallGuestInviteRepository {
  return {
    findByIdForRoom: vi.fn().mockResolvedValue(null),
    markRedeemed: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('redeemGuestInviteUseCase', () => {
  it('redeems a valid invite and returns callable payload', async () => {
    const invite = makeInvite()
    const inviteRepo = makeRepo({
      findByIdForRoom: vi.fn().mockResolvedValue(invite),
      markRedeemed: vi.fn().mockResolvedValue(true),
    })
    const now = new Date('2026-04-17T12:00:00.000Z')

    const result = await redeemGuestInviteUseCase(
      { inviteRepo },
      { inviteId: invite.id, roomId: invite.room_id, now },
    )

    expect(result).toEqual({
      kind: 'ok',
      data: {
        callId: invite.call_id,
        roomId: invite.room_id,
        guestName: invite.guest_name,
      },
    })
    expect(inviteRepo.markRedeemed).toHaveBeenCalledWith(invite.id, now.toISOString())
  })

  it('returns not_found when invite does not exist for the room', async () => {
    const inviteRepo = makeRepo({
      findByIdForRoom: vi.fn().mockResolvedValue(null),
    })

    const result = await redeemGuestInviteUseCase(
      { inviteRepo },
      { inviteId: 'missing', roomId: 'room-1' },
    )

    expect(result).toEqual({ kind: 'error', reason: 'not_found' })
    expect(inviteRepo.markRedeemed).not.toHaveBeenCalled()
  })

  it('returns already_redeemed when used_at is set', async () => {
    const inviteRepo = makeRepo({
      findByIdForRoom: vi
        .fn()
        .mockResolvedValue(makeInvite({ used_at: '2026-04-16T10:00:00.000Z' })),
    })

    const result = await redeemGuestInviteUseCase(
      { inviteRepo },
      { inviteId: 'invite-1', roomId: 'room-1' },
    )

    expect(result).toEqual({ kind: 'error', reason: 'already_redeemed' })
    expect(inviteRepo.markRedeemed).not.toHaveBeenCalled()
  })

  it('returns expired when expires_at is in the past', async () => {
    const inviteRepo = makeRepo({
      findByIdForRoom: vi
        .fn()
        .mockResolvedValue(makeInvite({ expires_at: '2026-04-01T00:00:00.000Z' })),
    })
    const now = new Date('2026-04-17T12:00:00.000Z')

    const result = await redeemGuestInviteUseCase(
      { inviteRepo },
      { inviteId: 'invite-1', roomId: 'room-1', now },
    )

    expect(result).toEqual({ kind: 'error', reason: 'expired' })
    expect(inviteRepo.markRedeemed).not.toHaveBeenCalled()
  })
})
