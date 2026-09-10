package com.autamedica.android.domain.model

/**
 * Domain model representing an official digital prescription (Receta Digital)
 * Interoperable with SISA WS020, Farmalink (IMED) and digital pharmacy validation.
 */
data class Prescription(
    val id: String,
    val status: String,
    val cuir: String?,
    val signedPdfUrl: String?,
    val qrCodeContent: String?,
    val medicationName: String,
    val dosage: String,
    val frequency: String,
    val instructions: String,
    val doctorName: String?,
    val doctorLicense: String?,
    val createdAt: String,
    val countryCode: String?,
    val duration: String = "",
    val diagnosis: String? = null,
    val notes: String? = null,
    val prescribedDate: String? = null,
) {
    /**
     * Determines whether this prescription is currently active and valid.
     */
    val isActive: Boolean
        get() = status.equals("activa", ignoreCase = true) ||
                status.equals("active", ignoreCase = true) ||
                status.equals("signed", ignoreCase = true) ||
                status.equals("firmada", ignoreCase = true) ||
                status.equals("sent", ignoreCase = true) ||
                status.equals("emitida", ignoreCase = true)

    /**
     * Determines whether this prescription was already dispensed by a pharmacy.
     */
    val isDispensed: Boolean
        get() = status.equals("dispensed", ignoreCase = true) ||
                status.equals("dispensada", ignoreCase = true) ||
                status.equals("dispensed_total", ignoreCase = true) ||
                status.equals("dispensed_partial", ignoreCase = true)

    /**
     * Determines whether this prescription was completed.
     */
    val isCompleted: Boolean
        get() = status.equals("completed", ignoreCase = true) ||
                status.equals("completada", ignoreCase = true)

    /**
     * Determines whether this prescription is expired.
     */
    val isExpired: Boolean
        get() = status.equals("expired", ignoreCase = true) ||
                status.equals("vencida", ignoreCase = true)

    /**
     * Effective QR content for pharmacy scanning (falls back to verification URL if cuir is present).
     */
    val effectiveQrContent: String
        get() = qrCodeContent?.takeIf { it.isNotBlank() }
            ?: cuir?.let { "https://autamedica.com/verify/$it" }
            ?: "https://autamedica.com/prescriptions/$id"
}
