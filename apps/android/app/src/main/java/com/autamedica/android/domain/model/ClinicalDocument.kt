package com.autamedica.android.domain.model

import java.util.Locale

/**
 * Domain model representing a patient clinical document or study (lab test, imaging, medical report).
 */
data class ClinicalDocument(
    val id: String,
    val title: String,
    val type: String, // "lab_result", "imaging", "document"
    val fileUrl: String,
    val fileName: String,
    val fileSize: Long,
    val dateRecorded: String,
    val mimeType: String,
) {
    val isPdf: Boolean
        get() = mimeType.contains("pdf", ignoreCase = true) || fileName.endsWith(".pdf", ignoreCase = true)

    val isImage: Boolean
        get() = mimeType.startsWith("image/", ignoreCase = true) ||
                listOf(".png", ".jpg", ".jpeg", ".webp").any { fileName.endsWith(it, ignoreCase = true) }

    val formattedFileSize: String
        get() = when {
            fileSize <= 0 -> ""
            fileSize < 1024 -> "$fileSize B"
            fileSize < 1024 * 1024 -> "${fileSize / 1024} KB"
            else -> String.format(Locale.US, "%.1f MB", fileSize.toDouble() / (1024 * 1024))
        }

    val typeDisplayName: String
        get() = when (type.lowercase()) {
            "lab_result", "laboratorio" -> "Análisis / Laboratorio"
            "imaging", "imagen", "imagenologia" -> "Estudio por Imágenes"
            else -> "Documento Médico"
        }
}
