package com.autamedica.android.domain.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PrescriptionAndClinicalDocumentTest {

    @Test
    fun prescriptionStatusEvaluatesActiveCorrectly() {
        val activeSigned = Prescription(
            id = "rx-1",
            status = "signed",
            cuir = "CUIR-2026-0001",
            signedPdfUrl = "https://storage.autamedica.com/rx-1.pdf",
            qrCodeContent = null,
            medicationName = "Losartán 50mg",
            dosage = "50mg",
            frequency = "Cada 12 hs",
            instructions = "Tomar con agua en ayunas",
            doctorName = "Dr. Eduardo Marques",
            doctorLicense = "MN 123456",
            createdAt = "2026-09-06T10:00:00Z",
            countryCode = "AR",
        )

        assertThat(activeSigned.isActive).isTrue()
        assertThat(activeSigned.isDispensed).isFalse()
        assertThat(activeSigned.effectiveQrContent).isEqualTo("https://autamedica.com/verify/CUIR-2026-0001")
    }

    @Test
    fun prescriptionStatusEvaluatesDispensedCorrectly() {
        val dispensed = Prescription(
            id = "rx-2",
            status = "dispensed",
            cuir = "CUIR-2026-0002",
            signedPdfUrl = "https://storage.autamedica.com/rx-2.pdf",
            qrCodeContent = "CUSTOM_QR_PAYLOAD_123",
            medicationName = "Amoxicilina 500mg",
            dosage = "500mg",
            frequency = "Cada 8 hs",
            instructions = "Completar 7 días",
            doctorName = "Dra. María Lopez",
            doctorLicense = "MP 78910",
            createdAt = "2026-09-01T10:00:00Z",
            countryCode = "AR",
        )

        assertThat(dispensed.isActive).isFalse()
        assertThat(dispensed.isDispensed).isTrue()
        assertThat(dispensed.effectiveQrContent).isEmpty()
    }

    @Test
    fun prescriptionStatusEvaluatesCompletedAndExpiredCorrectly() {
        val completed = Prescription(
            id = "rx-3",
            status = "completada",
            cuir = "CUIR-2026-0003",
            signedPdfUrl = null,
            qrCodeContent = null,
            medicationName = "Ibuprofeno 400mg",
            dosage = "400mg",
            frequency = "Cada 8 hs",
            instructions = "Tomar con alimentos",
            doctorName = "Dr. Pedro Gómez",
            doctorLicense = "MN 55555",
            createdAt = "2026-08-01T10:00:00Z",
            countryCode = "AR",
            duration = "5 días",
            diagnosis = "Cefalea tensional",
            notes = "Suspender al ceder el dolor",
        )

        assertThat(completed.isCompleted).isTrue()
        assertThat(completed.isActive).isFalse()
        assertThat(completed.isDispensed).isFalse()
        assertThat(completed.duration).isEqualTo("5 días")
        assertThat(completed.diagnosis).isEqualTo("Cefalea tensional")
        assertThat(completed.notes).isEqualTo("Suspender al ceder el dolor")

        val expired = Prescription(
            id = "rx-4",
            status = "vencida",
            cuir = "CUIR-2026-0004",
            signedPdfUrl = null,
            qrCodeContent = null,
            medicationName = "Clonazepam 0.5mg",
            dosage = "0.5mg",
            frequency = "1 comprimido por noche",
            instructions = "No discontinuar abruptamente",
            doctorName = "Dra. Sofía Rivas",
            doctorLicense = "MN 99999",
            createdAt = "2026-07-01T10:00:00Z",
            countryCode = "AR",
        )

        assertThat(expired.isExpired).isTrue()
        assertThat(expired.isActive).isFalse()
    }

    @Test
    fun clinicalDocumentMimeTypeAndSizeFormatting() {
        val pdfDoc = ClinicalDocument(
            id = "doc-1",
            title = "Laboratorio Perfil Lipídico",
            type = "lab_result",
            fileUrl = "https://storage.autamedica.com/lab-1.pdf",
            fileName = "perfil_lipidico.pdf",
            fileSize = 1048576L * 2, // 2 MB
            dateRecorded = "2026-09-06T10:00:00Z",
            mimeType = "application/pdf",
        )

        assertThat(pdfDoc.isPdf).isTrue()
        assertThat(pdfDoc.isImage).isFalse()
        assertThat(pdfDoc.formattedFileSize).isEqualTo("2.0 MB")
        assertThat(pdfDoc.typeDisplayName).isEqualTo("Análisis / Laboratorio")

        val imgDoc = ClinicalDocument(
            id = "doc-2",
            title = "Radiografía de Tórax",
            type = "imaging",
            fileUrl = "https://storage.autamedica.com/rx-torax.jpg",
            fileName = "rx_torax.jpg",
            fileSize = 512 * 1024L, // 512 KB
            dateRecorded = "2026-09-05T15:00:00Z",
            mimeType = "image/jpeg",
        )

        assertThat(imgDoc.isPdf).isFalse()
        assertThat(imgDoc.isImage).isTrue()
        assertThat(imgDoc.formattedFileSize).isEqualTo("512 KB")
        assertThat(imgDoc.typeDisplayName).isEqualTo("Estudio por Imágenes")
    }
}
