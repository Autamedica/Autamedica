package com.autamedica.android.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MedicalCertificateDownloadContractTest {

    @Test
    fun `effectivePdfUrl never exposes a raw Supabase Storage path to Intent ACTION_VIEW`() {
        val certId = "11111111-1111-4111-8111-111111111111"
        val hash = "a".repeat(64)
        val cert = MedicalCertificate(
            id = certId,
            cuir = "CUIR-AR-001",
            status = "signed",
            certificateType = CertificateType.REPOSO_LABORAL,
            daysOfRest = 2,
            startDate = "2026-11-19",
            signedPdfUrl = "certificates/electronic/$certId/$hash.pdf",
            countryCode = "AR",
            createdAt = "2026-11-19T08:00:00Z",
            signatureVerifiedAt = "2026-11-19T08:00:00Z",
        )

        val url = cert.effectivePdfUrl
        assertTrue(
            "Expected HTTPS download URL instead of raw Storage path, got: $url",
            url != null && url.startsWith("https://"),
        )
    }

    @Test
    fun `effectivePdfUrl keeps an already-resolved HTTPS URL intact`() {
        val signedHttps = "https://autamedica.com/api/doctors/certificates/11111111-1111-4111-8111-111111111111/pdf"
        val cert = MedicalCertificate(
            id = "11111111-1111-4111-8111-111111111111",
            cuir = "CUIR-AR-002",
            status = "signed",
            certificateType = CertificateType.REPOSO_LABORAL,
            startDate = "2026-11-19",
            signedPdfUrl = signedHttps,
            countryCode = "AR",
            createdAt = "2026-11-19T08:00:00Z",
            signatureVerifiedAt = "2026-11-19T08:00:00Z",
        )

        assertEquals(signedHttps, cert.effectivePdfUrl)
    }

    @Test
    fun `effectivePdfUrl is null for unverified Brazilian certificates`() {
        val cert = MedicalCertificate(
            id = "22222222-2222-4222-8222-222222222222",
            cuir = "CUIR-BR-001",
            status = "signed",
            certificateType = CertificateType.REPOSO_LABORAL,
            startDate = "2026-11-19",
            signedPdfUrl = "certificates/signed/22222222-2222-4222-8222-222222222222.pdf",
            countryCode = "BR",
            createdAt = "2026-11-19T08:00:00Z",
            signatureVerifiedAt = null,
        )

        assertNull(cert.effectivePdfUrl)
    }
}
