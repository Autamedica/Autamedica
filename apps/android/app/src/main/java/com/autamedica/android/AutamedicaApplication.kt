package com.autamedica.android

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import java.io.File

@HiltAndroidApp
class AutamedicaApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        } else {
            val logsDir = File(filesDir, "logs")
            Timber.plant(CrashReportingTree(logsDir))
        }
    }
}
