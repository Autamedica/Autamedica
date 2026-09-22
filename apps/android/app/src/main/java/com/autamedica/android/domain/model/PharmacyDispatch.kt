package com.autamedica.android.domain.model

data class PharmacyDispatchRequest(
    val id: String,
    val patientDni: String,
    val patientPhone: String,
    val patientName: String? = null,
    val tierRequested: String = "general",
    val symptomSummary: String? = null,
    val status: String = "searching",
    val assignedDoctorId: String? = null,
    val cloudflareRoomId: String,
    val createdAt: String,
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