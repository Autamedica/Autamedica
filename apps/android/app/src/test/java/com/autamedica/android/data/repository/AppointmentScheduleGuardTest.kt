package com.autamedica.android.data.repository

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.OffsetDateTime
import java.time.ZoneId

class AppointmentScheduleGuardTest {

    private fun mustFail(block: () -> Unit) {
        var failed = false
        try {
            block()
        } catch (_: IllegalArgumentException) {
            failed = true
        } catch (_: IllegalStateException) {
            failed = true
        }
        assertThat(failed).isTrue()
    }

    @Test
    fun validRescheduleWindowIsAccepted() {
        val (start, end) = AppointmentScheduleGuard.parseRescheduleWindow(
            "2026-11-01T10:00:00Z", "2026-11-01T10:30:00Z",
        )
        assertThat(end.isAfter(start)).isTrue()
    }

    @Test
    fun invalidOrReversedRescheduleWindowIsRejected() {
        mustFail {
            AppointmentScheduleGuard.parseRescheduleWindow("2026-11-01T10:00:00Z", "bad-date")
        }
        mustFail {
            AppointmentScheduleGuard.parseRescheduleWindow(
                "2026-11-01T10:30:00Z", "2026-11-01T10:00:00Z",
            )
        }
    }

    @Test
    fun overlappingOccupiedIntervalBlocksReschedule() {
        val start = OffsetDateTime.parse("2026-11-01T10:30:00Z")
        val end = OffsetDateTime.parse("2026-11-01T11:00:00Z")
        val busy = listOf("2026-11-01T10:00:00Z" to "2026-11-01T11:00:00Z")
        assertThat(AppointmentScheduleGuard.hasConflict(start, end, busy)).isTrue()
    }

    @Test
    fun AdjacentIntervalDoesNotConflict() {
        val start = OffsetDateTime.parse("2026-11-01T11:00:00Z")
        val end = OffsetDateTime.parse("2026-11-01T11:30:00Z")
        val busy = listOf("2026-11-01T10:00:00Z" to "2026-11-01T11:00:00Z")
        assertThat(AppointmentScheduleGuard.hasConflict(start, end, busy)).isFalse()
    }

    @Test
    fun malformedOrBackwardsBusyIntervalsFailClosed() {
        val start = OffsetDateTime.parse("2026-11-01T11:00:00Z")
        val end = OffsetDateTime.parse("2026-11-01T11:30:00Z")
        mustFail {
            AppointmentScheduleGuard.hasConflict(start, end, listOf("invalid" to "2026-11-01T11:00:00Z"))
        }
        mustFail {
            AppointmentScheduleGuard.hasConflict(
                start, end,
                listOf("2026-11-01T12:00:00Z" to "2026-11-01T11:00:00Z"),
            )
        }
    }

    @Test
    fun malformedAvailabilityBusyIntervalsFailClosed() {
        mustFail {
            AppointmentScheduleGuard.bookedLocalTimes(
                listOf("invalid" to "2026-11-01T11:00:00Z"),
                ZoneId.of("America/Argentina/Buenos_Aires"),
            )
        }
    }

    @Test
    fun occupiedIntervalsUseArgentinaTimezone() {
        val ranges = AppointmentScheduleGuard.bookedLocalTimes(
            listOf("2026-11-01T10:00:00Z" to "2026-11-01T11:00:00Z"),
            ZoneId.of("America/Argentina/Buenos_Aires"),
        )
        assertThat(ranges.single().first.hour).isEqualTo(7)
        assertThat(ranges.single().second.hour).isEqualTo(8)
    }
}
