package com.autamedica.android.presentation.pharmacy

/**
 * A rank or wait estimate may only be displayed if authoritative server
 * data confirms it. Dispatch status and on-duty doctor count prove neither.
 */
internal fun queuePositionLabel(confirmedPosition: Int): String =
    if (confirmedPosition > 0) "#$confirmedPosition" else "Por confirmar"

internal fun waitingTimeLabel(confirmedMinutes: Int): String =
    if (confirmedMinutes > 0) "~$confirmedMinutes min" else "Sin estimación"
