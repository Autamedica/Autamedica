'use client';

import { useMemo, useState } from 'react';
import {
  Bell,
  Calendar,
  CheckCheck,
  FileText,
  Loader2,
  MessageCircle,
  Pill,
} from 'lucide-react';
import { useDoctorNotifications } from '@/hooks/doctors/useDoctorNotifications';
import type { DoctorPortalNotification } from '@/lib/doctors/types/notifications.types';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins}m`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;

  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

function notificationIcon(category: DoctorPortalNotification['category']) {
  switch (category) {
    case 'appointment':
      return <Calendar className="h-4 w-4" strokeWidth={1.5} />;
    case 'clarification':
      return <FileText className="h-4 w-4" strokeWidth={1.5} />;
    case 'prescription':
      return <Pill className="h-4 w-4" strokeWidth={1.5} />;
    case 'community':
      return <MessageCircle className="h-4 w-4" strokeWidth={1.5} />;
    default:
      return <Bell className="h-4 w-4" strokeWidth={1.5} />;
  }
}

export default function DoctorNotificationsBell() {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markRead,
    markAllRead,
  } = useDoctorNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadLabel = useMemo(
    () => (unreadCount > 9 ? '9+' : String(unreadCount)),
    [unreadCount],
  );

  async function handleNotificationClick(
    notification: DoctorPortalNotification,
  ) {
    setPendingId(notification.id);

    try {
      if (!notification.read_at) {
        await markRead(notification.id);
      }

      if (notification.action_url) {
        window.location.href = notification.action_url;
        return;
      }

      setIsOpen(false);
    } finally {
      setPendingId((current) =>
        current === notification.id ? null : current,
      );
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);

    try {
      await markAllRead();
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="relative rounded-full p-2.5 transition-colors hover:bg-neutral-100"
        aria-label="Notificaciones"
      >
        <Bell className="h-4 w-4 text-neutral-400" strokeWidth={1.5} />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-900 px-1 text-[10px] font-semibold text-white">
            {unreadLabel}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="Cerrar notificaciones"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setIsOpen(false)}
          />

          <section className="absolute right-0 top-12 z-40 w-[min(92vw,388px)] overflow-hidden rounded-[26px] border border-neutral-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-4">
              <div>
                <p className="text-[13px] font-semibold text-neutral-900">
                  Notificaciones
                </p>
                <p className="text-[11px] text-neutral-500">
                  Agenda, recetas y comunidad
                </p>
              </div>

              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleMarkAllRead()}
                  disabled={markingAll}
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-[11px] font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-60"
                >
                  {markingAll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3.5 w-3.5" />
                  )}
                  Marcar todo
                </button>
              ) : null}
            </header>

            {loading ? (
              <div className="flex items-center justify-center px-4 py-10">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
              </div>
            ) : error ? (
              <div className="px-4 py-6 text-sm text-red-600">{error}</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-neutral-900">
                  No hay novedades por ahora
                </p>
                <p className="mt-1 text-[12px] text-neutral-500">
                  Cuando ocurra algo importante, va a aparecer aca.
                </p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => void handleNotificationClick(notification)}
                    className={`flex w-full items-start gap-3 border-b border-neutral-100 px-4 py-4 text-left last:border-b-0 ${
                      notification.read_at ? 'bg-white' : 'bg-neutral-50'
                    }`}
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
                      {notificationIcon(notification.category)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-[13px] font-semibold text-neutral-950">
                          {notification.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-neutral-400">
                          {timeAgo(notification.created_at)}
                        </span>
                      </span>

                      <span className="mt-1 block text-[13px] leading-5 text-neutral-600">
                        {notification.body}
                      </span>

                      {notification.action_label ? (
                        <span className="mt-2 inline-flex rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700">
                          {pendingId === notification.id
                            ? 'Abriendo...'
                            : notification.action_label}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
