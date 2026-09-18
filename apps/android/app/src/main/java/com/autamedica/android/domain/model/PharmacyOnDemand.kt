package com.autamedica.android.domain.model

import java.time.OffsetDateTime

enum class PharmacyConsultationStatus {
    PENDING,
    ASSIGNED,
    IN_CALL,
    COMPLETED,
    CANCELLED,
    EXPIRED;

    companion object {
        fun fromString(value: String): PharmacyConsultationStatus {
            return entries.firstOrNull { it.name.equals(value, ignoreCase = true) } ?: PENDING
        }
    }
}

data class PharmacyConsultationRequest(
    val id: String,
    val pharmacyId: String? = null,
    val pharmacyName: String,
    val patientDni: String,
    val patientName: String,
    val patientPhone: String,
    val reason: String,
    val status: PharmacyConsultationStatus = PharmacyConsultationStatus.PENDING,
    val doctorId: String? = null,
    val callId: String? = null,
    val roomId: String? = null,
    val guestInviteId: String? = null,
    val createdAt: OffsetDateTime? = null,
    val minutesWaiting: Long = 0,
)

data class DoctorOnDutyPharmacyState(
    val isOnDuty: Boolean = false,
    val onDutySince: OffsetDateTime? = null,
    val activeSessionId: String? = null,
    val waitingQueueCount: Int = 0,
    val pendingRequests: List<PharmacyConsultationRequest> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

data class PharmacyClaimResult(
    val requestId: String,
    val callId: String,
    val roomId: String,
    val guestInviteId: String,
    val doctorRoomUrl: String,
    val patientJoinUrl: String,
)
