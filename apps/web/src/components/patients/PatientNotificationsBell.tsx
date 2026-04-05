'use client';

import { useMemo, useState } from 'react';
import {
  Bell,
  CalendarDays,
  CheckCheck,
  FileText,
  Loader2,
  MessageCircle,
  Stethoscope,
} from 'lucide-react';
import { usePatientNotifications } from '@/hooks/patients/usePatientNotifications';
import type { PortalNotification } from '@/lib/patients/types/notifications';

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

function notificationIcon(category: PortalNotification['category']) {
  switch (category) {
    case 'appointment':
      return <CalendarDays className="h-4 w-4" />;
    case 'report':
      return <FileText className="h-4 w-4" />;
    case 'community':
      return <MessageCircle className="h-4 w-4" />;
    default:
      return <Stethoscope className="h-4 w-4" />;
  }
}

export default function PatientNotificationsBell() {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markRead,
    markAllRead,
  } = usePatientNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadLabel = useMemo(
    () => (unreadCount > 9 ? '9+' : String(unreadCount)),
    [unreadCount],
  );

  async function handleNotificationClick(notification: PortalNotification) {
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
      setPendingId((current) => (current === notification.id ? null : current));
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
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600"
        aria-label="Notificaciones"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
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
          <section className="absolute right-0 top-12 z-40 w-[min(92vw,380px)] overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-am-dropdown">
            <header className="flex items-center justify-between border-b border-sky-100 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-gray-950">Notificaciones</p>
                <p className="text-xs text-gray-500">Turnos, informes y comunidad</p>
              </div>

              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={markingAll}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-100 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:border-sky-200 disabled:opacity-60"
                >
                  {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                  Marcar todo
                </button>
              ) : null}
            </header>

            {loading ? (
              <div className="flex items-center justify-center px-4 py-10">
                <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
              </div>
            ) : error ? (
              <div className="px-4 py-6 text-sm text-red-600">{error}</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-gray-900">No hay novedades por ahora</p>
                <p className="mt-1 text-xs text-gray-500">Cuando pase algo importante, va a aparecer acá.</p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => void handleNotificationClick(notification)}
                    className={`flex w-full items-start gap-3 border-b border-sky-50 px-4 py-4 text-left last:border-b-0 ${
                      notification.read_at ? 'bg-white' : 'bg-sky-50/45'
                    }`}
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                      {notificationIcon(notification.category)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-gray-950">
                          {notification.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-gray-400">
                          {timeAgo(notification.created_at)}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm leading-5 text-gray-600">
                        {notification.body}
                      </span>
                      {notification.action_label ? (
                        <span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-sky-700 ring-1 ring-sky-100">
                          {pendingId === notification.id ? 'Abriendo...' : notification.action_label}
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
