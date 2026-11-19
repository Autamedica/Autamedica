package com.autamedica.android.presentation.common

/** Masks CPF/DNI in physician UI while preserving the domain value for search and backend operations. */
fun maskPatientDocument(value: String): String {
    val digits = value.filter(Char::isDigit)
    if (digits.length < 3) return "••••"
    val hiddenLength = (digits.length - 2).coerceAtLeast(4)
    return "•".repeat(hiddenLength) + digits.takeLast(2)
}
