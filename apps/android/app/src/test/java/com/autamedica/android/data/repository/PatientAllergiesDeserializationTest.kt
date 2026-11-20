package com.autamedica.android.data.repository

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class PatientAllergiesDeserializationTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun decode(value: String): String? {
        val patient = json.decodeFromString<PatientFullDto>("""{"id":"patient-1","allergies":$value}""")
        return normalizePatientAllergies(patient.allergies)
    }

    @Test fun decodesArrayOfStrings() {
        assertThat(decode("""["Penicilina","Dipirona"]""")).isEqualTo("Penicilina, Dipirona")
    }
    @Test fun decodesArrayOfObjects() {
        assertThat(decode("""[{"name":"Latex"}]""")).isEqualTo("Latex")
    }
    @Test fun decodesLegacyPrimitiveString() {
        assertThat(decode(""""Ninguna"""")).isEqualTo("Ninguna")
    }
    @Test fun emptyArrayNormalizesToNull() { assertThat(decode("[]")).isNull() }
    @Test fun jsonNullNormalizesToNull() { assertThat(decode("null")).isNull() }
}
