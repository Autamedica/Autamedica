package com.autamedica.companion;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !"android.intent.action.LOCKED_BOOT_COMPLETED".equals(action)) {
            return;
        }
        try {
            Intent serviceIntent = new Intent(context, CompanionRuntimeService.class)
                .setAction(CompanionRuntimeService.ACTION_START);
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Exception error) {
            android.util.Log.w("AutamedicaCompanion", "Boot start failed: " + error.getClass().getSimpleName());
        }
    }
}
