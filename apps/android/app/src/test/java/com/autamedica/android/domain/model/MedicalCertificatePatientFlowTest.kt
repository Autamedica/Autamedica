package com.autamedica.android.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MedicalCertificatePatientFlowTest {

    @Test
    fun `verified AR certificate exposes active QR verification link and HTTPS PDF endpoint`() {
        val id = "11111111-1111-4111-8111-111111111111"
        val cert = MedicalCertificate(
            id = id,
            cuir = "CUIR-AR-2026-001",
            status = "signed",
            certificateType = CertificateType.REPOSO_LABORAL,
            daysOfRest = 3,
            startDate = "2026-11-19",
            signedPdfUrl = "certificates/electronic/$id/${"a".repeat(64)}.pdf",
            countryCode = "AR",
            createdAt = "2026-11-19T12:00:00Z",
            signatureVerifiedAt = "2026-11-19T12:00:00Z",
        )

        assertTrue(cert.isActive)
        assertEquals("https://autamedica.com/verify/CUIR-AR-2026-001", cert.effectiveQrContent)
        assertEquals("https://autamedica.com/api/doctors/certificates/$id/pdf", cert.effectivePdfUrl)
        assertEquals("3 días (72 horas)", cert.displayDaysOfRest)
    }

    @Test
    fun `verified BR certificate uses restHours display and requires signatureVerifiedAt`() {
        val id = "22222222-2222-4222-8222-222222222222"
        val cert = MedicalCertificate(
            id = id,
            cuir = "CUIR-BR-2026-001",
            status = "signed",
            certificateType = CertificateType.REPOSO_LABORAL,
            restHours = 48,
            startDate = "2026-11-19",
            signedPdfUrl = "certificates/signed/$id.pdf",
            countryCode = "BR",
            createdAt = "2026-11-19T12:00:00Z",
            signatureVerifiedAt = "2026-11-19T12:05:00Z",
        )

        assertTrue(cert.isActive)
        assertEquals("48 horas", cert.displayDaysOfRest)
        assertEquals("https://autamedica.com/api/doctors/certificates/$id/pdf", cert.effectivePdfUrl)
    }

    @Test
    fun `draft and revoked certificates never expose QR or PDF download URL`() {
        for (status in listOf("draft", "revoked")) {
            val cert = MedicalCertificate(
                id = "33333333-3333-4333-8333-333333333333",
                cuir = "CUIR-INACTIVE-$status",
                status = status,
                certificateType = CertificateType.CONSTANCIA_ATENCION,
                startDate = "2026-11-19",
                signedPdfUrl = "certificates/signed/33333333-3333-4333-8333-333333333333.pdf",
                countryCode = "AR",
                createdAt = "2026-11-19T12:00:00Z",
                signatureVerifiedAt = "2026-11-19T12:00:00Z",
            )

            assertFalse("Expected $status certificate to be inactive", cert.isActive)
            assertEquals("", cert.effectiveQrContent)
            assertNull(cert.effectivePdfUrl)
        }
    }
}
