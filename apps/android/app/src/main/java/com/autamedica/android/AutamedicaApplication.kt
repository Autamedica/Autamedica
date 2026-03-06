package com.autamedica.android

import android.app.Application
import com.autamedica.android.service.NotificationHelper
import com.autamedica.android.util.DebugStrictMode
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import java.io.File

@HiltAndroidApp
class AutamedicaApplication : Application() {

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
