'use client';

import { logger } from '@autamedica/shared';
import { useCallback, useEffect, useState } from 'react';
import { notificationsBrowserService } from '@/lib/patients/services/notifications.browser';
import type { PortalNotification } from '@/lib/patients/types/notifications';

interface UsePatientNotificationsResult {
  notifications: PortalNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export function usePatientNotifications(): UsePatientNotificationsResult {
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const feed = await notificationsBrowserService.getFeed();
      setNotifications(feed.notifications);
      setUnreadCount(feed.unreadCount);
    } catch (err) {
      logger.error('[usePatientNotifications] refresh failed', err);
      setError('No pudimos cargar las notificaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (notificationId: string) => {
    const previous = notifications;
    const nextNotifications = notifications.map((notification) =>
      notification.id === notificationId && !notification.read_at
        ? { ...notification, read_at: new Date().toISOString() }
        : notification,
    );

    const nextUnread = nextNotifications.filter((notification) => !notification.read_at).length;
    setNotifications(nextNotifications);
    setUnreadCount(nextUnread);

    try {
      await notificationsBrowserService.markRead(notificationId);
    } catch (err) {
      logger.error('[usePatientNotifications] markRead failed', err);
      setNotifications(previous);
      setUnreadCount(previous.filter((notification) => !notification.read_at).length);
      throw err;
    }
  }, [notifications]);

  const markAllRead = useCallback(async () => {
    const previous = notifications;
    const markedAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        read_at: notification.read_at ?? markedAt,
      })),
    );
    setUnreadCount(0);

    try {
      await notificationsBrowserService.markAllRead();
    } catch (err) {
      logger.error('[usePatientNotifications] markAllRead failed', err);
      setNotifications(previous);
      setUnreadCount(previous.filter((notification) => !notification.read_at).length);
      throw err;
    }
  }, [notifications]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function handleFocus() {
      void refresh();
    }

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refresh]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
  };
}
