package com.autamedica.android.presentation.patients

import java.util.Locale

/** Stable visual suffix derived from the existing patient row ID; it never changes or merges records. */
internal fun patientReferenceSuffix(patientId: String): String =
    patientId.filter(Char::isLetterOrDigit).takeLast(4).uppercase(Locale.ROOT)
