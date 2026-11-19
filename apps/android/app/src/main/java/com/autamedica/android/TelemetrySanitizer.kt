package com.autamedica.android

/**
 * Keeps identifiers and credentials out of mobile crash telemetry.
 * Only apply this sanitizer to observability payloads, never to business data.
 */
internal object TelemetrySanitizer {
    private val patterns = listOf(
        Regex("(?i)(Bearer\\s+)[A-Za-z0-9._~+/-]+=*") to "Bearer [REDACTED]",
        Regex("(?i)((?:access_token|refresh_token|id_token|token_hash|api[-_]?key|secret[-_]?key|token|password)=)[^&\\s]+") to "$1[REDACTED]",
        Regex("(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}") to "[EMAIL]",
        Regex("(?<!\\d)(?:\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}|\\d{7,15})(?!\\d)") to "[IDENTIFIER]",
        Regex("https?://[^\\s\\\"'<>]+", RegexOption.IGNORE_CASE) to "[URL]",
    )

    fun clean(input: String, maxLength: Int = 500): String {
        var output = input.take(maxLength)
        patterns.forEach { (pattern, replacement) ->
            output = pattern.replace(output, replacement)
        }
        return output
    }

    fun safeTag(tag: String?): String =
        tag?.takeIf { it.matches(Regex("[A-Za-z0-9_.-]{1,80}")) } ?: "General"

    fun safeThrowable(throwable: Throwable, fallbackMessage: String): Exception {
        val type = throwable.javaClass.simpleName.ifBlank { "Exception" }
        val message = clean(throwable.message ?: fallbackMessage, 240)
        return Exception("$type: $message").apply {
            stackTrace = throwable.stackTrace
        }
    }
}
