package com.autamedica.android

import android.util.Log
import timber.log.Timber

/**
 * Timber tree for release builds. Logs only warnings and errors,
 * and captures uncaught exceptions to logcat for post-mortem analysis.
 *
 * Drop-in replacement ready for Firebase Crashlytics: swap Log.e() calls
 * with FirebaseCrashlytics.getInstance().recordException().
 */
class CrashReportingTree : Timber.Tree() {

    override fun isLoggable(tag: String?, priority: Int): Boolean {
        return priority >= Log.WARN
    }

    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        when (priority) {
            Log.WARN -> Log.w(tag, message)
            Log.ERROR -> {
                Log.e(tag, message, t)
                // Future: FirebaseCrashlytics.getInstance().recordException(t ?: Exception(message))
            }
            Log.ASSERT -> {
                Log.wtf(tag, message, t)
            }
        }
    }
}
