import { fetchApi } from '@/lib/api-client';
import type { PortalNotificationFeed } from '@/lib/patients/types/notifications';

export const notificationsBrowserService = {
  async getFeed(): Promise<PortalNotificationFeed> {
    return fetchApi<PortalNotificationFeed>('/api/patients/notifications');
  },

  async markRead(notificationId: string): Promise<void> {
    await fetchApi<void>(`/api/patients/notifications/${notificationId}/read`, {
      method: 'POST',
    });
  },

  async markAllRead(): Promise<void> {
    await fetchApi<void>('/api/patients/notifications/read-all', {
      method: 'POST',
    });
  },
};
