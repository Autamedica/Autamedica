import { fetchApi } from '@/lib/api-client';
import type { DoctorPortalNotificationFeed } from '@/lib/doctors/types/notifications.types';

export const doctorNotificationsBrowserService = {
  async getFeed(): Promise<DoctorPortalNotificationFeed> {
    return fetchApi<DoctorPortalNotificationFeed>('/api/doctors/notifications');
  },

  async markRead(notificationId: string): Promise<void> {
    await fetchApi<void>(`/api/doctors/notifications/${notificationId}/read`, {
      method: 'POST',
    });
  },

  async markAllRead(): Promise<void> {
    await fetchApi<void>('/api/doctors/notifications/read-all', {
      method: 'POST',
    });
  },
};
