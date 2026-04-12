import type {
  PortalNotification,
  PortalNotificationCandidate,
  PortalNotificationFeed,
  PortalNotificationPriority,
} from '@/lib/patients/types/notifications';

export type DoctorNotificationAudience = 'doctor';

export type DoctorNotificationCategory =
  | 'appointment'
  | 'clarification'
  | 'prescription'
  | 'community'
  | 'system';

export type DoctorNotificationPriority = PortalNotificationPriority;

export interface DoctorPortalNotification
  extends Omit<PortalNotification, 'audience' | 'category'> {
  audience: DoctorNotificationAudience;
  category: DoctorNotificationCategory;
}

export interface DoctorPortalNotificationFeed
  extends Omit<PortalNotificationFeed, 'notifications'> {
  notifications: DoctorPortalNotification[];
}

export interface DoctorPortalNotificationCandidate
  extends Omit<PortalNotificationCandidate, 'audience' | 'category'> {
  audience?: DoctorNotificationAudience;
  category: DoctorNotificationCategory;
}
