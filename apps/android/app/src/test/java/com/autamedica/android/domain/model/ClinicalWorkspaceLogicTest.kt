package com.autamedica.android.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ClinicalWorkspaceLogicTest {

    @Test
    fun `computeVitalAlerts flags hypertensive crisis, hypoxemia, fever and severe pain`() {
        val alerts = ClinicalWorkspaceLogic.computeVitalAlerts(
            VitalSignEntry(
                id = "v1",
                patientId = "p1",
                bloodPressureSystolic = 185,
                bloodPressureDiastolic = 122,
                heartRate = 128,
                oxygenSaturation = 88,
                temperature = 39.2,
                painScale = 9,
            ),
        )
        assertEquals(
            listOf("bp_crisis", "hr_critical", "spo2_critical", "temp_high_fever", "pain_severe"),
            alerts.map { it.code },
        )
        assertTrue(alerts.all { it.severity == VitalAlertSeverity.CRITICAL })
    }

    @Test
    fun `computeRenewalStatus classifies active, expiring soon, expired and cancelled`() {
        assertEquals(RenewalStatus.ACTIVE, ClinicalWorkspaceLogic.computeRenewalStatus("active", 15))
        assertEquals(RenewalStatus.EXPIRING_SOON, ClinicalWorkspaceLogic.computeRenewalStatus("active", 5))
        assertEquals(RenewalStatus.EXPIRED, ClinicalWorkspaceLogic.computeRenewalStatus("active", -2))
        assertEquals(RenewalStatus.CANCELLED, ClinicalWorkspaceLogic.computeRenewalStatus("cancelled", -2))
    }

    @Test
    fun `localizeGender and localizeSpecialty translate Spanish labels for Portuguese runtime`() {
        assertEquals("Masculino", ClinicalWorkspaceLogic.localizeGender("male", isPortuguese = true))
        assertEquals("Feminino", ClinicalWorkspaceLogic.localizeGender("female", isPortuguese = true))
        assertEquals("Femenino", ClinicalWorkspaceLogic.localizeGender("female", isPortuguese = false))
        assertEquals("Clínica Geral", ClinicalWorkspaceLogic.localizeSpecialty("Medicina General", isPortuguese = true))
        assertEquals("Medicina General", ClinicalWorkspaceLogic.localizeSpecialty("Medicina General", isPortuguese = false))
    }
}
