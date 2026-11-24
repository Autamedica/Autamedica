package com.autamedica.android.data.repository

import com.google.common.truth.Truth.assertThat
import io.github.jan.supabase.SupabaseClient
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

class DoctorOnboardingClientTest {

    private lateinit var server: MockWebServer

    @Before
    fun setup() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `validateDoctorOnboardingSubmission rejects PENDING license and requires BR UF`() {
        assertThrows(IllegalArgumentException::class.java) {
            validateDoctorOnboardingSubmission(
                DoctorOnboardingSubmission(
                    firstName = "Juan",
                    lastName = "Pérez",
                    careCountry = "AR",
                    licenseType = "MN",
                    licenseNumber = "PENDING-1234",
                    specialty = "Clínica",
                )
            )
        }

        assertThrows(IllegalArgumentException::class.java) {
            validateDoctorOnboardingSubmission(
                DoctorOnboardingSubmission(
                    firstName = "João",
                    lastName = "Silva",
                    careCountry = "BR",
                    licenseType = "CRM",
                    licenseNumber = "12345",
                    specialty = "Pediatria",
                    ufBrazil = "",
                )
            )
        }
    }

    @Test
    fun `buildDoctorProfilePayload omits active and maps BR fields cleanly`() {
        val normalized = validateDoctorOnboardingSubmission(
            DoctorOnboardingSubmission(
                firstName = " João ",
                lastName = " Silva ",
                phone = " +5511999999999 ",
                careCountry = "br",
                licenseType = "crm",
                licenseNumber = " 123456 ",
                specialty = " Cardiologia ",
                ufBrazil = "sp",
                cpf = "123.456.789-01",
            )
        )
        val payload = buildDoctorProfilePayload(normalized)

        assertThat(payload["active"]).isNull()
        assertThat(payload["care_country"]?.jsonPrimitive?.content).isEqualTo("BR")
        assertThat(payload["license_type"]?.jsonPrimitive?.content).isEqualTo("CRM")
        assertThat(payload["uf_brazil"]?.jsonPrimitive?.content).isEqualTo("SP")
        assertThat(payload["cpf"]?.jsonPrimitive?.content).isEqualTo("12345678901")
    }

    @Test
    fun `postOnboarding posts profile then onboarding-complete with bearer auth`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"success":true,"data":{"id":"doc-99"}}"""))
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"success":true,"data":null}"""))

        val client = DoctorOnboardingClient(
            supabaseClient = mockk<SupabaseClient>(relaxed = true),
            sharedHttp = OkHttpClient(),
            json = Json { ignoreUnknownKeys = true },
        )

        val doctorId = client.postOnboarding(
            origin = server.url("/").toString(),
            submission = DoctorOnboardingSubmission(
                firstName = "Lucía",
                lastName = "Fernández",
                careCountry = "AR",
                licenseType = "MN",
                licenseNumber = "98765",
                specialty = "Dermatología",
                enrollmentJurisdiction = "CABA",
            ),
            bearer = "test-jwt",
        )

        assertThat(doctorId).isEqualTo("doc-99")
        val firstReq = server.takeRequest()
        assertThat(firstReq.path).isEqualTo("/api/profiles/doctors")
        assertThat(firstReq.getHeader("Authorization")).isEqualTo("Bearer test-jwt")
        assertThat(firstReq.body.readUtf8()).doesNotContain("\"active\"")

        val secondReq = server.takeRequest()
        assertThat(secondReq.path).isEqualTo("/api/doctors/onboarding-complete")
        assertThat(secondReq.getHeader("Authorization")).isEqualTo("Bearer test-jwt")
    }
}
