package com.autamedica.android

import com.google.firebase.crashlytics.FirebaseCrashlytics
import io.sentry.Sentry
import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import timber.log.Timber

/**
 * Release Timber tree. Only sanitized telemetry is sent to Crashlytics/Sentry
 * or persisted locally. Telemetry failures never interrupt application flows.
 */
class CrashReportingTree(private val logsDir: File) : Timber.Tree() {

    private val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)
    private val logFile: File by lazy {
        logsDir.mkdirs()
        File(logsDir, "crash_log.txt")
    }

    override fun isLoggable(tag: String?, priority: Int): Boolean =
        priority >= WARN_PRIORITY

    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        val level = when (priority) {
            WARN_PRIORITY -> "WARN"
            ERROR_PRIORITY -> "ERROR"
            ASSERT_PRIORITY -> "WTF"
            else -> return
        }

        val safeTag = TelemetrySanitizer.safeTag(tag)
        val safeMessage = TelemetrySanitizer.clean(message)
        persistSanitizedLog(level, safeTag, safeMessage, t)

        try {
            val crashlytics = FirebaseCrashlytics.getInstance()
            crashlytics.log("[$level/$safeTag]: $safeMessage")
            if (t != null) {
                crashlytics.recordException(TelemetrySanitizer.safeThrowable(t, safeMessage))
            } else if (level == "ERROR" || level == "WTF") {
                crashlytics.recordException(Exception("$level/$safeTag: $safeMessage"))
            }
        } catch (_: Exception) {
            // Crash reporting must not affect application behavior.
        }

        try {
            if (t != null) {
                Sentry.captureException(TelemetrySanitizer.safeThrowable(t, safeMessage))
            } else if (level == "ERROR" || level == "WTF") {
                Sentry.captureException(Exception("$level/$safeTag: $safeMessage"))
            }
        } catch (_: Exception) {
            // Sentry is an optional telemetry sink, not a business dependency.
        }
    }

    private fun persistSanitizedLog(
        level: String,
        tag: String,
        message: String,
        throwable: Throwable?,
    ) {
        try {
            rotateIfNeeded()
            FileWriter(logFile, true).use { writer ->
                writer.append(dateFormat.format(Date()))
                    .append(" [").append(level).append("/")
                    .append(tag).append("]: ").append(message)
                    .append('\n')
                throwable?.stackTrace?.take(MAX_STACK_FRAMES)?.forEach { frame ->
                    writer.append("  at ")
                        .append(frame.className.take(160))
                        .append(".")
                        .append(frame.methodName.take(100))
                        .append("(")
                        .append(frame.fileName?.take(100) ?: "Unknown Source")
                        .append(":")
                        .append(frame.lineNumber.toString())
                        .append(")\n")
                }
            }
        } catch (_: Exception) {
            // Local diagnostic persistence must never crash the app.
        }
    }

    private fun rotateIfNeeded() {
        if (logFile.exists() && logFile.length() > MAX_FILE_SIZE_BYTES) {
            val backup = File(logsDir, "crash_log.prev.txt")
            if (backup.exists()) backup.delete()
            logFile.renameTo(backup)
        }
    }

    companion object {
        private const val WARN_PRIORITY = 5
        private const val ERROR_PRIORITY = 6
        private const val ASSERT_PRIORITY = 7
        private const val MAX_STACK_FRAMES = 24
        private const val MAX_FILE_SIZE_BYTES = 1_048_576L
    }
}
