package com.autamedica.companion;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.Deque;

public final class CompanionNotificationListener extends NotificationListenerService {
    private static final int MAX_EVENTS = 50;
    private static final Deque<JSONObject> RECENT = new ArrayDeque<>();
    private static volatile boolean connected;

    public static boolean isConnected() {
        return connected;
    }

    public static JSONArray getRecent(int limit) {
        JSONArray result = new JSONArray();
        int cap = Math.max(1, Math.min(MAX_EVENTS, limit));
        synchronized (RECENT) {
            int count = 0;
            for (JSONObject item : RECENT) {
                if (count++ >= cap) break;
                result.put(item);
            }
        }
        return result;
    }

    public static void clearRecent() {
        synchronized (RECENT) {
            RECENT.clear();
        }
    }

    @Override public void onListenerConnected() {
        connected = true;
    }

    @Override public void onListenerDisconnected() {
        connected = false;
    }

    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;
        try {
            Bundle extras = sbn.getNotification().extras;
            CharSequence title = extras == null ? null : extras.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence text = extras == null ? null : extras.getCharSequence(Notification.EXTRA_TEXT);
            JSONObject item = new JSONObject();
            item.put("package", sbn.getPackageName());
            item.put("postTime", sbn.getPostTime());
            item.put("title", title == null ? "" : title.toString());
            item.put("text", text == null ? "" : text.toString());
            synchronized (RECENT) {
                RECENT.addFirst(item);
                while (RECENT.size() > MAX_EVENTS) RECENT.removeLast();
            }
        } catch (Exception ignored) {}
    }
}
