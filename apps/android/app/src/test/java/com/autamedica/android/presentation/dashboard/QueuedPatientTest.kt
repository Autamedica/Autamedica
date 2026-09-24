package com.autamedica.android.presentation.dashboard

import com.autamedica.android.domain.model.PharmacyConsultationRequest
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class QueuedPatientTest {

    @Test
    fun `toQueuedPatient maps Manchester II urgency for chest pain`() {
        val request = PharmacyConsultationRequest(
            id = "req-1",
            patientName = "Marta Gómez, 52 años",
            patientDni = "28445123",
            patientPhone = "+5491144556677",
            pharmacyName = "Kiosco Express",
            reason = "Dolor torácico opresivo de 30 minutos y sudoración profusa",
            minutesWaiting = 2,
        )

        val queued = request.toQueuedPatient()

        assertThat(queued.name).isEqualTo("Marta Gómez")
        assertThat(queued.age).isEqualTo(52)
        assertThat(queued.triage).isEqualTo(TriageLevel.URGENCY)
        assertThat(queued.triageScale).contains("Manchester II")
        assertThat(queued.waitMinutes).isEqualTo(2)
        assertThat(queued.vitals).contains("Farmacia de Guardia")
    }

    @Test
    fun `toQueuedPatient maps Manchester III priority for hypertensive crisis and headache`() {
        val request = PharmacyConsultationRequest(
            id = "req-2",
            patientName = "Lucas Benítez (38 años)",
            patientDni = "33987654",
            patientPhone = "+5491122334455",
            pharmacyName = "Farmacia Central",
            reason = "Cefalea intensa y registro de crisis hipertensiva",
            minutesWaiting = 5,
        )

        val queued = request.toQueuedPatient()

        assertThat(queued.name).isEqualTo("Lucas Benítez")
        assertThat(queued.age).isEqualTo(38)
        assertThat(queued.triage).isEqualTo(TriageLevel.PRIORITY)
        assertThat(queued.triageScale).contains("Manchester III")
    }

    @Test
    fun `toQueuedPatient maps Manchester IV control for routine prescription renewal`() {
        val request = PharmacyConsultationRequest(
            id = "req-3",
            patientName = "Sofía Ramos",
            patientDni = "40112233",
            patientPhone = "+5491166778899",
            pharmacyName = "Farmacia Norte",
            reason = "Control y renovación de receta anticonceptiva",
            minutesWaiting = 10,
        )

        val queued = request.toQueuedPatient()

        assertThat(queued.name).isEqualTo("Sofía Ramos")
        assertThat(queued.age).isEqualTo(0)
        assertThat(queued.triage).isEqualTo(TriageLevel.CONTROL)
        assertThat(queued.triageScale).contains("Manchester IV")
    }

    @Test
    fun `cleanPatientName cleans trailing age patterns`() {
        assertThat(cleanPatientName("Juan Pérez, 45 años")).isEqualTo("Juan Pérez")
        assertThat(cleanPatientName("Juan Pérez (45)")).isEqualTo("Juan Pérez")
        assertThat(cleanPatientName("María López")).isEqualTo("María López")
    }

    @Test
    fun `cleanPatientName cleans email and formats Title Case`() {
        assertThat(cleanPatientName("jaqueline42marques@GMAIL.COM")).isEqualTo("Jaqueline Marques")
        assertThat(cleanPatientName("jaqueline.marques@gmail.com")).isEqualTo("Jaqueline Marques")
        assertThat(cleanPatientName("jaqueline_marques@gmail.com")).isEqualTo("Jaqueline Marques")
        assertThat(cleanPatientName("jaqueline42marques")).isEqualTo("Jaqueline Marques")
        assertThat(cleanPatientName("juan pérez")).isEqualTo("Juan Pérez")
        assertThat(cleanPatientName("JAQUELINE MARQUES")).isEqualTo("Jaqueline Marques")
    }

    @Test
    fun `User displayName cleans raw email and never returns raw email when cleanable`() {
        val userWithRawEmail = com.autamedica.android.domain.model.User(
            id = "user-1",
            email = "jaqueline42marques@GMAIL.COM",
            role = com.autamedica.android.domain.model.UserRole.PATIENT,
        )
        assertThat(userWithRawEmail.displayName).isEqualTo("Jaqueline Marques")

        val userWithEmailInFirstName = com.autamedica.android.domain.model.User(
            id = "user-2",
            email = "patient@autamedica.com",
            firstName = "jaqueline42marques@GMAIL.COM",
            role = com.autamedica.android.domain.model.UserRole.PATIENT,
        )
        assertThat(userWithEmailInFirstName.displayName).isEqualTo("Jaqueline Marques")
    }
}
