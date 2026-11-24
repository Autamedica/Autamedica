package com.autamedica.android.data.repository

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DoctorPatientResolutionTest {

    @Test
    fun `mergeDoctorPatientIds deduplicates across all sources preserving order`() {
        val doctorPatientIds = listOf("pat-1", "pat-2")
        val careTeamIds = listOf("pat-2", "pat-3")
        val appointmentIds = listOf(null, "", "   ", "pat-1", "pat-4", "pat-3")

        val merged = mergeDoctorPatientIds(doctorPatientIds, careTeamIds, appointmentIds)

        assertThat(merged).containsExactly("pat-1", "pat-2", "pat-3", "pat-4").inOrder()
    }

    @Test
    fun `mergeDoctorPatientIds handles empty and whitespace entries`() {
        val merged = mergeDoctorPatientIds(
            listOf(null, " "),
            emptyList(),
            listOf("  pat-9  ", "pat-9"),
        )

        assertThat(merged).containsExactly("pat-9")
    }
}
