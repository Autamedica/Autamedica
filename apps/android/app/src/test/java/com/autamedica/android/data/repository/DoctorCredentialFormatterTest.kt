package com.autamedica.android.data.repository

import org.junit.Assert.assertEquals
import org.junit.Test

class DoctorCredentialFormatterTest {
    @Test fun brazilUsesCrmRatherThanInventingMn() {
        assertEquals("CRM-RS 12345", formatDoctorCredential("BR", "CRM", "12345", "RS"))
    }
    @Test fun argentinaIgnoresUnrelatedBrazilianState() {
        assertEquals("MN 12345", formatDoctorCredential("AR", "MN", "12345", "RS"))
    }
    @Test fun unknownMismatchedAndPendingCredentialsStayEmpty() {
        assertEquals("", formatDoctorCredential("BR", "MN", "12345", "RS"))
        assertEquals("", formatDoctorCredential("AR", "CRM", "12345", "RS"))
        assertEquals("", formatDoctorCredential("BR", "CRM", "12345", "XX"))
        assertEquals("", formatDoctorCredential("AR", "MN", "PENDING", null))
        assertEquals("", formatDoctorCredential(null, null, null, null))
    }
}
