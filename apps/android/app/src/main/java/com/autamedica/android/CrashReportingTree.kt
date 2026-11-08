package com.autamedica.android

import timber.log.Timber
import com.google.firebase.crashlytics.FirebaseCrashlytics

/**
 * Release Timber tree: WARN/ERROR/ASSERT are sent to Crashlytics.
 * No local plaintext log is created or retained.
 */
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
        reportToCrashlytics(level, tag, message, t)
    }

    private fun reportToCrashlytics(level: String, tag: String?, message: String, t: Throwable?) {
        try {
            val crashlytics = FirebaseCrashlytics.getInstance()
            crashlytics.log("[$level/${tag ?: "General"}]: $message")
            
            if (t != null) {
                crashlytics.recordException(t)
            } else if (level == "ERROR" || level == "WTF") {
                // If there's no throwable but it's an error, log a synthetic exception
                // to trigger a non-fatal report in the Crashlytics dashboard.
                val syntheticException = Exception(message)
                crashlytics.recordException(syntheticException)
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
