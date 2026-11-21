package com.autamedica.android.data.repository

import com.google.common.truth.Truth.assertThat
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Test

class ElectronicCertificateIssuanceTest {
    private val validHash = "a".repeat(64)
    private val pdfHash = "b".repeat(64)

    @Test
    fun `two-step electronic issuance fetches snapshotHash and confirms signed PDF`() {
        val server = MockWebServer()
        server.start()
        try {
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .setBody(
                        """{"success":true,"data":{"status":"draft","snapshotHash":"$validHash","signatureMethod":"electronic_verified"}}""",
                    ),
            )
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .setBody(
                        """{"success":true,"data":{"id":"cert-1","cuir":"AR-CERT-001","status":"signed","signed_pdf_url":"certificates/electronic/cert-1/$pdfHash.pdf","signature_verified_at":"2026-11-21T05:30:00Z","signature_hash":"$pdfHash","signature_method":"electronic_verified","qr_code_content":"https://autamedica.com/verify/AR-CERT-001"}}""",
                    ),
            )

            val issued = executeElectronicCertificateIssuance(
                httpClient = OkHttpClient(),
                baseUrl = server.url("/").toString(),
                certId = "cert-1",
                accessToken = "doctor-jwt-token",
            )

            assertThat(issued.status).isEqualTo("signed")
            assertThat(issued.signedPdfUrl).isEqualTo("certificates/electronic/cert-1/$pdfHash.pdf")
            assertThat(issued.signatureHash).isEqualTo(pdfHash)
            assertThat(issued.signatureMethod).isEqualTo("electronic_verified")

            val getReq = server.takeRequest()
            assertThat(getReq.method).isEqualTo("GET")
            assertThat(getReq.path).isEqualTo("/api/doctors/certificates/cert-1/issue")
            assertThat(getReq.getHeader("Authorization")).isEqualTo("Bearer doctor-jwt-token")

            val postReq = server.takeRequest()
            assertThat(postReq.method).isEqualTo("POST")
            assertThat(postReq.path).isEqualTo("/api/doctors/certificates/cert-1/issue")
            val body = postReq.body.readUtf8()
            assertThat(body).contains("\"confirmed\":true")
            assertThat(body).contains("\"snapshotHash\":\"$validHash\"")
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `missing doctor signature and stamp fails closed with actionable clinical message`() {
        val server = MockWebServer()
        server.start()
        try {
            server.enqueue(
                MockResponse()
                    .setResponseCode(403)
                    .setBody("""{"success":false,"error":{"message":"certificate_signature_and_stamp_required"}}"""),
            )

            val error = runCatching {
                executeElectronicCertificateIssuance(
                    httpClient = OkHttpClient(),
                    baseUrl = server.url("/").toString(),
                    certId = "cert-2",
                    accessToken = "doctor-jwt-token",
                )
            }.exceptionOrNull()

            assertThat(error).isInstanceOf(IllegalStateException::class.java)
            assertThat(error?.message).contains("Firma digital")
            assertThat(server.requestCount).isEqualTo(1)
        } finally {
            server.shutdown()
        }
    }
}
