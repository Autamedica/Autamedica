package com.autamedica.android.domain.model

/** Clinical prescription record: status and an access URL do not prove signature or homologation. */
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
    val patientName: String? = null,
    val patientDni: String? = null,
    val items: List<PrescriptionItem> = emptyList(),
) {
    /**
     * UI availability only: accepted signed status and HTTPS PDF are required.
     * Neither condition proves independent provider or cryptographic verification.
     * Unsigned 'active'/'activa' must never expose a pharmacy-facing QR.
     */
    val isActive: Boolean
        get() = hasHttpsDocumentUrl(signedPdfUrl) && (
            status.equals("signed", ignoreCase = true) ||
            status.equals("firmada", ignoreCase = true)
        )

    /** A server-supplied HTTPS PDF with an accepted signed status, not legal verification. */
    val effectivePdfUrl: String?
        get() = signedPdfUrl?.takeIf { isActive }

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
     * Determines whether this prescription is cancelled.
     */
    val isCancelled: Boolean
        get() = status.equals("cancelled", ignoreCase = true) ||
                status.equals("cancelada", ignoreCase = true)

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
        get() = if (!isActive) "" else (
            qrCodeContent?.takeIf { it.isNotBlank() }
                ?: cuir?.let { "https://autamedica.com/verify/$it" }
                ?: ""
        )

    /**
     * Resolved list of items, falling back to primary medication if items list is empty.
     */
    val displayItems: List<PrescriptionItem>
        get() = if (items.isNotEmpty()) items else listOf(
            PrescriptionItem(
                medicationName = medicationName,
                dosage = dosage,
                frequency = frequency,
                duration = duration,
                instructions = instructions,
            )
        )
}

/**
 * Individual medication item in a digital prescription.
 */
data class PrescriptionItem(
    val medicationName: String,
    val genericName: String = "",
    val dosage: String,
    val frequency: String,
    val duration: String,
    val instructions: String = "",
)

/**
 * Request payload for doctors issuing a new digital prescription.
 */
data class CreatePrescriptionRequest(
    val patientId: String,
    val items: List<PrescriptionItem>,
    val diagnosis: String,
    val notes: String? = null,
    val countryCode: String = "AR",
)

/**
 * Doctor qualification and regulatory status for prescribing under Decreto 63 / SISA REFEPS.
 */
data class DoctorEligibility(
    val isEligible: Boolean,
    val doctorLicense: String?,
    val validationStatus: String?,
    val reason: String? = null,
)

/**
 * Selectable patient for prescription issuance.
 */
data class PrescriptionPatientItem(
    val patientId: String,
    val fullName: String,
    val dni: String? = null,
    val birthDate: String? = null,
)
