package com.autamedica.android.domain.model

data class PharmacyDispatchRequest(
    val id: String,
    // Present only on a physician-specific offer, not in the global waiting queue.
    val offerId: String? = null,
    val offerExpiresAt: String? = null,
    val careCountry: String? = null,
    /** Server-resolved referral provenance; never a browser-claimed partner ID. */
    val referralPartnerId: String? = null,
    val patientDni: String,
    val patientPhone: String,
    val patientName: String? = null,
    val tierRequested: String = "general",
    val symptomSummary: String? = null,
    val status: String = "searching",
    val assignedDoctorId: String? = null,
    val cloudflareRoomId: String,
    val createdAt: String,
) {
    val doctorAttendedCall: Boolean
        get() = status == "in_call"
}

data class DoctorGuardApproval(
    val approved: Boolean = false,
    val code: String = "DOCTOR_PENDING_CLINICAL_APPROVAL",
    val country: String? = null,
    val verificationStatus: String = "pending",
)

data class DoctorDutyStatus(
    val doctorId: String,
    val isOnDuty: Boolean = false,
    val activeTiers: List<String> = listOf("general"),
    val currentActiveRequestId: String? = null,
)

data class DispatchClaimResult(
    val success: Boolean,
    val code: String,
    val message: String? = null,
    val requestId: String? = null,
    val cloudflareRoomId: String? = null,
    val patientDni: String? = null,
    val patientPhone: String? = null,
    val tierRequested: String? = null,
)

fun dispatchTierLabel(tier: String): String = when (tier) {
    "cardiologia" -> "Cardiología"
    "salud_mental" -> "Salud Mental"
    "pediatria" -> "Pediatría"
    "dermatologia" -> "Dermatología"
    "traumatologia" -> "Traumatología"
    "salud_femenina" -> "Salud Femenina"
    "oftalmo_otorrino" -> "Oftalmo/Otorrino"
    "neumonologia" -> "Neumonología"
    "gastroenterologia" -> "Gastroenterología"
    "urologia" -> "Urología"
    "endocrinologia" -> "Endocrinología"
    else -> "Medicina General"
}