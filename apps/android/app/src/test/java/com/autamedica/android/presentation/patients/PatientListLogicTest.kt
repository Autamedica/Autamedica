package com.autamedica.android.presentation.patients

import com.autamedica.android.domain.model.PatientSummary
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

class PatientListLogicTest {

    private fun patient(
        id: String,
        first: String,
        last: String,
        next: String? = null,
        prev: String? = null,
        appointments: Int = 0,
    ) = PatientSummary(
        id = id,
        userId = "$id-user",
        firstName = first,
        lastName = last,
        lastAppointment = prev,
        nextAppointment = next,
        appointmentCount = appointments,
    )

    private fun isoDate(dt: OffsetDateTime): String =
        dt.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

    private val tomorrow = OffsetDateTime.now().plusDays(1)
    private val inThreeDays = OffsetDateTime.now().plusDays(3)
    private val justAttended = OffsetDateTime.now().minusHours(2)
    private val attendedTwentyDaysAgo = OffsetDateTime.now().minusDays(20)
    private val attendedSixtyDaysAgo = OffsetDateTime.now().minusDays(60)

    @Test
    fun `groupAll splits upcoming first sorted by nearest next appointment`() {
        val patients = listOf(
            patient("a", "Ana", "Lopez", next = isoDate(inThreeDays), prev = isoDate(attendedTwentyDaysAgo)),
            patient("b", "Bruno", "Perez", next = isoDate(tomorrow)),
            patient("c", "Carla", "Diaz"),
        )

        val groups = PatientListLogic.buildResults(patients, query = "", filter = PatientFilter.ALL)

        assertThat(groups.upcoming.map { it.id }).containsExactly("b", "a").inOrder()
        assertThat(groups.attended.map { it.id }).containsExactly("c")
    }

    @Test
    fun `groupAll attended sorts by last appointment desc and no-date patients alphabetical last`() {
        val patients = listOf(
            patient("a", "Bruno", "Perez", prev = isoDate(attendedTwentyDaysAgo)),
            patient("b", "Carla", "Diaz", prev = isoDate(justAttended)),
            patient("c", "Ana", "Lopez"),
            patient("d", "Diego", "Sosa"),
        )

        val groups = PatientListLogic.buildResults(patients, query = "", filter = PatientFilter.ALL)

        assertThat(groups.attended.map { it.id }).containsExactly("b", "a", "c", "d").inOrder()
    }

    @Test
    fun `upcoming filter keeps only patients with next appointment`() {
        val patients = listOf(
            patient("a", "Ana", "Lopez", next = isoDate(tomorrow)),
            patient("b", "Bruno", "Perez", prev = isoDate(justAttended)),
        )

        val groups = PatientListLogic.buildResults(patients, query = "", filter = PatientFilter.UPCOMING)

        assertThat(groups.upcoming.map { it.id }).containsExactly("a")
        assertThat(groups.attended).isEmpty()
    }

    @Test
    fun `recent filter keeps only patients attended within the last 30 days`() {
        val patients = listOf(
            patient("a", "Ana", "Lopez", prev = isoDate(justAttended)),
            patient("b", "Bruno", "Perez", prev = isoDate(attendedTwentyDaysAgo)),
            patient("c", "Carla", "Diaz", prev = isoDate(attendedSixtyDaysAgo)),
        )

        val groups = PatientListLogic.buildResults(patients, query = "", filter = PatientFilter.RECENT)

        assertThat(groups.attended.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(groups.upcoming).isEmpty()
    }

    @Test
    fun `search matches full name ignoring case and accents`() {
        val gonzalez = patient("a", "María", "González")

        assertThat(PatientListLogic.matchesQuery(gonzalez, "gonzalez")).isTrue()
        assertThat(PatientListLogic.matchesQuery(gonzalez, "MARIA")).isTrue()
        assertThat(PatientListLogic.matchesQuery(gonzalez, "maria gonzalez")).isTrue()
        assertThat(PatientListLogic.matchesQuery(gonzalez, "lopez")).isFalse()
    }

    @Test
    fun `empty query matches everything`() {
        val p = patient("a", "Ana", "Lopez")
        assertThat(PatientListLogic.matchesQuery(p, "")).isTrue()
        assertThat(PatientListLogic.matchesQuery(p, "   ")).isTrue()
    }

    @Test
    fun `buildResults combines search and filter`() {
        val patients = listOf(
            patient("a", "María", "González", next = isoDate(tomorrow)),
            patient("b", "Bruno", "Perez", prev = isoDate(attendedTwentyDaysAgo)),
            patient("c", "Mario", "Gutierrez", prev = isoDate(justAttended)),
        )

        val groups = PatientListLogic.buildResults(patients, query = "mar", filter = PatientFilter.ALL)

        assertThat(groups.upcoming.map { it.id }).containsExactly("a")
        assertThat(groups.attended.map { it.id }).containsExactly("c")
    }

    @Test
    fun `upcomingCount counts patients with next appointment`() {
        val patients = listOf(
            patient("a", "Ana", "Lopez", next = isoDate(tomorrow)),
            patient("b", "Bruno", "Perez"),
        )
        assertThat(PatientListLogic.upcomingCount(patients)).isEqualTo(1)
    }

    @Test
    fun `recentCount counts only appointments within the window`() {
        val patients = listOf(
            patient("a", "Ana", "Lopez", prev = isoDate(justAttended)),
            patient("b", "Bruno", "Perez", prev = isoDate(attendedSixtyDaysAgo)),
            patient("c", "Carla", "Diaz"),
        )
        assertThat(PatientListLogic.recentCount(patients)).isEqualTo(1)
    }
}