package com.autamedica.android.navigation

import kotlinx.serialization.Serializable

const val VIDEO_PREVIEW_APPOINTMENT_ID = "__preview__"

sealed interface Route {

    @Serializable
    data object Login : Route

    @Serializable
    data class Register(
        val initialRole: String = "patient",
    ) : Route

    @Serializable
    data object ForgotPassword : Route
    
    @Serializable
    data class Consent(val appointmentId: String = "") : Route
    
    @Serializable
    data object AdverseEvents : Route

    @Serializable
    data object PsychiatryIntake : Route

    @Serializable
    data object Main : Route

    @Serializable
    data object PatientProfile : Route

    @Serializable
    data class VideoCall(
        val appointmentId: String,
        val roomId: String = "",
        val isIncomingCall: Boolean = false,
    ) : Route

    @Serializable
    data class PatientDetail(
        val patientId: String,
    ) : Route

    @Serializable
    data object ChatList : Route

    @Serializable
    data class ChatConversation(
        val chatId: String,
    ) : Route

    @Serializable
    data object AnamnesisForm : Route

    @Serializable
    data object PreventiveHealth : Route

    @Serializable
    data object ContinuityStatus : Route

    @Serializable
    data object ConsultationReports : Route

    @Serializable
    data object Prescriptions : Route

    @Serializable
    data object ClinicalDocuments : Route

    @Serializable
    data object ReproductiveHealth : Route

    @Serializable
    data object PatientCommunity : Route

    @Serializable
    data object DoctorAgenda : Route

    @Serializable
    data object DoctorPrescriptions : Route

    @Serializable
    data class CreatePrescription(val patientId: String = "") : Route

    @Serializable
    data object DoctorCertificates : Route

    @Serializable
    data class CreateCertificate(val patientId: String = "") : Route

    @Serializable
    data object DoctorMedicalOrders : Route

    @Serializable
    data class CreateMedicalOrder(val patientId: String = "") : Route

    @Serializable
    data object DoctorSignature : Route

    @Serializable
    data class DoctorConsultationReport(val appointmentId: String = "") : Route

    @Serializable
    data object DoctorAccounting : Route

    @Serializable
    data object TdahEvaluation : Route

    @Serializable
    data class PharmacyIntake(val pharmacyId: String = "", val referralCode: String = "") : Route

    @Serializable
    data object DoctorOnDemand : Route
}
