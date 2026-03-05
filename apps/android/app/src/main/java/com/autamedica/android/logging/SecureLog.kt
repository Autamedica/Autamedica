package com.autamedica.android.logging

import timber.log.Timber

private val bearerTokenRegex = Regex("Bearer\\s+[A-Za-z0-9._~+/=-]+", RegexOption.IGNORE_CASE)
private val authorizationHeaderRegex = Regex(
    "(Authorization\\s*=\\s*\\[)[^\\]]+(\\])",
    RegexOption.IGNORE_CASE,
)
private val apiKeyHeaderRegex = Regex("(apikey\\s*=\\s*\\[)[^\\]]+(\\])", RegexOption.IGNORE_CASE)
private val tokenQueryRegex = Regex("([?&](?:token|apikey|auth)=)[^&\\s]+", RegexOption.IGNORE_CASE)
private val uuidRegex = Regex(
    "\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b",
)

object SecureLog {
    fun sanitize(raw: String): String {
        var text = raw
        text = text.replace(bearerTokenRegex, "Bearer [REDACTED]")
        text = text.replace(authorizationHeaderRegex, "$1[REDACTED]$2")
        text = text.replace(apiKeyHeaderRegex, "$1[REDACTED]$2")
        text = text.replace(tokenQueryRegex, "$1[REDACTED]")
        text = text.replace(uuidRegex, "[REDACTED_ID]")
        return text
    }

    fun error(context: String, throwable: Throwable) {
        Timber.e("%s | %s", sanitize(context), safeThrowableMessage(throwable))
    }

    fun warn(context: String, throwable: Throwable) {
        Timber.w("%s | %s", sanitize(context), safeThrowableMessage(throwable))
    }

    fun debug(message: String) {
        Timber.d(sanitize(message))
    }

    fun info(message: String) {
        Timber.i(sanitize(message))
    }

    private fun safeThrowableMessage(throwable: Throwable): String {
        val type = throwable::class.simpleName ?: "Throwable"
        val message = throwable.message?.takeIf { it.isNotBlank() } ?: "No details"
        return "$type: ${sanitize(message)}"
    }
}
