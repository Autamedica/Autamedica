package com.autamedica.android.domain.model

fun formatCleanNameFromEmail(email: String?): String {
    if (email.isNullOrBlank()) return ""
    val prefix = email.substringBefore('@').trim()
    if (prefix.isBlank()) return ""

    val separatedCamelCase = prefix.replace(Regex("""(?<=\p{Ll})(?=\p{Lu})"""), " ")
    val cleanedChars = separatedCamelCase.replace(Regex("""[^\p{L}]+"""), " ")

    val words = cleanedChars
        .split(Regex("""\s+"""))
        .filter { it.isNotBlank() }

    if (words.isEmpty()) {
        return prefix
    }

    return words.joinToString(" ") { word ->
        word.lowercase().replaceFirstChar { char ->
            if (char.isLowerCase()) char.titlecase() else char.toString()
        }
    }
}

fun formatCleanName(raw: String?): String {
    if (raw.isNullOrBlank()) return ""
    if (raw.contains("@")) {
        return formatCleanNameFromEmail(raw)
    }

    val withoutAge = raw
        .replace(Regex(""",\s*\d{1,2}\s*(?:años|a\b|\))?""", RegexOption.IGNORE_CASE), "")
        .replace(Regex("""\(\s*\d{1,2}\s*(?:años|a\b)?\s*\)""", RegexOption.IGNORE_CASE), "")
        .trim()

    if (withoutAge.isBlank()) return ""

    val cleanedText = if (withoutAge.any { it.isDigit() }) {
        withoutAge
            .replace(Regex("""(?<=\p{Ll})(?=\p{Lu})"""), " ")
            .replace(Regex("""[^\p{L}]+"""), " ")
    } else {
        withoutAge.replace(Regex("""[^\p{L}\s\-']"""), " ")
    }

    val words = cleanedText
        .split(Regex("""\s+"""))
        .filter { it.isNotBlank() }

    if (words.isEmpty()) {
        return withoutAge
    }

    return words.joinToString(" ") { word ->
        word.lowercase().replaceFirstChar { char ->
            if (char.isLowerCase()) char.titlecase() else char.toString()
        }
    }
}

data class User(
    val id: String,
    val email: String,
    val role: UserRole,
    val firstName: String = "",
    val lastName: String = "",
    val phone: String? = null,
    val avatarUrl: String? = null,
) {
    val displayName: String
        get() {
            val combined = listOf(firstName, lastName)
                .filter { it.isNotBlank() }
                .joinToString(" ")
            return when {
                combined.isNotBlank() && !combined.contains("@") -> formatCleanName(combined)
                combined.contains("@") -> formatCleanNameFromEmail(combined)
                email.isNotBlank() -> {
                    val cleanFromEmail = formatCleanNameFromEmail(email)
                    if (cleanFromEmail.isNotBlank()) cleanFromEmail else email
                }
                else -> ""
            }
        }
}

