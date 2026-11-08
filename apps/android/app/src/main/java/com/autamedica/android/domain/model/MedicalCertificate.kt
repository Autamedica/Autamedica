package com.autamedica.android.domain.model

/** Clinical certificate record: a draft or QR does not prove a valid signature. */
data class MedicalCertificate(
    val id: String,
    val cuir: String,
    val status: String,
    val certificateType: CertificateType,
    val daysOfRest: Int = 0,
    val startDate: String,
    val endDate: String? = null,
    val diagnosis: String? = null,
    val hideDiagnosis: Boolean = false,
    val observations: String? = null,
    val doctorName: String? = null,
    val doctorLicense: String? = null,
    val patientName: String? = null,
    val patientDni: String? = null,
    val signedPdfUrl: String? = null,
    val qrCodeContent: String? = null,
    val countryCode: String = "AR",
    val createdAt: String,
) {
    val isActive: Boolean
        get() = status.equals("signed", ignoreCase = true) && hasHttpsDocumentUrl(signedPdfUrl)

    val effectiveQrContent: String
        get() = if (!isActive) "" else (
            qrCodeContent?.takeIf { it.isNotBlank() }
                ?: "https://autamedica.com/verify/$cuir"
        )

    val effectivePdfUrl: String?
        get() = if (!isActive) null else signedPdfUrl?.takeIf { it.isNotBlank() }

    val displayDaysOfRest: String
        get() = when {
            daysOfRest <= 0 -> "Sin reposo requerido"
            daysOfRest == 1 -> "1 día (24 horas)"
            daysOfRest == 2 -> "2 días (48 horas)"
            daysOfRest == 3 -> "3 días (72 horas)"
            else -> "$daysOfRest días"
        }
}

enum class CertificateType(val code: String, val displayName: String) {
    REPOSO_LABORAL("reposo_laboral", "Reposo Laboral"),
    REPOSO_ESCOLAR("reposo_escolar", "Reposo Escolar / Universitario"),
    APTITUD_FISICA("aptitud_fisica", "Aptitud Física"),
    CONSTANCIA_ATENCION("constancia_atencion", "Constancia de Atención"),
    TRATAMIENTO("tratamiento", "Tratamiento Prolongado"),
    OTRO("otro", "Certificado Médico");

    companion object {
        fun fromCode(code: String?): CertificateType {
            return entries.firstOrNull { it.code.equals(code, ignoreCase = true) } ?: OTRO
        }
    }
}

data class CreateCertificateRequest(
    val patientId: String,
    val certificateType: CertificateType,
    val daysOfRest: Int,
    val startDate: String,
    val endDate: String? = null,
    val diagnosis: String? = null,
    val hideDiagnosis: Boolean = false,
    val observations: String? = null,
    val countryCode: String = "AR",
)
