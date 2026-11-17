package com.autamedica.android

import android.app.Application
import com.autamedica.android.service.NotificationHelper
import com.autamedica.android.util.DebugStrictMode
import dagger.hilt.android.HiltAndroidApp
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroid
import timber.log.Timber
import java.io.File

@HiltAndroidApp
class AutamedicaApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        DebugStrictMode.enable()
        initializeSentry()

        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        } else {
            val logsDir = File(filesDir, "logs")
            Timber.plant(CrashReportingTree(logsDir))
        }

        // Create all notification channels (idempotent, safe to call every launch)
        NotificationHelper.createChannels(this)
    }

    private fun initializeSentry() {
        val dsn = BuildConfig.SENTRY_DSN.trim()
        if (dsn.isEmpty()) return

        try {
            SentryAndroid.init(this) { options ->
                options.dsn = dsn
                options.environment = if (BuildConfig.DEBUG) "android-development" else "android-production"
                options.isSendDefaultPii = false
                options.tracesSampleRate = if (BuildConfig.DEBUG) 1.0 else 0.05

                // Never attach screenshots or view hierarchies from clinical/payment screens.
                options.isAttachScreenshot = false
                options.isAttachViewHierarchy = false

                options.beforeSend = SentryOptions.BeforeSendCallback { event, _ ->
                    event.user = null
                    event.request?.let { request ->
                        request.data = null
                        request.url = request.url?.let { TelemetrySanitizer.clean(it) }
                        request.headers?.keys?.toList()?.forEach { header ->
                            if (header.equals("Authorization", ignoreCase = true) ||
                                header.equals("Cookie", ignoreCase = true) ||
                                header.equals("Set-Cookie", ignoreCase = true) ||
                                header.equals("X-Api-Key", ignoreCase = true) ||
                                header.equals("Api-Key", ignoreCase = true)
                            ) request.headers?.remove(header)
                        }
                    }

                    event.message?.let { message ->
                        message.message = TelemetrySanitizer.clean(message.message.orEmpty())
                    }
                    event.exceptions?.forEach { exception ->
                        exception.value = TelemetrySanitizer.clean(exception.value.orEmpty())
                    }
                    event
                }
            }
        } catch (_: Exception) {
            // A telemetry initialization error must never block app startup.
        }
    }
}
