package com.autamedica.android.presentation.videocall

import com.autamedica.android.domain.model.CallClinicalGuidanceBuilder
import com.autamedica.android.domain.model.PatientClinicalContext
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VideoCallUiStateClinicalHierarchyTest {

    @Test
    fun safetyAlertLabel_singleAllergy() {
        val state = VideoCallUiState(
            patientClinicalContext = PatientClinicalContext(
                hasAnamnesis = true,
                allergies = listOf("Penicilina"),
            ),
        )
        assertThat(state.safetyAlertLabel).isEqualTo("Penicilina")
        assertThat(state.allergyAlerts).containsExactly("Penicilina")
    }

    @Test
    fun safetyAlertLabel_multipleAllergies() {
        val state = VideoCallUiState(
            patientClinicalContext = PatientClinicalContext(
                hasAnamnesis = true,
                allergies = listOf("Penicilina", "AINE", "Látex"),
            ),
        )
        assertThat(state.safetyAlertLabel).isEqualTo("3 alergias")
    }

    @Test
    fun chiefComplaintPeek_prefersClinicalContextOverNotes() {
        val state = VideoCallUiState(
            appointmentNotes = "Nota de agenda",
            patientClinicalContext = PatientClinicalContext(
                hasAnamnesis = true,
                chiefComplaint = "Cefalea de 3 días",
            ),
        )
        assertThat(state.chiefComplaintPeek).isEqualTo("Cefalea de 3 días")
    }

    @Test
    fun chiefComplaintPeek_fallsBackToAppointmentNotes() {
        val state = VideoCallUiState(appointmentNotes = "Control de hipertensión")
        assertThat(state.chiefComplaintPeek).isEqualTo("Control de hipertensión")
    }

    @Test
    fun safetyAlertLabel_nullWhenNoAllergies() {
        val state = VideoCallUiState(
            patientClinicalContext = PatientClinicalContext(
                hasAnamnesis = true,
                chiefComplaint = "Chequeo",
            ),
        )
        assertThat(state.safetyAlertLabel).isNull()
    }

    @Test
    fun safetyAlertLabel_fallsBackToGuidanceRedFlag() {
        val guidance = CallClinicalGuidanceBuilder.fromLocalContext(
            context = PatientClinicalContext(
                hasAnamnesis = true,
                medications = "Warfarina",
            ),
            appointmentNotes = "Control",
            preconsultationReason = null,
        )
        val state = VideoCallUiState(clinicalGuidance = guidance)
        assertThat(state.safetyAlertLabel).isEqualTo("Medicación actual: Warfarina")
    }

    @Test
    fun clinicalGuidance_cefalea_prioritizesCriticalQuestionsAndAllergy() {
        val guidance = CallClinicalGuidanceBuilder.fromLocalContext(
            context = PatientClinicalContext(
                hasAnamnesis = true,
                chiefComplaint = "Cefalea de 3 días",
                allergies = listOf("Penicilina"),
            ),
            appointmentNotes = null,
            preconsultationReason = null,
        )
        assertThat(guidance.chiefComplaint).isEqualTo("Cefalea de 3 días")
        assertThat(guidance.redFlags).contains("Alergia: Penicilina")
        assertThat(guidance.suggestedQuestions.first().priority).isEqualTo("critical")
        assertThat(guidance.suggestedQuestions.first().question).contains("alergias")
        assertThat(guidance.suggestedQuestions.any { it.question.contains("peor de la vida") }).isTrue()
    }

    @Test
    fun clinicalGuidance_genericMotivo_stillSuggestsQuestions() {
        val guidance = CallClinicalGuidanceBuilder.fromLocalContext(
            context = null,
            appointmentNotes = "Dolor de rodilla",
            preconsultationReason = null,
        )
        assertThat(guidance.suggestedQuestions).isNotEmpty()
        assertThat(guidance.suggestedQuestions.any { it.question.contains("evolucionó") }).isTrue()
    }
}
