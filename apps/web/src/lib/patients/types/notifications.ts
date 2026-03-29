export type PortalNotificationAudience = 'patient' | 'doctor' | 'company' | 'admin';

export type PortalNotificationCategory = 'appointment' | 'report' | 'community' | 'system';

export type PortalNotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface PortalNotification {
  id: string;
  user_id: string;
  audience: PortalNotificationAudience;
  category: PortalNotificationCategory;
  type: string;
  title: string;
  body: string;
  action_url: string | null;
  action_label: string | null;
  priority: PortalNotificationPriority;
  dedupe_key: string;
  context_data: Record<string, unknown>;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalNotificationFeed {
  unreadCount: number;
  notifications: PortalNotification[];
}

export interface PortalNotificationCandidate {
  audience?: PortalNotificationAudience;
  category: PortalNotificationCategory;
  type: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  priority?: PortalNotificationPriority;
  dedupeKey: string;
  contextData?: Record<string, unknown>;
  createdAt?: string;
}
