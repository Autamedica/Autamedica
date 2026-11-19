package com.autamedica.android.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MedicalCertificateDownloadContractTest {
    @Test
    fun `private storage path is retained only as an authenticated download reference`() {
        val certId = "11111111-1111-4111-8111-111111111111"
        val hash = "a".repeat(64)
        val storagePath = "certificates/electronic/" + certId + "/" + hash + ".pdf"
        val certificate = MedicalCertificate(
            id = certId,
            cuir = "CUIR-AR-001",
            status = "signed",
            certificateType = CertificateType.REPOSO_LABORAL,
            daysOfRest = 2,
            startDate = "2026-11-19",
            signedPdfUrl = storagePath,
            countryCode = "AR",
            createdAt = "2026-11-19T08:00:00Z",
            signatureVerifiedAt = "2026-11-19T08:00:00Z",
            signatureHash = hash,
            signatureMethod = "electronic_verified",
        )

        assertTrue(certificate.isActive)
        assertEquals(storagePath, certificate.effectivePdfStoragePath)
        assertFalse(certificate.effectivePdfStoragePath!!.startsWith("https://"))
    }

    @Test
    fun `unverified certificates do not expose a private storage path`() {
        val certificate = MedicalCertificate(
            id = "22222222-2222-4222-8222-222222222222",
            cuir = "CUIR-BR-001",
            status = "signed",
            certificateType = CertificateType.REPOSO_LABORAL,
            startDate = "2026-11-19",
            signedPdfUrl = "certificates/signed/22222222-2222-4222-8222-222222222222.pdf",
            countryCode = "BR",
            createdAt = "2026-11-19T08:00:00Z",
            signatureVerifiedAt = null,
            signatureHash = null,
            signatureMethod = "ac_external",
        )

        assertFalse(certificate.isActive)
        assertEquals(null, certificate.effectivePdfStoragePath)
        assertEquals("", certificate.effectiveQrContent)
    }
}
