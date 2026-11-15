package com.autamedica.android.data.repository

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

class MemedMobileLaunchUrlTest {
    private val appointment = "12345678-abcd-4d91-8a1f-1234567890ab"
    private val allowed = "https://doctor.autamedica.com/doctors/prescriptions/memed-mobile?appointmentId=$appointment"

    @Test fun acceptsOnlyCanonicalPortalUrlAndMatchingAppointment() {
        assertEquals(allowed, MemedMobileLaunchUrl.validate(allowed, appointment))
        assertTrue(MemedMobileLaunchUrl.isUuid(appointment))
        assertFalse(MemedMobileLaunchUrl.isUuid("../admin"))
    }

    @Test fun blocksUrlTamperingAndCredentialLeakage() {
        val bad = listOf(
            allowed + "&patientId=123",
            allowed + "#access_token=secret",
            allowed.replace("doctor.autamedica.com", "evil.example"),
            allowed.replace("https:", "http:"),
            allowed.replace("https://", "https://attacker@"),
            allowed.replace("appointmentId=", "jwt="),
            allowed.replace(appointment, "00000000-aaaa-4d91-8a1f-000000000000"),
        )
        for (url in bad) {
            assertThrows(IllegalArgumentException::class.java) {
                MemedMobileLaunchUrl.validate(url, appointment)
            }
        }
    }
}
