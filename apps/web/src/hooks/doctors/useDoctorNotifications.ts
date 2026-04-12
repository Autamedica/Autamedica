'use client';

import { logger } from '@autamedica/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { doctorNotificationsBrowserService } from '@/lib/doctors/services/notifications.browser';
import { getBrowserSupabaseClient } from '@/lib/supabase-browser';
import type { DoctorPortalNotification } from '@/lib/doctors/types/notifications.types';

interface UseDoctorNotificationsResult {
  notifications: DoctorPortalNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export function useDoctorNotifications(): UseDoctorNotificationsResult {
  const [notifications, setNotifications] = useState<DoctorPortalNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const feed = await doctorNotificationsBrowserService.getFeed();
      setNotifications(feed.notifications);
      setUnreadCount(feed.unreadCount);
    } catch (err) {
      logger.error('[useDoctorNotifications] refresh failed', err);
      setError('No pudimos cargar las notificaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  const markRead = useCallback(async (notificationId: string) => {
    const previous = notificationsRef.current;
    const nextNotifications = previous.map((notification) =>
      notification.id === notificationId && !notification.read_at
        ? { ...notification, read_at: new Date().toISOString() }
        : notification,
    );

    setNotifications(nextNotifications);
    setUnreadCount(
      nextNotifications.filter((notification) => !notification.read_at).length,
    );

    try {
      await doctorNotificationsBrowserService.markRead(notificationId);
    } catch (err) {
      logger.error('[useDoctorNotifications] markRead failed', err);
      setNotifications(previous);
      setUnreadCount(previous.filter((notification) => !notification.read_at).length);
      throw err;
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const previous = notificationsRef.current;
    const markedAt = new Date().toISOString();

    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        read_at: notification.read_at ?? markedAt,
      })),
    );
    setUnreadCount(0);

    try {
      await doctorNotificationsBrowserService.markAllRead();
    } catch (err) {
      logger.error('[useDoctorNotifications] markAllRead failed', err);
      setNotifications(previous);
      setUnreadCount(previous.filter((notification) => !notification.read_at).length);
      throw err;
    }
  }, []);

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

  useEffect(() => {
    let active = true;
    const supabase = getBrowserSupabaseClient();
    let channel: { unsubscribe: () => void } | null = null;

    async function setupRealtime() {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError) {
          logger.warn('[useDoctorNotifications] realtime auth lookup failed', authError);
          return;
        }

        const userId = data.user?.id;
        if (!userId || !active) {
          return;
        }

        channel = (supabase as typeof supabase & {
          channel: (name: string) => {
            on: (
              event: 'postgres_changes',
              filter: Record<string, unknown>,
              callback: (payload: {
                eventType: 'INSERT' | 'UPDATE';
                new: Record<string, unknown>;
              }) => void,
            ) => {
              subscribe: () => { unsubscribe: () => void };
            };
          };
        })
          .channel(`doctor-notifications:${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'portal_notifications',
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              if (!active) {
                return;
              }

              const nextNotification = payload.new as DoctorPortalNotification | null;
              if (nextNotification?.audience !== 'doctor') {
                return;
              }

              if (payload.eventType === 'INSERT') {
                setNotifications((current) => {
                  const exists = current.some((notification) => notification.id === nextNotification.id);
                  if (exists) {
                    return current;
                  }

                  return [nextNotification, ...current].slice(0, 24);
                });

                if (!nextNotification.read_at) {
                  setUnreadCount((current) => current + 1);
                }

                return;
              }

              if (payload.eventType === 'UPDATE') {
                setNotifications((current) =>
                  current.map((notification) =>
                    notification.id === nextNotification.id ? nextNotification : notification,
                  ),
                );

                setUnreadCount((current) => {
                  const previous = notificationsRef.current.find(
                    (notification) => notification.id === nextNotification.id,
                  );

                  if (!previous) {
                    return current;
                  }

                  if (!previous.read_at && nextNotification.read_at) {
                    return Math.max(0, current - 1);
                  }

                  if (previous.read_at && !nextNotification.read_at) {
                    return current + 1;
                  }

                  return current;
                });
              }
            },
          )
          .subscribe();
      } catch (err) {
        logger.warn('[useDoctorNotifications] realtime subscription failed', err);
      }
    }

    void setupRealtime();

    return () => {
      active = false;
      channel?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh();
    }, 300000);

    return () => window.clearInterval(interval);
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
