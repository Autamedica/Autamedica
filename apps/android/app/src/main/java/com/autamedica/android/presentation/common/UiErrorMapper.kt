package com.autamedica.android.presentation.common

import com.autamedica.android.logging.SecureLog

object UiErrorMapper {

    private const val MAX_LENGTH = 200

    fun map(throwable: Throwable?, fallback: String): String {
        val raw = throwable?.message?.takeIf { it.isNotBlank() } ?: return fallback
        val message = extractBusinessMessage(raw)
        val sanitized = SecureLog.sanitize(message)
        return sanitized
            .trim()
            .take(MAX_LENGTH)
            .ifBlank { fallback }
    }

    private fun extractBusinessMessage(raw: String): String {
        val noRequestDump = raw
            .substringBefore("\nURL:")
            .substringBefore("\nHeaders:")
            .substringBefore("\nHttp Method:")
            .trim()
        return noRequestDump.ifBlank { raw }
    }
}