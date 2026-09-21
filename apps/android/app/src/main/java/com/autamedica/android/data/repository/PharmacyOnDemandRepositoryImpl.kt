package com.autamedica.android.data.repository

import com.autamedica.android.domain.model.DoctorOnDutyPharmacyState
import com.autamedica.android.domain.model.PharmacyClaimResult
import com.autamedica.android.domain.model.PharmacyConsultationRequest
import com.autamedica.android.domain.model.PharmacyConsultationStatus
import com.autamedica.android.domain.model.RequestStatusResponse
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

    override suspend fun createRequest(
        pharmacyId: String?,
        pharmacyName: String,
        patientDni: String,
        patientName: String,
        patientPhone: String,
        reason: String,
    ): Result<PharmacyConsultationRequest> = runCatching {
        // Automatically cancel any previous pending requests for this patient to ensure deduplication
        cancelActiveRequestsForPatient(patientDni, patientPhone)

        val validPharmacyUuid = pharmacyId?.trim()?.takeIf { isValidUuid(it) }
        val resolvedName = if (pharmacyName.isNotBlank() && !pharmacyName.equals("Farmacia", ignoreCase = true)) {
            pharmacyName.trim()
        } else if (validPharmacyUuid != null) {
            runCatching {
                supabaseClient.postgrest
                    .from("pharmacies")
                    .select(Columns.list("name")) { filter { eq("id", validPharmacyUuid) } }
                    .decodeSingleOrNull<PharmacyNameDto>()?.name
            }.getOrNull() ?: "Farmacia de Turno"
        } else {
            "Farmacia de Turno"
        }

        val inserted = supabaseClient.postgrest
            .from("pharmacy_consultation_requests")
            .insert(
                CreatePharmacyRequestPayload(
                    pharmacyId = validPharmacyUuid,
                    pharmacyName = resolvedName,
                    patientDni = patientDni.trim(),
                    patientName = patientName.trim(),
                    patientPhone = patientPhone.trim(),
                    reason = reason.trim(),
                    status = "pending",
                )
            ) {
                select(Columns.ALL)
            }
            .decodeSingle<PharmacyRequestDto>()

        inserted.toDomain()
    }.onFailure {
        SecureLog.error("[PharmacyOnDemandRepo] Failed creating pharmacy consultation request", it)
    }

    override suspend fun getRequestStatus(requestId: String): Result<RequestStatusResponse> = runCatching {
        val req = supabaseClient.postgrest
            .from("pharmacy_consultation_requests")
            .select(Columns.ALL) {
                filter { eq("id", requestId) }
            }
            .decodeSingleOrNull<PharmacyRequestDto>() ?: throw NoSuchElementException("Request $requestId not found")

        val parsedStatus = PharmacyConsultationStatus.fromString(req.status)
        var queuePos = 0
        if (parsedStatus == PharmacyConsultationStatus.PENDING) {
            val pendingList = runCatching {
                supabaseClient.postgrest
                    .from("pharmacy_consultation_requests")
                    .select(Columns.list("id", "patient_dni", "patient_phone", "created_at")) {
                        filter { eq("status", "pending") }
                        order("created_at", Order.ASCENDING)
                    }
                    .decodeList<PharmacyMiniQueueDto>()
            }.getOrDefault(emptyList())

            val currentPatientDni = req.patientDni.trim()
            val currentPatientPhone = req.patientPhone.trim()

            val idx = pendingList.indexOfFirst { it.id == requestId }
            if (idx >= 0) {
                // Count only distinct other patients waiting ahead of current request
                val ahead = pendingList.subList(0, idx).filter { item ->
                    val isSamePatient = (currentPatientDni.isNotEmpty() && item.patientDni.trim() == currentPatientDni) ||
                                       (currentPatientPhone.isNotEmpty() && item.patientPhone.trim() == currentPatientPhone)
                    !isSamePatient
                }
                val distinctPatientsAhead = ahead.distinctBy {
                    when {
                        it.patientDni.isNotBlank() -> it.patientDni.trim()
                        it.patientPhone.isNotBlank() -> it.patientPhone.trim()
                        else -> it.id
                    }
                }.size
                queuePos = distinctPatientsAhead + 1
            } else {
                queuePos = 1
            }
        }

        var doctorName: String? = null
        var doctorSpecialty: String? = null
        if (!req.doctorId.isNullOrBlank()) {
            runCatching {
                val doc = supabaseClient.postgrest
                    .from("doctors")
                    .select(Columns.list("id", "specialty", "user_id")) {
                        filter { eq("id", req.doctorId) }
                    }
                    .decodeSingleOrNull<DoctorSimpleDto>()
                doctorSpecialty = doc?.specialty ?: "Medicina General"
                val prof = doc?.userId?.let { uid ->
                    supabaseClient.postgrest
                        .from("profiles")
                        .select(Columns.list("first_name", "last_name")) {
                            filter { eq("user_id", uid) }
                        }
                        .decodeSingleOrNull<ProfileNameDto>()
                }
                doctorName = prof?.let { "Dr. ${it.firstName ?: ""} ${it.lastName ?: ""}".trim() } ?: "Médico de Guardia"
            }
        }

        val parsedCreated = runCatching { req.createdAt?.let { OffsetDateTime.parse(it) } }.getOrNull()

        RequestStatusResponse(
            id = req.id,
            status = parsedStatus,
            queuePosition = queuePos,
            pharmacyName = req.pharmacyName,
            patientName = req.patientName,
            reason = req.reason,
            roomId = req.roomId,
            guestInviteId = req.guestInviteId,
            patientJoinUrl = req.roomId?.let { "/call/join/$it" },
            doctorName = doctorName,
            doctorSpecialty = doctorSpecialty,
            createdAt = parsedCreated,
            assignedAt = null,
        )
    }.onFailure {
        SecureLog.error("[PharmacyOnDemandRepo] Failed fetching status for request $requestId", it)
    }

    override suspend fun cancelRequest(requestId: String): Result<Unit> = runCatching {
        supabaseClient.postgrest
            .from("pharmacy_consultation_requests")
            .update(mapOf("status" to "cancelled")) {
                filter { eq("id", requestId) }
            }
        Unit
    }.onFailure {
        SecureLog.error("[PharmacyOnDemandRepo] Failed cancelling request $requestId", it)
    }

    override suspend fun cancelActiveRequestsForPatient(patientDni: String, patientPhone: String): Result<Unit> = runCatching {
        val trimmedDni = patientDni.trim()
        val trimmedPhone = patientPhone.trim()

        if (trimmedDni.isNotBlank()) {
            supabaseClient.postgrest
                .from("pharmacy_consultation_requests")
                .update(mapOf("status" to "cancelled")) {
                    filter {
                        eq("patient_dni", trimmedDni)
                        eq("status", "pending")
                    }
                }
        }
        if (trimmedPhone.isNotBlank()) {
            supabaseClient.postgrest
                .from("pharmacy_consultation_requests")
                .update(mapOf("status" to "cancelled")) {
                    filter {
                        eq("patient_phone", trimmedPhone)
                        eq("status", "pending")
                    }
                }
        }
        Unit
    }.onFailure {
        SecureLog.error("[PharmacyOnDemandRepo] Failed cancelling active requests for patient DNI=$patientDni, Phone=$patientPhone", it)
    }

    private fun isValidUuid(str: String): Boolean =
        runCatching { java.util.UUID.fromString(str) }.isSuccess
}

@Serializable
internal data class CreatePharmacyRequestPayload(
    @SerialName("pharmacy_id") val pharmacyId: String?,
    @SerialName("pharmacy_name") val pharmacyName: String,
    @SerialName("patient_dni") val patientDni: String,
    @SerialName("patient_name") val patientName: String,
    @SerialName("patient_phone") val patientPhone: String,
    val reason: String,
    val status: String = "pending",
)

@Serializable
internal data class PharmacyNameDto(
    val name: String,
)

@Serializable
internal data class PharmacyMiniQueueDto(
    val id: String,
    @SerialName("patient_dni") val patientDni: String = "",
    @SerialName("patient_phone") val patientPhone: String = "",
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
internal data class DoctorSimpleDto(
    val id: String,
    val specialty: String? = null,
    @SerialName("user_id") val userId: String? = null,
)

@Serializable
internal data class ProfileNameDto(
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
)
