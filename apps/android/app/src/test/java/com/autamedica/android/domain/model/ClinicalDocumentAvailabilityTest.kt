package com.autamedica.android.domain.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * A provider URL or internal reference is not a cryptographic validation.
 * These tests only gate Android availability of documents and QR presentation.
 */
class ClinicalDocumentAvailabilityTest {

    private val draftPrescription = Prescription(
        id = "rx-test",
        status = "draft",
        cuir = "AR-TEST-123",
        signedPdfUrl = null,
        qrCodeContent = null,
        medicationName = "Medicamento de prueba",
        dosage = "1",
        frequency = "Diaria",
        instructions = "Sólo prueba",
        doctorName = null,
        doctorLicense = null,
        createdAt = "2026-11-06T00:00:00Z",
        countryCode = "AR",
    )

    private val draftCertificate = MedicalCertificate(
        id = "cert-test",
        cuir = "AR-CERT-TEST-123",
        status = "draft",
        certificateType = CertificateType.REPOSO_LABORAL,
        startDate = "2026-11-06",
        createdAt = "2026-11-06T00:00:00Z",
    )

    @Test
    fun prescriptionDraftOrSentStatusNeverExposesQrWithoutSignedPdf() {
        val sent = draftPrescription.copy(
            status = "sent",
            cuir = "AR-TEST-123",
            qrCodeContent = "https://example.invalid/verify/AR-TEST-123",
        )

        assertThat(draftPrescription.isActive).isFalse()
        assertThat(draftPrescription.effectivePdfUrl).isNull()
        assertThat(draftPrescription.effectiveQrContent).isEmpty()
        assertThat(sent.isActive).isFalse()
        assertThat(sent.effectivePdfUrl).isNull()
        assertThat(sent.effectiveQrContent).isEmpty()
    }

    @Test
    fun prescriptionRequiresSignedStateAndHttpsPdfEvenWithCuir() {
        val untrusted = draftPrescription.copy(
            status = "signed",
            signedPdfUrl = "http://example.invalid/unsigned.pdf",
        )
        val available = draftPrescription.copy(
            status = "signed",
            signedPdfUrl = "https://example.invalid/rx.pdf",
        )

        assertThat(untrusted.isActive).isFalse()
        assertThat(untrusted.effectivePdfUrl).isNull()
        assertThat(untrusted.effectiveQrContent).isEmpty()
        assertThat(available.isActive).isTrue()
        assertThat(available.effectivePdfUrl).isEqualTo("https://example.invalid/rx.pdf")
        assertThat(available.effectiveQrContent).contains("AR-TEST-123")
    }

    @Test
    fun activeButUnsignedPrescriptionNeverExposesQrOrPdf() {
        for (status in listOf("active", "activa", "sent")) {
            val record = draftPrescription.copy(
                status = status,
                signedPdfUrl = "https://example.invalid/unverified.pdf",
                qrCodeContent = "https://example.invalid/verify/AR-TEST-123",
            )
            assertThat(record.isActive).isFalse()
            assertThat(record.effectivePdfUrl).isNull()
            assertThat(record.effectiveQrContent).isEmpty()
        }
        val signed = draftPrescription.copy(status = "firmada", signedPdfUrl = "https://example.invalid/signed.pdf")
        assertThat(signed.isActive).isTrue()
    }

    @Test
    fun unsignedCertificateNeverExposesQrOrPdf() {
        val signedWithoutPdf = draftCertificate.copy(
            status = "signed",
            qrCodeContent = "https://example.invalid/verify/AR-CERT-TEST-123",
        )
        assertThat(draftCertificate.isActive).isFalse()
        assertThat(draftCertificate.effectiveQrContent).isEmpty()
        assertThat(signedWithoutPdf.isActive).isFalse()
        assertThat(signedWithoutPdf.effectivePdfUrl).isNull()
        assertThat(signedWithoutPdf.effectiveQrContent).isEmpty()
    }

    @Test
    fun malformedHttpsDocumentUrlsAreNotAvailableToPharmacy() {
        for (url in listOf("https://", "https:///not-a-host.pdf", "https://u:p@example.invalid/rx.pdf", " https://example.invalid/rx.pdf")) {
            val prescription = draftPrescription.copy(status = "signed", signedPdfUrl = url)
            val certificate = draftCertificate.copy(status = "signed", signedPdfUrl = url)
            assertThat(prescription.isActive).isFalse()
            assertThat(prescription.effectivePdfUrl).isNull()
            assertThat(prescription.effectiveQrContent).isEmpty()
            assertThat(certificate.isActive).isFalse()
            assertThat(certificate.effectivePdfUrl).isNull()
            assertThat(certificate.effectiveQrContent).isEmpty()
        }
    }

    @Test
    fun certificateRequiresHttpsPdfForAvailability() {
        val insecureUrl = draftCertificate.copy(
            status = "signed",
            signedPdfUrl = "http://example.invalid/cert.pdf",
        )
        val available = draftCertificate.copy(
            status = "signed",
            signedPdfUrl = "https://example.invalid/cert.pdf",
        )

        assertThat(insecureUrl.isActive).isFalse()
        assertThat(insecureUrl.effectivePdfUrl).isNull()
        assertThat(available.isActive).isTrue()
        assertThat(available.effectivePdfUrl).isEqualTo("https://example.invalid/cert.pdf")
        assertThat(available.effectiveQrContent).contains("AR-CERT-TEST-123")
    }
}
