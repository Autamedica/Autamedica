package com.autamedica.android.domain.model

enum class StudyType(val value: String, val displayName: String) {
    LABORATORY("laboratory", "Laboratorio"),
    IMAGING("imaging", "Diagnóstico por Imágenes"),
    CARDIOLOGY("cardiology", "Cardiología"),
    OTHER("other", "Otros estudios");

    companion object {
        fun fromValue(value: String): StudyType {
            return entries.firstOrNull { it.value.equals(value, ignoreCase = true) } ?: OTHER
        }
    }
}

data class PracticeItem(
    val name: String,
    val code: String? = null,
)

data class MedicalOrder(
    val id: String,
    val cuir: String?,
    val status: String,
    val studyType: StudyType,
    val practices: List<PracticeItem>,
    val diagnosis: String?,
    val notes: String?,
    val qrCodeContent: String?,
    val signedPdfUrl: String?,
    val doctorName: String? = null,
    val doctorLicense: String? = null,
    val patientName: String? = null,
    val patientDni: String? = null,
    val createdAt: String,
)

data class CreateMedicalOrderRequest(
    val patientId: String,
    val studyType: StudyType,
    val practices: List<PracticeItem>,
    val diagnosis: String,
    val notes: String? = null,
)
