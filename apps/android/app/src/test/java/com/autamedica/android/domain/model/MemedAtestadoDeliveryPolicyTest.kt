package com.autamedica.android.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MemedAtestadoDeliveryPolicyTest {
    private fun certificate(deliveryEligible: Boolean) = MedicalCertificate(
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
        patientDeliveryEligible = deliveryEligible,
    )

    @Test
    fun providerReportedSignatureAllowsDownloadButNeverClaimsLocalVerification() {
        val item = certificate(deliveryEligible = true)
        assertFalse(item.isActive)
        assertTrue(item.canDownloadPdf)
        assertEquals(null, item.effectivePdfStoragePath)
        assertEquals("", item.effectiveQrContent)
    }

    @Test
    fun missingDeliveryEvidenceBlocksDownload() {
        val item = certificate(deliveryEligible = false)
        assertFalse(item.isActive)
        assertFalse(item.canDownloadPdf)
    }
}
