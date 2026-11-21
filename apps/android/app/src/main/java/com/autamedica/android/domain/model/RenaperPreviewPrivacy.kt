package com.autamedica.android.domain.model

/**
 * Defence-in-depth for RENAPER address previews.
 * Even if the server accidentally returns unredacted data, Android shows
 * no more than the first 3 letters per comma-separated address fragment.
 * All house numbers are masked. This must never become an edit field.
 */
object RenaperPreviewPrivacy {
    fun maskAddress(value: String?): String {
        if (value.isNullOrBlank()) return ""
        return value.trim().take(240).split(',').joinToString(",") { part ->
            var visibleLetters = 0
            buildString {
                part.forEach { char ->
                    if (char.isLetter() && visibleLetters < 3) {
                        append(char)
                        visibleLetters++
                    } else if (char.isLetterOrDigit()) {
                        append('*')
                    } else {
                        append(char)
                    }
                }
            }
        }
    }
}
