package com.autamedica.android.data.repository

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MedicalChatIdentityTest {
    @Test fun conversationsUseTheResolvedSpecialistId() {
        assertThat(MedicalChatQueryFilter.forChats("doctor", null, "specialist-row-id"))
            .isEqualTo(MedicalChatRecordFilter("specialist_id", "specialist-row-id"))
    }
    @Test fun unreadCountsUseTheResolvedSpecialistId() {
        assertThat(MedicalChatQueryFilter.forUnreadCount("doctor", null, "specialist-row-id"))
            .isEqualTo(MedicalChatRecordFilter("specialist_id", "specialist-row-id"))
    }
    @Test fun missingSpecialistProducesNoDoctorChatQuery() {
        assertThat(MedicalChatQueryFilter.forChats("doctor", null, null)).isNull()
        assertThat(MedicalChatQueryFilter.forUnreadCount("doctor", null, null)).isNull()
    }
    @Test fun patientQueriesStillUsePatientId() {
        assertThat(MedicalChatQueryFilter.forChats("patient", "patient-row-id", null))
            .isEqualTo(MedicalChatRecordFilter("patient_id", "patient-row-id"))
    }
}
