package com.autamedica.android

import android.app.Application
import android.content.Context
import com.autamedica.android.service.NotificationHelper
import com.autamedica.android.util.DebugStrictMode
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import java.io.File

@HiltAndroidApp
class AutamedicaApplication : Application() {

    // QA-only: record stack symbols, never exception messages, patient data or tokens.
    // Installed in attachBaseContext, before ContentProviders and Activity injection.
    override fun attachBaseContext(base: Context) {
        super.attachBaseContext(base)
        if (!BuildConfig.DEBUG || !BuildConfig.APPLICATION_ID.endsWith(".internal")) return
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                val types = generateSequence(error) { it.cause }
                    .take(4)
                    .joinToString(" -> ") { it.javaClass.name }
                val frames = error.stackTrace
                    .take(12)
                    .joinToString("\n") { "${it.className}.${it.methodName}" }
                base.getSharedPreferences("qa_crash_diagnostics", Context.MODE_PRIVATE)
                    .edit()
                    .putString("qa_last_crash", "Exception types: $types\nStack symbols:\n$frames")
                    .putLong("qa_crash_timestamp", System.currentTimeMillis())
                    .commit()
            } catch (_: Throwable) {
                // Crash diagnostics must never replace the original exception.
            }
            previous?.uncaughtException(thread, error)
        }
    }


    override fun onCreate() {
        super.onCreate()
        DebugStrictMode.enable()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        } else {
            val logsDir = File(filesDir, "logs")
            Timber.plant(CrashReportingTree(logsDir))
        }

        // Create all notification channels (idempotent, safe to call every launch)
        NotificationHelper.createChannels(this)
    }
}
