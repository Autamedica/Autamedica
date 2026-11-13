package com.autamedica.android.domain.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DoctorCredentialLabelTest {
    @Test fun brazilianDoctorShowsCrmAndUf() {
        assertThat(formatDoctorCredentialLabel("123456", "CRM", "BR", "RS"))
            .isEqualTo("CRM-RS 123456")
    }

    @Test fun argentinaShowsActualLicenseType() {
        assertThat(formatDoctorCredentialLabel("10101", "MN", "AR", null))
            .isEqualTo("MN 10101")
        assertThat(formatDoctorCredentialLabel("20202", "MP", "AR", null))
            .isEqualTo("MP 20202")
    }

    @Test fun countryMismatchOrMissingUfDoesNotMislabelDoctor() {
        assertThat(formatDoctorCredentialLabel("123", "MN", "BR", "RS")).isNull()
        assertThat(formatDoctorCredentialLabel("123", "CRM", "AR", "RS")).isNull()
        assertThat(formatDoctorCredentialLabel("123", "CRM", "BR", null)).isNull()
        assertThat(formatDoctorCredentialLabel("123", "CRM", "BR", "XX")).isNull()
        assertThat(formatDoctorCredentialLabel("123", "MN", null, null)).isNull()
    }

    @Test fun alreadyFormattedNumberIsNotDuplicated() {
        assertThat(formatDoctorCredentialLabel("CRM-RS 123", "CRM", "BR", "RS"))
            .isEqualTo("CRM-RS 123")
    }

    @Test fun emptyLicenseIsNotShown() {
        assertThat(formatDoctorCredentialLabel(" ", "MP", "AR", null)).isNull()
    }
}
