import type { CallSessionBootstrap } from '@autamedica/telemedicine'
import { fetchApi } from '@/lib/api-client'

export const callSessionService = {
  async getBootstrap(roomId: string): Promise<CallSessionBootstrap> {
    if (!roomId.trim()) {
      throw new Error('roomId is required')
    }

    return fetchApi<CallSessionBootstrap>(`/api/calls/${encodeURIComponent(roomId)}/bootstrap`)
  },
}
