import { describe, expect, it } from 'vitest'
import {
  resolveDoctorCancelStatus,
  resolvePersistCallStatus,
} from '@/lib/calls/services/call-status-rules'

describe('resolvePersistCallStatus', () => {
  describe('connecting', () => {
    it('allows moving from ringing to connecting for the current waiting-room flow', () => {
      expect(resolvePersistCallStatus('connecting', 'ringing')).toEqual({
        kind: 'allow',
        effectiveStatus: 'connecting',
        changed: true,
      })
    })

    it('is idempotent when the call is already connecting', () => {
      expect(resolvePersistCallStatus('connecting', 'connecting')).toEqual({
        kind: 'allow',
        effectiveStatus: 'connecting',
        changed: false,
      })
    })

    it('rejects terminal calls', () => {
      expect(resolvePersistCallStatus('connecting', 'ended')).toEqual({
        kind: 'conflict',
        message: 'call_not_joinable',
      })
    })
  })

  describe('connected', () => {
    it('allows moving from accepted to connected', () => {
      expect(resolvePersistCallStatus('connected', 'accepted')).toEqual({
        kind: 'allow',
        effectiveStatus: 'connected',
        changed: true,
      })
    })

    it('allows moving from connecting to connected', () => {
      expect(resolvePersistCallStatus('connected', 'connecting')).toEqual({
        kind: 'allow',
        effectiveStatus: 'connected',
        changed: true,
      })
    })

    it('is idempotent when the call is already connected', () => {
      expect(resolvePersistCallStatus('connected', 'connected')).toEqual({
        kind: 'allow',
        effectiveStatus: 'connected',
        changed: false,
      })
    })

    it('rejects jumping to connected from ringing', () => {
      expect(resolvePersistCallStatus('connected', 'ringing')).toEqual({
        kind: 'conflict',
        message: 'call_not_ready_to_connect',
      })
    })

    it('rejects terminal calls', () => {
      expect(resolvePersistCallStatus('connected', 'canceled')).toEqual({
        kind: 'conflict',
        message: 'call_not_connectable',
      })
    })
  })

  describe('ended', () => {
    it('allows ending an active call', () => {
      expect(resolvePersistCallStatus('ended', 'connected')).toEqual({
        kind: 'allow',
        effectiveStatus: 'ended',
        changed: true,
      })
    })

    it('keeps end idempotent for terminal rooms', () => {
      expect(resolvePersistCallStatus('ended', 'ended')).toEqual({
        kind: 'allow',
        effectiveStatus: 'ended',
        changed: false,
      })
    })

    it('rejects ending directly from ringing once cancel/no-answer has its own path', () => {
      expect(resolvePersistCallStatus('ended', 'ringing')).toEqual({
        kind: 'conflict',
        message: 'call_not_endable',
      })
    })
  })

  describe('doctor cancel', () => {
    it('allows canceling a ringing call', () => {
      expect(resolveDoctorCancelStatus('ringing')).toEqual({
        kind: 'allow',
        effectiveStatus: 'canceled',
        changed: true,
      })
    })

    it('allows canceling an accepted call before the room is connected', () => {
      expect(resolveDoctorCancelStatus('accepted')).toEqual({
        kind: 'allow',
        effectiveStatus: 'canceled',
        changed: true,
      })
    })

    it('is idempotent when the call is already canceled', () => {
      expect(resolveDoctorCancelStatus('canceled')).toEqual({
        kind: 'allow',
        effectiveStatus: 'canceled',
        changed: false,
      })
    })

    it('rejects canceling once media negotiation has started', () => {
      expect(resolveDoctorCancelStatus('connecting')).toEqual({
        kind: 'conflict',
        message: 'call_not_cancelable',
      })
    })

    it('rejects canceling a finished call', () => {
      expect(resolveDoctorCancelStatus('ended')).toEqual({
        kind: 'conflict',
        message: 'call_not_cancelable',
      })
    })
  })

  describe('ended after cancel path exists', () => {
    it('still allows ending from accepted when the room was already joined', () => {
      expect(resolvePersistCallStatus('ended', 'accepted')).toEqual({
        kind: 'allow',
        effectiveStatus: 'ended',
        changed: true,
      })
    })

    it('no longer allows ending from requested', () => {
      expect(resolvePersistCallStatus('ended', 'requested')).toEqual({
        kind: 'conflict',
        message: 'call_not_endable',
      })
    })

    it('no longer allows ending from ringing', () => {
      expect(resolvePersistCallStatus('ended', 'ringing')).toEqual({
        kind: 'conflict',
        message: 'call_not_endable',
      })
    })
  })
})
