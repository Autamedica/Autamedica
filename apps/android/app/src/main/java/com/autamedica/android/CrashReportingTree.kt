package com.autamedica.android

import timber.log.Timber
import com.google.firebase.crashlytics.FirebaseCrashlytics
import java.io.File
import java.io.FileWriter
import java.io.PrintWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Timber tree for release builds.
 * - Filters: only WARN, ERROR, and ASSERT reach this tree
 * - Persists ERROR/WTF to file (crash_log.txt) for post-mortem diagnosis
 * - Auto-rotates log file at 1MB to prevent unbounded growth
 * - Ready for Firebase Crashlytics: swap persistToFile() with
 *   FirebaseCrashlytics.getInstance().recordException()
 */
class CrashReportingTree(private val logsDir: File) : Timber.Tree() {

    private val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)
    private val logFile: File by lazy {
        logsDir.mkdirs()
        File(logsDir, "crash_log.txt")
    }

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
        persistToFile(level, tag, message, t)
    }

    private fun persistToFile(level: String, tag: String?, message: String, t: Throwable?) {
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

    private fun rotateIfNeeded() {
        if (logFile.exists() && logFile.length() > MAX_FILE_SIZE_BYTES) {
            val backup = File(logsDir, "crash_log.prev.txt")
            backup.delete()
            logFile.renameTo(backup)
        }
    }

    companion object {
        private const val WARN_PRIORITY = 5
        private const val ERROR_PRIORITY = 6
        private const val ASSERT_PRIORITY = 7
        private const val MAX_FILE_SIZE_BYTES = 1_048_576L // 1 MB
    }
}
