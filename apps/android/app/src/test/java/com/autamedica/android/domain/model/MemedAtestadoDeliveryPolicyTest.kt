package com.autamedica.android.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MedicalCertificateTest {
    private fun certificate(
        method: String = "ac_external",
        path: String = "certificates/signed/certificate-1.pdf",
        hash: String? = "a".repeat(64),
        status: String = "signed",
        verifiedAt: String? = "2026-11-19T12:00:00Z",
    ) = MedicalCertificate(
        id = "certificate-1",
        cuir = "AR-CERT-1",
        status = status,
        certificateType = CertificateType.REPOSO_LABORAL,
        startDate = "2026-11-19",
        signedPdfUrl = path,
        countryCode = "AR",
        createdAt = "2026-11-19T12:00:00Z",
        signatureVerifiedAt = verifiedAt,
        signatureHash = hash,
        signatureMethod = method,
    )

    @Test
    fun externalSignatureWithMatchingPathIsDownloadable() {
        val item = certificate()
        assertTrue(item.isActive)
        assertEquals("certificates/signed/certificate-1.pdf", item.effectivePdfStoragePath)
    }

    @Test
    fun electronicSignatureUsesHashAddressedPath() {
        val hash = "b".repeat(64)
        val item = certificate(
            method = "electronic_verified",
            path = "certificates/electronic/certificate-1/$hash.pdf",
            hash = hash,
        )
        assertTrue(item.isActive)
    }

    @Test
    fun memedProviderReportedAtestadoIsDownloadableWithoutClaimingLocalCryptographicVerification() {
        val item = MedicalCertificate(
            id = "memed-12345678-1234-4234-8234-123456789abc",
            cuir = "",
            status = "signed",
            certificateType = CertificateType.ATESTADO,
            startDate = "2026-11-23",
            signedPdfUrl = "/api/patients/prescriptions/memed-12345678-1234-4234-8234-123456789abc/pdf",
            countryCode = "BR",
            createdAt = "2026-11-23T12:00:00Z",
            signatureMethod = "memed_provider_reported",
            source = "memed_br",
            providerSignatureReported = true,
            patientDeliveryEligible = true,
        )

        assertFalse(item.isActive)
        assertTrue(item.canDownloadPdf)
        assertEquals(null, item.effectivePdfStoragePath)
        assertEquals("", item.effectiveQrContent)
    }

    @Test
    fun memedAtestadoCannotDownloadWithoutProviderDeliveryEvidence() {
        val item = MedicalCertificate(
            id = "memed-12345678-1234-4234-8234-123456789abc",
            cuir = "",
            status = "signed",
            certificateType = CertificateType.ATESTADO,
            startDate = "2026-11-23",
            signedPdfUrl = "/api/patients/prescriptions/memed-12345678-1234-4234-8234-123456789abc/pdf",
            countryCode = "BR",
            createdAt = "2026-11-23T12:00:00Z",
            signatureMethod = "memed_provider_reported",
            source = "memed_br",
            providerSignatureReported = true,
            patientDeliveryEligible = false,
        )

        assertFalse(item.isActive)
        assertFalse(item.canDownloadPdf)
    }

    @Test
    fun missingEvidenceNeverExposesDownloadPath() {
        listOf(
            certificate(status = "draft"),
            certificate(hash = null),
            certificate(hash = " "),
            certificate(verifiedAt = null),
            certificate(method = "electronic_simple"),
            certificate(path = "https://storage.invalid/private.pdf"),
        ).forEach { item ->
            assertFalse(item.isActive)
            assertEquals(null, item.effectivePdfStoragePath)
            assertEquals("", item.effectiveQrContent)
        }
    }
}
