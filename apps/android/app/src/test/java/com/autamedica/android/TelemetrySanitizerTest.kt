package com.autamedica.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TelemetrySanitizerTest {

    @Test
    fun redactsCpfDniEmailAndCredentials() {
        val input = "CPF 52998224725 DNI 12345678 test@example.com Bearer synthetic-token access_token=synthetic-secret"
        val clean = TelemetrySanitizer.clean(input)

        assertFalse(clean.contains("52998224725"))
        assertFalse(clean.contains("12345678"))
        assertFalse(clean.contains("test@example.com"))
        assertFalse(clean.contains("synthetic-token"))
        assertFalse(clean.contains("synthetic-secret"))
        assertTrue(clean.contains("[IDENTIFIER]"))
        assertTrue(clean.contains("[EMAIL]"))
        assertTrue(clean.contains("[REDACTED]"))
    }

    @Test
    fun redactsUrlsAndPreservesSafeDiagnosticText() {
        val clean = TelemetrySanitizer.clean("Network timeout while calling https://api.example.test/patient/12345678")
        assertFalse(clean.contains("https://"))
        assertFalse(clean.contains("12345678"))
        assertTrue(clean.contains("Network timeout while calling"))
    }

    @Test
    fun safeThrowablePreservesStackWithoutKeepingCauseOrRawMessage() {
        val original = IllegalStateException("Patient 52998224725 failed")
        val safe = TelemetrySanitizer.safeThrowable(original, "fallback")

        assertTrue(safe.message!!.contains("[IDENTIFIER]"))
        assertFalse(safe.message!!.contains("52998224725"))
        assertEquals(null, safe.cause)
        assertEquals(original.stackTrace.toList(), safe.stackTrace.toList())
    }
}
