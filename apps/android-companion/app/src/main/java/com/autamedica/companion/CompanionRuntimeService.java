package com.autamedica.companion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

public final class CompanionRuntimeService extends Service {
    public static final String ACTION_START = "com.autamedica.companion.action.START_BACKGROUND_BROWSER";
    public static final String ACTION_STOP = "com.autamedica.companion.action.STOP_BACKGROUND_BROWSER";
    private static final String CHANNEL_ID = "autamedica_browser_runtime";
    private static final int NOTIFICATION_ID = 18767;
    private static volatile boolean running;
    private PowerManager.WakeLock wakeLock;

    static boolean isRunning() {
        return running;
    }

    static boolean start(android.content.Context context) {
        try {
            Intent intent = new Intent(context, CompanionRuntimeService.class).setAction(ACTION_START);
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
            else context.startService(intent);
            return true;
        } catch (Exception error) {
            android.util.Log.w("AutamedicaCompanion", "Could not start runtime service: " + error.getClass().getSimpleName());
            return false;
        }
    }

    static boolean stop(android.content.Context context) {
        try {
            Intent intent = new Intent(context, CompanionRuntimeService.class).setAction(ACTION_STOP);
            context.startService(intent);
            return true;
        } catch (Exception error) {
            android.util.Log.w("AutamedicaCompanion", "Could not stop runtime service: " + error.getClass().getSimpleName());
            return false;
        }
    }

    @Override public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopRuntime();
            stopSelf();
            return START_NOT_STICKY;
        }

        startForeground(NOTIFICATION_ID, buildNotification());
        acquireCpuLock();
        running = true;
        return START_STICKY;
    }

    private void acquireCpuLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager manager = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AutamedicaCompanion:BrowserRuntime");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private Notification buildNotification() {
        Intent stop = new Intent(this, CompanionRuntimeService.class).setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(
            this, 18768, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent open = new Intent(this, MainActivity.class);
        PendingIntent openPending = PendingIntent.getActivity(
            this, 18769, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Autamedica Companion activo")
            .setContentText("Chromium, Internet y automatización continúan con la pantalla apagada")
            .setContentIntent(openPending)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, "Detener sesión", stopPending);
        return builder.build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Automatización en segundo plano", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Estado de la sesión de navegador de Autamedica Companion");
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }

    private void stopRuntime() {
        running = false;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
    }

    @Override public void onDestroy() {
        stopRuntime();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) {
        return null;
    }
}
