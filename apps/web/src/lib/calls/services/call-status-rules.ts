import type { CallStatus } from '@autamedica/telemedicine'

export type PersistableCallStatus = 'connecting' | 'connected' | 'ended'
export type DoctorCancelReason = 'doctor_canceled' | 'no_answer_timeout'

export type PersistCallStatusResolution =
  | {
      kind: 'allow'
      effectiveStatus: CallStatus
      changed: boolean
    }
  | {
      kind: 'conflict'
      message: string
    }

export type DoctorCancelStatusResolution =
  | {
      kind: 'allow'
      effectiveStatus: Extract<CallStatus, 'canceled'>
      changed: boolean
    }
  | {
      kind: 'conflict'
      message: string
    }

const TERMINAL_STATUSES = new Set<CallStatus>(['declined', 'canceled', 'ended'])
const CONNECTING_ALLOWED_FROM = new Set<CallStatus>(['requested', 'ringing', 'accepted', 'connecting'])
const CONNECTED_ALLOWED_FROM = new Set<CallStatus>(['accepted', 'connecting'])
const ENDABLE_STATUSES = new Set<CallStatus>(['accepted', 'connecting', 'connected'])
const DOCTOR_CANCELABLE_STATUSES = new Set<CallStatus>(['requested', 'ringing', 'accepted'])

export function resolvePersistCallStatus(
  requestedStatus: PersistableCallStatus,
  currentStatus: CallStatus,
): PersistCallStatusResolution {
  if (requestedStatus === 'connecting') {
    if (TERMINAL_STATUSES.has(currentStatus)) {
      return { kind: 'conflict', message: 'call_not_joinable' }
    }

    if (currentStatus === 'connected') {
      return {
        kind: 'allow',
        effectiveStatus: currentStatus,
        changed: false,
      }
    }

    if (CONNECTING_ALLOWED_FROM.has(currentStatus)) {
      return {
        kind: 'allow',
        effectiveStatus: 'connecting',
        changed: currentStatus !== 'connecting',
      }
    }

    return { kind: 'conflict', message: 'call_not_joinable' }
  }

  if (requestedStatus === 'connected') {
    if (TERMINAL_STATUSES.has(currentStatus)) {
      return { kind: 'conflict', message: 'call_not_connectable' }
    }

    if (currentStatus === 'connected') {
      return {
        kind: 'allow',
        effectiveStatus: 'connected',
        changed: false,
      }
    }

    if (CONNECTED_ALLOWED_FROM.has(currentStatus)) {
      return {
        kind: 'allow',
        effectiveStatus: 'connected',
        changed: true,
      }
    }

    return { kind: 'conflict', message: 'call_not_ready_to_connect' }
  }

  if (TERMINAL_STATUSES.has(currentStatus)) {
    return {
      kind: 'allow',
      effectiveStatus: currentStatus,
      changed: false,
    }
  }

  if (ENDABLE_STATUSES.has(currentStatus)) {
    return {
      kind: 'allow',
      effectiveStatus: 'ended',
      changed: currentStatus !== 'ended',
    }
  }

  return { kind: 'conflict', message: 'call_not_endable' }
}

export function resolveDoctorCancelStatus(
  currentStatus: CallStatus,
): DoctorCancelStatusResolution {
  if (currentStatus === 'canceled') {
    return {
      kind: 'allow',
      effectiveStatus: 'canceled',
      changed: false,
    }
  }

  if (DOCTOR_CANCELABLE_STATUSES.has(currentStatus)) {
    return {
      kind: 'allow',
      effectiveStatus: 'canceled',
      changed: true,
    }
  }

  return {
    kind: 'conflict',
    message: 'call_not_cancelable',
  }
}
