package com.autamedica.android.data.repository

import com.autamedica.android.domain.model.RenaperLookupException
import com.autamedica.android.domain.model.RenaperSexId
import com.google.common.truth.Truth.assertThat
import io.github.jan.supabase.SupabaseClient
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Test

class RenaperIdentityClientTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun sexIdsMatchExistingArgentinaWebContract() {
        assertThat(RenaperSexId.FEMALE.providerId).isEqualTo(1)
        assertThat(RenaperSexId.MALE.providerId).isEqualTo(2)
        assertThat(RenaperSexId.OTHER.providerId).isEqualTo(3)
    }

    @Test fun parsePartialResponsePreservesProviderMaskingAndIdentityStatus() {
        val result = parseRenaperResponse(
            """{"success":true,"data":{"source":"RENAPER","hasPaid":false,"identityStatus":"verified_renaper","checkedAt":"2026-11-21T02:00:00Z","form":{"firstName":"M****","lastName":"R*****","birthDate":"****-**-**","gender":"female"},"coverage":{"name":"Obra***"}}}""",
            json,
        )
        assertThat(result.hasPaid).isFalse()
        assertThat(result.identityStatus).isEqualTo("verified_renaper")
        assertThat(result.firstName).isEqualTo("M****")
        assertThat(result.birthDate).contains("*")
        assertThat(result.coverageName).contains("*")
    }

    @Test fun rejectSuccessPayloadWithoutRenaperProvenance() {
        val result = runCatching {
            parseRenaperResponse(
                """{"success":true,"data":{"hasPaid":true,"form":{"firstName":"FAKE"}}}""",
                json,
            )
        }
        assertThat(result.exceptionOrNull()).isInstanceOf(RenaperLookupException::class.java)
    }

    @Test fun unpaidLookupCannotDiscloseUnmaskedServerName() {
        val result = parseRenaperResponse(
            """{"success":true,"data":{"source":"RENAPER","hasPaid":false,"identityStatus":"pending","form":{"firstName":"UNMASKED","lastName":"SYNTHETIC","birthDate":"1989-07-13"}}}""",
            json,
        )
        assertThat(result.firstName).isEqualTo("U*******")
        assertThat(result.lastName).doesNotContain("SYNTHETIC")
        assertThat(result.birthDate).doesNotContain("1989")
    }

    @Test fun paidLookupStillMasksOfficialAddressAndNeverDownloadsPhoto() {
        val result = parseRenaperResponse(
            """{"success":true,"data":{"source":"RENAPER","hasPaid":true,"identityStatus":"verified_renaper","form":{"firstName":"DEMO","lastName":"TEST","address":"Calle Ficticia 123, Rosario, Santa Fe","photoAvailable":true}}}""",
            json,
        )
        assertThat(result.firstName).isEqualTo("DEMO")
        assertThat(result.maskedAddress).isEqualTo("Cal** ******** ***, Ros****, San** **")
        assertThat(result.maskedAddress).doesNotContain("123")
        assertThat(result.photoAvailable).isTrue()
        assertThat(result.toString()).doesNotContain("BASE64")
    }

    @Test fun missingPhotoDoesNotSuggestOfficialPictureExists() {
        val result = parseRenaperResponse(
            """{"success":true,"data":{"source":"RENAPER","hasPaid":false,"form":{"firstName":"A","address":"","photoAvailable":false}}}""",
            json,
        )
        assertThat(result.photoAvailable).isFalse()
        assertThat(result.maskedAddress).isEmpty()
    }

    @Test fun rejectsMissingServerPaymentFlag() {
        val malformed = """{"success":true,"data":{"source":"RENAPER","form":{"firstName":"DEMO"}}}"""
        val thrown = runCatching { parseRenaperResponse(malformed, json) }.exceptionOrNull()
        assertThat(thrown).isInstanceOf(RenaperLookupException::class.java)
    }

    @Test fun kotlinSendsAuthenticatedPostWithoutServiceRole() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            server.enqueue(
                MockResponse().setResponseCode(200).setBody(
                    """{"success":true,"data":{"source":"RENAPER","hasPaid":true,"identityStatus":"verified_renaper","checkedAt":"2026-11-21","form":{"firstName":"DEMO","lastName":"TEST","birthDate":"2000-01-01","gender":"other"}}}""",
                ),
            )
            val client = RenaperIdentityClient(mockk<SupabaseClient>(), OkHttpClient(), json)
            val result = client.postLookup(server.url("/").toString(), "12345678", RenaperSexId.OTHER, "test-session-access-token")
            val req = server.takeRequest()
            assertThat(req.path).isEqualTo("/api/patients/identity/renaper")
            assertThat(req.method).isEqualTo("POST")
            assertThat(req.getHeader("Authorization")).isEqualTo("Bearer test-session-access-token")
            assertThat(req.body.readUtf8()).contains("\"sexId\":3")
            assertThat(result.firstName).isEqualTo("DEMO")
            assertThat(result.identityStatus).isEqualTo("verified_renaper")
        } finally {
            server.shutdown()
        }
    }

    @Test fun doesNotFollowRedirectsWithPatientBearerToken() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            server.enqueue(
                MockResponse()
                    .setResponseCode(302)
                    .addHeader("Location", server.url("/redirected").toString()),
            )
            val client = RenaperIdentityClient(mockk<SupabaseClient>(), OkHttpClient(), json)
            val failure = runCatching {
                client.postLookup(server.url("/").toString(), "12345678", RenaperSexId.FEMALE, "secret-bearer")
            }.exceptionOrNull()
            assertThat(failure).isInstanceOf(RenaperLookupException::class.java)
            assertThat((failure as RenaperLookupException).httpStatus).isEqualTo(302)
            assertThat(server.requestCount).isEqualTo(1)
        } finally {
            server.shutdown()
        }
    }

    @Test fun rejectsInvalidDniBeforeNetwork() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            val client = RenaperIdentityClient(mockk<SupabaseClient>(), OkHttpClient(), json)
            val failure = runCatching {
                client.postLookup(server.url("/").toString(), "12A456", RenaperSexId.MALE, "test-access-token")
            }.exceptionOrNull()
            assertThat(failure).isInstanceOf(IllegalArgumentException::class.java)
            assertThat(server.requestCount).isEqualTo(0)
        } finally {
            server.shutdown()
        }
    }

    @Test fun serverDenialMustNotExposeBodyOrPersonalData() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            server.enqueue(MockResponse().setResponseCode(403).setBody("""{"message":"SENSITIVE DEMO BODY"}"""))
            val client = RenaperIdentityClient(mockk<SupabaseClient>(), OkHttpClient(), json)
            val failure = runCatching {
                client.postLookup(server.url("/").toString(), "12345678", RenaperSexId.FEMALE, "test-access-token")
            }.exceptionOrNull()
            assertThat(failure).isInstanceOf(RenaperLookupException::class.java)
            assertThat((failure as RenaperLookupException).httpStatus).isEqualTo(403)
            assertThat(failure.message).doesNotContain("SENSITIVE")
        } finally {
            server.shutdown()
        }
    }
}
