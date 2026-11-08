package com.autamedica.android

import timber.log.Timber
import com.google.firebase.crashlytics.FirebaseCrashlytics

class CrashReportingTree : Timber.Tree() {

    override fun isLoggable(tag: String?, priority: Int): Boolean {
        return priority >= WARN_PRIORITY
    }

    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        val level = when (priority) {
            WARN_PRIORITY -> "WARN"
            ERROR_PRIORITY -> "ERROR"
            ASSERT_PRIORITY -> "WTF"
            else -> return
        }
        try {
            val crashlytics = FirebaseCrashlytics.getInstance()
            crashlytics.log("[$level/${tag ?: "General"}]: $message")

            if (t != null) {
                crashlytics.recordException(t)
            } else if (level == "ERROR" || level == "WTF") {
                crashlytics.recordException(Exception(message))
            }
        } catch (_: Exception) {
            // Logging must never crash the app
        }
    }

    companion object {
        private const val WARN_PRIORITY = 5
        private const val ERROR_PRIORITY = 6
        private const val ASSERT_PRIORITY = 7
    }
}
