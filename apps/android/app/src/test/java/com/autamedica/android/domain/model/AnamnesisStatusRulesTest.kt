package com.autamedica.android.domain.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AnamnesisStatusRulesTest {

    @Test
    fun `read only states block editing`() {
        assertThat(
            isAnamnesisSummaryReadOnly(
                summary(status = ANAMNESIS_STATUS_COMPLETED)
            )
        ).isTrue()
        assertThat(
            isAnamnesisSummaryReadOnly(
                summary(status = ANAMNESIS_STATUS_UNDER_REVIEW)
            )
        ).isTrue()
        assertThat(
            isAnamnesisSummaryReadOnly(
                summary(status = ANAMNESIS_STATUS_APPROVED)
            )
        ).isTrue()
        assertThat(
            isAnamnesisSummaryReadOnly(
                summary(status = ANAMNESIS_STATUS_IN_PROGRESS, locked = true)
            )
        ).isTrue()
    }

    @Test
    fun `editable states remain writable`() {
        assertThat(isAnamnesisSummaryReadOnly(summary(status = ANAMNESIS_STATUS_DRAFT))).isFalse()
        assertThat(isAnamnesisSummaryReadOnly(summary(status = ANAMNESIS_STATUS_NOT_STARTED))).isFalse()
        assertThat(isAnamnesisSummaryReadOnly(summary(status = ANAMNESIS_STATUS_IN_PROGRESS))).isFalse()
    }

    @Test
    fun `display status distinguishes draft progress review and approval`() {
        assertThat(anamnesisDisplayStatus(summary(status = ANAMNESIS_STATUS_DRAFT))).isEqualTo("Borrador")
        assertThat(anamnesisDisplayStatus(summary(status = ANAMNESIS_STATUS_NOT_STARTED))).isEqualTo("Sin iniciar")
        assertThat(anamnesisDisplayStatus(summary(status = ANAMNESIS_STATUS_IN_PROGRESS))).isEqualTo("En progreso")
        assertThat(anamnesisDisplayStatus(summary(status = ANAMNESIS_STATUS_UNDER_REVIEW))).isEqualTo("En revision")
        assertThat(anamnesisDisplayStatus(summary(status = ANAMNESIS_STATUS_APPROVED))).isEqualTo("Aprobada")
    }

    @Test
    fun `derive editable status marks record completed only when all sections are done`() {
        assertThat(
            deriveEditableAnamnesisStatus(
                currentStatus = ANAMNESIS_STATUS_DRAFT,
                completedSections = 1,
                totalSections = 7,
            )
        ).isEqualTo(ANAMNESIS_STATUS_IN_PROGRESS)

        assertThat(
            deriveEditableAnamnesisStatus(
                currentStatus = ANAMNESIS_STATUS_IN_PROGRESS,
                completedSections = 7,
                totalSections = 7,
            )
        ).isEqualTo(ANAMNESIS_STATUS_COMPLETED)
    }

    private fun summary(
        status: String,
        locked: Boolean = false,
    ) = AnamnesisSummary(
        id = "anamnesis-1",
        status = status,
        completionPercentage = 50,
        locked = locked,
        updatedAt = "2026-03-06T10:00:00Z",
        completedSections = 3,
        totalSections = 7,
    )
}
