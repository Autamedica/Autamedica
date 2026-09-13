package com.autamedica.android.presentation.patients

import com.autamedica.android.domain.model.PatientSummary
import java.time.OffsetDateTime

enum class PatientFilter { ALL, UPCOMING, RECENT }

data class PatientGroups(
    val upcoming: List<PatientSummary> = emptyList(),
    val attended: List<PatientSummary> = emptyList(),
) {
    val isEmpty: Boolean get() = upcoming.isEmpty() && attended.isEmpty()
    val totalSize: Int get() = upcoming.size + attended.size
}

object PatientListLogic {

    private const val RECENT_WINDOW_DAYS = 30L

    fun normalizeText(value: String): String = value
        .lowercase()
        .replace('á', 'a')
        .replace('é', 'e')
        .replace('í', 'i')
        .replace('ó', 'o')
        .replace('ú', 'u')
        .replace('ü', 'u')
        .replace('ñ', 'n')

    fun matchesQuery(patient: PatientSummary, query: String): Boolean {
        val normalized = normalizeText(query).trim()
        if (normalized.isEmpty()) return true
        val fullName = normalizeText("${patient.firstName} ${patient.lastName}")
        return fullName.contains(normalized)
    }

    fun buildResults(
        patients: List<PatientSummary>,
        query: String,
        filter: PatientFilter,
    ): PatientGroups {
        val visible = patients.filter { matchesQuery(it, query) }
        return when (filter) {
            PatientFilter.ALL -> groupAll(visible)
            PatientFilter.UPCOMING -> PatientGroups(upcoming = nextUpcoming(visible))
            PatientFilter.RECENT -> PatientGroups(attended = recentlyAttended(visible))
        }
    }

    fun upcomingCount(patients: List<PatientSummary>): Int =
        patients.count { it.nextAppointment != null }

    fun recentCount(patients: List<PatientSummary>): Int {
        val cutoff = OffsetDateTime.now().minusDays(RECENT_WINDOW_DAYS)
        return patients.count { p ->
            val last = parseDate(p.lastAppointment)
            last != null && !last.isBefore(cutoff)
        }
    }

    private fun groupAll(patients: List<PatientSummary>): PatientGroups {
        val upcoming = nextUpcoming(patients)
        val attended = patients
            .filter { it.nextAppointment == null }
            .sortedWith(attendedComparator())
        return PatientGroups(upcoming = upcoming, attended = attended)
    }

    private fun nextUpcoming(patients: List<PatientSummary>): List<PatientSummary> =
        patients
            .filter { it.nextAppointment != null }
            .sortedBy { parseDate(it.nextAppointment)?.toInstant() }

    private fun recentlyAttended(patients: List<PatientSummary>): List<PatientSummary> {
        val cutoff = OffsetDateTime.now().minusDays(RECENT_WINDOW_DAYS)
        return patients
            .filter { p ->
                val last = parseDate(p.lastAppointment)
                last != null && !last.isBefore(cutoff)
            }
            .sortedByDescending { parseDate(it.lastAppointment)?.toInstant() }
    }

    private fun attendedComparator(): Comparator<PatientSummary> {
        val byLastAppointment = Comparator<PatientSummary> { a, b ->
            val aTime = parseDate(a.lastAppointment)?.toInstant()
            val bTime = parseDate(b.lastAppointment)?.toInstant()
            when {
                aTime == null && bTime == null -> 0
                aTime == null -> 1
                bTime == null -> -1
                else -> bTime.compareTo(aTime)
            }
        }
        return byLastAppointment.thenComparator { a, b ->
            val aName = normalizeText("${a.lastName} ${a.firstName}")
            val bName = normalizeText("${b.lastName} ${b.firstName}")
            aName.compareTo(bName)
        }
    }

    private fun parseDate(value: String?): OffsetDateTime? = value?.let {
        try {
            OffsetDateTime.parse(it)
        } catch (_: Exception) {
            null
        }
    }
}