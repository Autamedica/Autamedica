package com.autamedica.android.data.repository

import com.autamedica.android.domain.model.DoctorOnDutyPharmacyState
import com.autamedica.android.domain.model.PharmacyClaimResult
import com.autamedica.android.domain.model.PharmacyConsultationRequest
import com.autamedica.android.domain.model.PharmacyConsultationStatus
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.PharmacyOnDemandRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Duration
import java.time.OffsetDateTime
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
internal data class PharmacyRequestDto(
    val id: String,
    @SerialName("pharmacy_id") val pharmacyId: String? = null,
    @SerialName("pharmacy_name") val pharmacyName: String = "",
    @SerialName("patient_dni") val patientDni: String = "",
    @SerialName("patient_name") val patientName: String = "",
    @SerialName("patient_phone") val patientPhone: String = "",
    val reason: String = "",
    val status: String = "pending",
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("call_id") val callId: String? = null,
    @SerialName("room_id") val roomId: String? = null,
    @SerialName("guest_invite_id") val guestInviteId: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
) {
    fun toDomain(): PharmacyConsultationRequest {
        val parsedCreated = runCatching { createdAt?.let { OffsetDateTime.parse(it) } }.getOrNull()
        val minutesWaiting = if (parsedCreated != null) {
            Duration.between(parsedCreated, OffsetDateTime.now()).toMinutes().coerceAtLeast(0)
        } else 0

        return PharmacyConsultationRequest(
            id = id,
            pharmacyId = pharmacyId,
            pharmacyName = pharmacyName,
            patientDni = patientDni,
            patientName = patientName,
            patientPhone = patientPhone,
            reason = reason,
            status = PharmacyConsultationStatus.fromString(status),
            doctorId = doctorId,
            callId = callId,
            roomId = roomId,
            guestInviteId = guestInviteId,
            createdAt = parsedCreated,
            minutesWaiting = minutesWaiting,
        )
    }
}

@Serializable
internal data class DoctorDutyUpdateDto(
    @SerialName("on_duty_pharmacy") val onDutyPharmacy: Boolean,
    @SerialName("on_duty_since") val onDutySince: String?,
)

@Serializable
internal data class DoctorDutyCheckDto(
    val id: String,
    @SerialName("on_duty_pharmacy") val onDutyPharmacy: Boolean = false,
    @SerialName("on_duty_since") val onDutySince: String? = null,
)

@Singleton
class PharmacyOnDemandRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val authRepository: AuthRepository,
) : PharmacyOnDemandRepository {

    private val _onDutyFlow = MutableStateFlow(DoctorOnDutyPharmacyState())

    override fun observeOnDutyState(): Flow<DoctorOnDutyPharmacyState> = _onDutyFlow.asStateFlow()

    override suspend fun getOnDutyStatus(): Result<DoctorOnDutyPharmacyState> = runCatching {
        val user = authRepository.getCurrentUser() ?: throw IllegalStateException("Not authenticated")
        val doc = supabaseClient.postgrest
            .from("doctors")
            .select(Columns.list("id", "on_duty_pharmacy", "on_duty_since")) {
                filter { eq("user_id", user.id) }
            }
            .decodeSingleOrNull<DoctorDutyCheckDto>() ?: throw IllegalStateException("Doctor record not found")

        val pending = getPendingQueue().getOrDefault(emptyList())

        val state = DoctorOnDutyPharmacyState(
            isOnDuty = doc.onDutyPharmacy,
            onDutySince = runCatching { doc.onDutySince?.let { OffsetDateTime.parse(it) } }.getOrNull(),
            waitingQueueCount = pending.size,
            pendingRequests = pending,
            isLoading = false
        )
        _onDutyFlow.value = state
        state
    }.onFailure {
        SecureLog.error("[PharmacyOnDemandRepo] Failed fetching on duty status", it)
    }

    override suspend fun toggleOnDuty(onDuty: Boolean): Result<DoctorOnDutyPharmacyState> = runCatching {
        val user = authRepository.getCurrentUser() ?: throw IllegalStateException("Not authenticated")
        val now = if (onDuty) OffsetDateTime.now().toString() else null

        supabaseClient.postgrest
            .from("doctors")
            .update(
                DoctorDutyUpdateDto(
                    onDutyPharmacy = onDuty,
                    onDutySince = now
                )
            ) {
                filter { eq("user_id", user.id) }
            }

        getOnDutyStatus().getOrThrow()
    }.onFailure {
        SecureLog.error("[PharmacyOnDemandRepo] Failed toggling on duty status", it)
    }

    override suspend fun getPendingQueue(): Result<List<PharmacyConsultationRequest>> = runCatching {
        val dtos = supabaseClient.postgrest
            .from("pharmacy_consultation_requests")
            .select(Columns.ALL) {
                filter { eq("status", "pending") }
                order("created_at", Order.ASCENDING)
            }
            .decodeList<PharmacyRequestDto>()

        dtos.map { it.toDomain() }
    }.onFailure {
        SecureLog.error("[PharmacyOnDemandRepo] Failed fetching pending queue", it)
    }

    override suspend fun claimRequest(requestId: String): Result<PharmacyClaimResult> = runCatching {
        val user = authRepository.getCurrentUser() ?: throw IllegalStateException("Not authenticated")
        val doc = supabaseClient.postgrest
            .from("doctors")
            .select(Columns.list("id")) {
                filter { eq("user_id", user.id) }
            }
            .decodeSingleOrNull<DoctorDutyCheckDto>() ?: throw IllegalStateException("Doctor record not found")

        val uniqueRoomId = "room_pharmacy_" + java.util.UUID.randomUUID().toString().substring(0, 8)
        val now = OffsetDateTime.now().toString()

        supabaseClient.postgrest
            .from("pharmacy_consultation_requests")
            .update(
                mapOf(
                    "status" to "assigned",
                    "doctor_id" to doc.id,
                    "room_id" to uniqueRoomId,
                    "assigned_at" to now
                )
            ) {
                filter {
                    eq("id", requestId)
                    eq("status", "pending")
                }
            }

        PharmacyClaimResult(
            requestId = requestId,
            callId = requestId,
            roomId = uniqueRoomId,
            guestInviteId = "",
            doctorRoomUrl = "/doctors/call/$uniqueRoomId",
            patientJoinUrl = "/call/join/$uniqueRoomId"
        )
    }.onFailure {
        SecureLog.error("[PharmacyOnDemandRepo] Failed claiming request $requestId", it)
    }
}
