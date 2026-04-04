import type {
  PortalNotification,
  PortalNotificationCandidate,
} from '@/lib/patients/types/notifications'

export interface INotificationsRepository {
  listByUser(userId: string, limit?: number): Promise<PortalNotification[]>
  countUnread(userId: string): Promise<number>
  listExistingDedupeKeys(userId: string, dedupeKeys: string[]): Promise<Set<string>>
  insertMissing(userId: string, candidates: PortalNotificationCandidate[]): Promise<void>
  markRead(userId: string, notificationId: string): Promise<void>
  markAllRead(userId: string): Promise<void>
}
