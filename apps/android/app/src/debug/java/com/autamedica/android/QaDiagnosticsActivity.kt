package com.autamedica.android

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.text.format.DateFormat
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.Date

/**
 * Separate, Hilt-free launch entry for debugging pre-login crashes in internal APK.
 * Never accesses authenticated sessions, crash messages, clinical data or networks.
 */
class QaDiagnosticsActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences("qa_crash_diagnostics", Context.MODE_PRIVATE)
        val last = prefs.getString("qa_last_crash", null)
        val whenMs = prefs.getLong("qa_crash_timestamp", 0L)
        val timestamp = if (whenMs > 0) {
            DateFormat.format("yyyy-MM-dd HH:mm:ss", Date(whenMs)).toString()
        } else {
            "No crash recorded"
        }
        val output = if (last == null) {
            "No Java/Kotlin fatal exception has been recorded yet.\n" +
                "If AutaMedica QA closes, reopen this separate Diagnostics icon.\n" +
                "Native crashes and operating-system kills may not appear here."
        } else {
            "Last QA crash: $timestamp\n\n$last\n\n" +
                "Only exception types and class/method names were stored. No messages or tokens."
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = (20 * resources.displayMetrics.density).toInt()
            setPadding(p, p, p, p)
        }

        val title = TextView(this).apply {
            text = "AutaMedica QA - Startup diagnostics"
            textSize = 20f
        }
        val content = TextView(this).apply {
            text = output
            textSize = 14f
            setTextIsSelectable(true)
        }
        val copy = Button(this).apply {
            text = "Copy diagnostic"
            isEnabled = last != null
            setOnClickListener {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("AutaMedica QA crash", output))
                text = "Copied"
            }
        }
        container.addView(title)
        container.addView(copy)
        container.addView(content)
        val scroll = ScrollView(this)
        scroll.addView(container, ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ))
        setContentView(scroll)
    }
}
