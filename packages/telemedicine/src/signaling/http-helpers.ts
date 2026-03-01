import { logger } from '@autamedica/shared'

export interface HttpSignalingMessage {
  type: string
  from: string
  data?: Record<string, unknown>
  timestamp?: number
}

interface PollResponse {
  messages: HttpSignalingMessage[]
}

export async function joinSignalingRoom(
  baseUrl: string,
  userId: string,
  roomId: string,
  userType: string
): Promise<boolean> {
  const response = await fetch(`${baseUrl}/api/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, roomId, userType }),
  })
  return response.ok
}

export async function pollSignalingMessages(
  baseUrl: string,
  userId: string,
  roomId: string
): Promise<HttpSignalingMessage[]> {
  const response = await fetch(
    `${baseUrl}/api/poll?userId=${encodeURIComponent(userId)}&roomId=${encodeURIComponent(roomId)}`
  )
  if (!response.ok) return []
  const data: PollResponse = await response.json()
  return data.messages ?? []
}

export async function sendSignalingMessage(
  baseUrl: string,
  message: { from: string; roomId: string; type: string; data?: Record<string, unknown> }
): Promise<void> {
  try {
    await fetch(`${baseUrl}/api/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
  } catch (error) {
    logger.error('Error sending signaling message:', error)
  }
}

export async function leaveSignalingRoom(
  baseUrl: string,
  userId: string,
  roomId: string
): Promise<void> {
  try {
    await fetch(`${baseUrl}/api/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, roomId }),
    })
  } catch (error) {
    logger.error('Failed to leave room:', error)
  }
}

