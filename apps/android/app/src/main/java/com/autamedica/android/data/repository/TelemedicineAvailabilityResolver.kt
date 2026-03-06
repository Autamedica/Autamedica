package com.autamedica.android.data.repository

import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate

internal data class LegacyCallReference(
    val id: String,
    val roomId: String,
    val status: String,
)

internal data class LiveSessionReference(
    val appointmentId: String?,
    val status: String,
)

private val activeLegacyCallStatuses = setOf(
    "requested",
    "ringing",
    "accepted",
    "connecting",
    "connected",
)

private val activeLiveSessionStatuses = setOf(
    "scheduled",
    "waiting",
    "in_progress",
)

internal fun extractMeetingIdentifier(meetingUrl: String?): String? {
    val trimmed = meetingUrl?.trim().orEmpty()
    if (trimmed.isEmpty()) return null

    return trimmed
        .substringAfterLast('/')
        .substringBefore('?')
        .substringBefore('#')
        .trim()
        .ifEmpty { null }
}

internal fun deriveJoinableAppointmentIds(
    appointments: List<Appointment>,
    legacyCalls: List<LegacyCallReference>,
    liveSessions: List<LiveSessionReference>,
): Set<String> {
    val activeLegacyIdentifiers = legacyCalls
        .filter { it.status.trim().lowercase() in activeLegacyCallStatuses }
        .flatMap { listOf(it.id, it.roomId) }
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .toSet()

    val activeLiveAppointmentIds = liveSessions
        .filter { it.status.trim().lowercase() in activeLiveSessionStatuses }
        .mapNotNull { it.appointmentId?.trim()?.takeIf(String::isNotEmpty) }
        .toSet()

    return appointments
        .asSequence()
        .filter { it.isTelemedicineJoinCandidate() }
        .filter { appointment ->
            appointment.id in activeLiveAppointmentIds ||
                extractMeetingIdentifier(appointment.meetingUrl) in activeLegacyIdentifiers
        }
        .map { it.id }
        .toSet()
}
