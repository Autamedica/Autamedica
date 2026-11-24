package com.autamedica.android.data.repository

import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test

class ClinicalDocumentSubmissionPolicyTest {

    @Test
    fun `normalizeDocumentMimeType accepts allowed types and normalizes image jpg`() {
        assertThat(normalizeDocumentMimeType("application/pdf", "lab.pdf"))
            .isEqualTo("application/pdf")
        assertThat(normalizeDocumentMimeType("image/jpg", "scan.jpg"))
            .isEqualTo("image/jpeg")
        assertThat(normalizeDocumentMimeType("image/png; charset=binary", "rx.png"))
            .isEqualTo("image/png")
        assertThat(normalizeDocumentMimeType("image/webp", "img.webp"))
            .isEqualTo("image/webp")
        assertThat(normalizeDocumentMimeType("application/octet-stream", "study.PDF"))
            .isEqualTo("application/pdf")
    }

    @Test
    fun `normalizeDocumentMimeType rejects unsupported formats`() {
        assertThrows(IllegalArgumentException::class.java) {
            normalizeDocumentMimeType("text/html", "exploit.html")
        }
        assertThrows(IllegalArgumentException::class.java) {
            normalizeDocumentMimeType("application/x-msdownload", "app.exe")
        }
    }

    @Test
    fun `mapToSubmissionDocumentType maps aliases and falls back to other`() {
        assertThat(mapToSubmissionDocumentType("lab_result")).isEqualTo("lab_result")
        assertThat(mapToSubmissionDocumentType("laboratorio")).isEqualTo("lab_result")
        assertThat(mapToSubmissionDocumentType("imagenologia")).isEqualTo("imaging")
        assertThat(mapToSubmissionDocumentType("receta")).isEqualTo("prescription")
        assertThat(mapToSubmissionDocumentType("informe")).isEqualTo("report")
        assertThat(mapToSubmissionDocumentType("document")).isEqualTo("other")
        assertThat(mapToSubmissionDocumentType("unknown")).isEqualTo("other")
    }
}
