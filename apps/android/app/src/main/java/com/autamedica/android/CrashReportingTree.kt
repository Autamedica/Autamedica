package com.autamedica.android

import android.util.Log
import timber.log.Timber
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
        return priority >= Log.WARN
    }

    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        when (priority) {
            Log.WARN -> Log.w(tag, message)
            Log.ERROR -> {
                Log.e(tag, message, t)
                persistToFile("ERROR", tag, message, t)
            }
            Log.ASSERT -> {
                Log.wtf(tag, message, t)
                persistToFile("WTF", tag, message, t)
            }
        }
    }

    private fun persistToFile(level: String, tag: String?, message: String, t: Throwable?) {
        try {
            rotateIfNeeded()
            FileWriter(logFile, true).use { writer ->
                val timestamp = dateFormat.format(Date())
                writer.appendLine("[$timestamp] $level/$tag: $message")
                if (t != null) {
                    val pw = PrintWriter(writer)
                    t.printStackTrace(pw)
                    pw.flush()
                }
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
        private const val MAX_FILE_SIZE_BYTES = 1_048_576L // 1 MB
    }
}
