package com.autamedica.android.domain.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RenaperLookupPolicyTest {
    @Test fun onlyArgentinePatientWithRegisteredDniIsEligible() {
        val patient = PatientProfileSnapshot(careCountry = "AR", dni = "12.345.678", gender = "female")
        assertThat(RenaperLookupPolicy.registeredArgentineDni(patient)).isEqualTo("12345678")
        assertThat(RenaperLookupPolicy.canQuery(patient, RenaperSexId.FEMALE)).isTrue()
        assertThat(RenaperLookupPolicy.maskedDni(patient)).isEqualTo("***678")
    }

    @Test fun brazilAndUnknownJurisdictionCannotQuery() {
        assertThat(RenaperLookupPolicy.registeredArgentineDni(
            PatientProfileSnapshot(careCountry = "BR", dni = "12345678", gender = "female"),
        )).isNull()
        assertThat(RenaperLookupPolicy.canQuery(
            PatientProfileSnapshot(careCountry = null, dni = "12345678", gender = "female"),
            RenaperSexId.FEMALE,
        )).isFalse()
    }

    @Test fun emptyOrMalformedDniIsRejected() {
        for (dni in listOf(null, "", "123", "1234567890123", "ab123456", "12/345678")) {
            assertThat(RenaperLookupPolicy.canQuery(
                PatientProfileSnapshot(careCountry = "AR", dni = dni, gender = "male"),
                RenaperSexId.MALE,
            )).isFalse()
        }
    }

    @Test fun officialSexMustMatchRegisteredPatientSex() {
        val patient = PatientProfileSnapshot(careCountry = "AR", dni = "12345678", gender = "male")
        assertThat(RenaperLookupPolicy.canQuery(patient, RenaperSexId.MALE)).isTrue()
        assertThat(RenaperLookupPolicy.canQuery(patient, RenaperSexId.FEMALE)).isFalse()
        assertThat(RenaperLookupPolicy.canQuery(patient, RenaperSexId.OTHER)).isFalse()
    }

    @Test fun missingRegisteredSexIsRejected() {
        assertThat(RenaperLookupPolicy.canQuery(
            PatientProfileSnapshot(careCountry = "AR", dni = "12345678", gender = null),
            RenaperSexId.FEMALE,
        )).isFalse()
    }
}
