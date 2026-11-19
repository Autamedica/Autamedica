package com.autamedica.companion;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/** Exposes the system-managed notification listener connection state to the local health API. */
public final class CompanionNotificationListenerService extends NotificationListenerService {
    private static volatile CompanionNotificationListenerService instance;

    public static boolean isConnected() {
        return instance != null;
    }

    @Override public void onListenerConnected() {
        super.onListenerConnected();
        instance = this;
    }

    @Override public void onListenerDisconnected() {
        if (instance == this) instance = null;
        super.onListenerDisconnected();
    }

    @Override public void onNotificationPosted(StatusBarNotification notification) {
        // Notifications are not persisted or logged.
    }

    @Override public void onNotificationRemoved(StatusBarNotification notification) {
        // Notifications are not persisted or logged.
    }

    @Override public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }
}
