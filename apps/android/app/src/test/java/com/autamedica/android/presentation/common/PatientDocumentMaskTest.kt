package com.autamedica.android.presentation.common

import org.junit.Assert.assertEquals
import org.junit.Test

class PatientDocumentMaskTest {
    @Test fun cpfShowsOnlyLastTwoDigits() {
        assertEquals("•••••••••09", maskPatientDocument("123.456.789-09"))
    }
    @Test fun dniShowsOnlyLastTwoDigits() {
        assertEquals("••••••09", maskPatientDocument("30111209"))
    }
    @Test fun shortOrEmptyDocumentNeverLeaksItsValue() {
        assertEquals("••••", maskPatientDocument("12"))
        assertEquals("••••", maskPatientDocument(""))
    }
}
