package com.autamedica.android.data.repository

import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId

/**
 * Enforces fail-closed handling of scheduling windows. Callers must never turn a
 * backend error or malformed busy interval into an available appointment slot.
 *
 * Client checks are only advisory: the database must also enforce conflicts
 * atomically when appointments are written.
 */
internal object AppointmentScheduleGuard {

    fun parseRescheduleWindow(startText: String, endText: String): Pair<OffsetDateTime, OffsetDateTime> {
        val start = runCatching { OffsetDateTime.parse(startText) }
            .getOrElse { throw IllegalArgumentException("start_time is invalid", it) }
        val end = runCatching { OffsetDateTime.parse(endText) }
            .getOrElse { throw IllegalArgumentException("end_time is invalid", it) }

        require(end.isAfter(start)) { "La hora de finalización debe ser posterior al inicio" }
        return start to end
    }

    fun hasConflict(
        proposedStart: OffsetDateTime,
        proposedEnd: OffsetDateTime,
        busyIntervals: List<Pair<String, String>>,
    ): Boolean {
        require(proposedEnd.isAfter(proposedStart)) { "Invalid proposed appointment interval" }
        return busyIntervals.any { (startText, endText) ->
            val (busyStart, busyEnd) = parseBusyRange(startText, endText)
            proposedStart.isBefore(busyEnd) && proposedEnd.isAfter(busyStart)
        }
    }

    fun bookedLocalTimes(
        busyIntervals: List<Pair<String, String>>,
        zone: ZoneId,
    ): List<Pair<LocalTime, LocalTime>> =
        busyIntervals.map { (startText, endText) ->
            val (busyStart, busyEnd) = parseBusyRange(startText, endText)
            busyStart.atZoneSameInstant(zone).toLocalTime() to
                busyEnd.atZoneSameInstant(zone).toLocalTime()
        }

    private fun parseBusyRange(startText: String, endText: String): Pair<OffsetDateTime, OffsetDateTime> {
        val start = runCatching { OffsetDateTime.parse(startText) }
            .getOrElse { throw IllegalStateException("El servicio devolvió un horario ocupado inválido", it) }
        val end = runCatching { OffsetDateTime.parse(endText) }
            .getOrElse { throw IllegalStateException("El servicio devolvió un horario ocupado inválido", it) }

        check(end.isAfter(start)) { "El servicio devolvió un intervalo ocupado inválido" }
        return start to end
    }
}
