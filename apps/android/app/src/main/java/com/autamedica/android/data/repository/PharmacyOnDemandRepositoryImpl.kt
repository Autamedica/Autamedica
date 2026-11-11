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
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
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
internal data class PharmacyRequestStatusDto(
    val found: Boolean = false,
    val id: String = "",
    val status: String = "pending",
    @SerialName("queue_position") val queuePosition: Int = 0,
    @SerialName("pharmacy_name") val pharmacyName: String = "",
    @SerialName("patient_name") val patientName: String = "",
    val reason: String = "",
    @SerialName("room_id") val roomId: String? = null,
    @SerialName("guest_invite_id") val guestInviteId: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("assigned_at") val assignedAt: String? = null,
    @SerialName("doctor_name") val doctorName: String? = null,
    @SerialName("doctor_specialty") val doctorSpecialty: String? = null,
)

@Serializable
internal data class CancelPharmacyRequestDto(
    val success: Boolean = false,
    val error: String? = null,
)

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

@Serializable
internal data class LegacyGuardApprovalDto(
    val approved: Boolean = false,
)

@Serializable
internal data class Gen2DutyTransitionDto(
    val success: Boolean = false,
    @SerialName("is_on_duty") val isOnDuty: Boolean = false,
)

@Serializable
internal data class Gen2DutyCheckDto(
    @SerialName("is_on_duty") val isOnDuty: Boolean = false,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Singleton
class PharmacyOnDemandRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val authRepository: AuthRepository,
) : PharmacyOnDemandRepository {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _onDutyFlow = MutableStateFlow(DoctorOnDutyPharmacyState())
    private var isRealtimeSubscribed = false
    @Volatile
    private var cachedDoctorId: String? = null

    init {
        subscribeToDispatchQueue()
    }

    private fun subscribeToDispatchQueue() {
        if (isRealtimeSubscribed) return
        isRealtimeSubscribed = true
        scope.launch {
            runCatching {
                val channel = supabaseClient.channel("pharmacy-dispatch-search-queue-legacy")
                val changeFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                    table = "pharmacy_dispatch_requests"
                }
                channel.subscribe()
                changeFlow.collect {
                    val currentStatus = getOnDutyStatus().getOrNull()
                    if (currentStatus != null && currentStatus.isOnDuty) {
                        val pending = getPendingQueue().getOrDefault(emptyList())
                        _onDutyFlow.value = currentStatus.copy(
                            waitingQueueCount = pending.size,
                            pendingRequests = pending
                        )
                    }
                }
            }.onFailure {
                SecureLog.error("[PharmacyOnDemandRepo] Realtime subscription error", it)
            }
        }
    }

    override fun observeOnDutyState(): Flow<DoctorOnDutyPharmacyState> = _onDutyFlow.asStateFlow()

    override suspend fun getOnDutyStatus(): Result<DoctorOnDutyPharmacyState> = runCatching {
        val user = authRepository.getCurrentUser() ?: throw IllegalStateException("Not authenticated")
        val doc = supabaseClient.postgrest
            .from("doctors")
            .select(Columns.list("id", "on_duty_pharmacy", "on_duty_since")) {
                filter { eq("user_id", user.id) }
            }
            .decodeSingleOrNull<DoctorDutyCheckDto>() ?: throw IllegalStateException("Doctor record not found")

        val gen2Duty = runCatching {
            supabaseClient.postgrest
                .from("doctor_duty_status")
                .select(Columns.list("is_on_duty", "updated_at")) {
                    filter { eq("doctor_id", doc.id) }
                }
                .decodeSingleOrNull<Gen2DutyCheckDto>()
        }.getOrNull()

        // Never fall back to the legacy doctors.on_duty_pharmacy flag: it
        // may have been set after a rejected RPC, before Admin approval.
        val eligible = runCatching {
            supabaseClient.postgrest
                .rpc("get_my_guard_approval")
                .decodeAs<LegacyGuardApprovalDto>()
                .approved
        }.getOrDefault(false)
        val effectiveOnDuty = eligible && gen2Duty?.isOnDuty == true
        val effectiveSince = runCatching {
            (gen2Duty?.updatedAt ?: doc.onDutySince)?.let { OffsetDateTime.parse(it) }
        }.getOrNull()

        val pending = getPendingQueue().getOrDefault(emptyList())

        val state = DoctorOnDutyPharmacyState(
            isOnDuty = effectiveOnDuty,
            onDutySince = effectiveSince,
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
        val doc = supabaseClient.postgrest
            .from("doctors")
            .select(Columns.list("id")) {
                filter { eq("user_id", user.id) }
            }
            .decodeSingleOrNull<DoctorDutyCheckDto>() ?: throw IllegalStateException("Doctor record not found")

        if (onDuty) {
            val approved = supabaseClient.postgrest
                .rpc("get_my_guard_approval")
                .decodeAs<LegacyGuardApprovalDto>()
                .approved
            check(approved) {
                "La matrícula todavía no fue validada por el administrador."
            }
        }

        // A rejected Gen 2 RPC is a failure. No legacy write can turn a
        // failed activation into a visually successful medical guard.
        val confirmed = supabaseClient.postgrest
            .rpc("set_doctor_duty_status", buildJsonObject {
                put("p_doctor_id", doc.id)
                put("p_is_on_duty", onDuty)
                put("p_active_tiers", JsonArray(listOf(JsonPrimitive("general"))))
            })
            .decodeAs<Gen2DutyTransitionDto>()
        check(confirmed.success && confirmed.isOnDuty == onDuty) {
            "El servidor no confirmó el estado de la guardia."
        }

        getOnDutyStatus().getOrThrow()
    }.onFailure {
        SecureLog.error("[PharmacyOnDemandRepo] Failed toggling on duty status", it)
    }

    override suspend fun getPendingQueue(): Result<List<PharmacyConsultationRequest>> = runCatching {
        // Do NOT expose the global patient queue or Gen 1 fallback.
        // The server returns only pending, unexpired offers to the
        // authenticated and ADMIN-APPROVED physician in this country.
        val dispatchDtos = supabaseClient.postgrest
            .rpc("get_my_pending_dispatch_offers")
            .decodeAs<List<PharmacyDispatchItemDto>>()
        dispatchDtos.map { it.toPharmacyConsultationRequest() }
    }.onFailure {
        SecureLog.error("[PharmacyOnDemandRepo] Failed fetching pending queue", it)
    }

    override suspend fun claimRequest(requestId: String): Result<PharmacyClaimResult> = runCatching {
        val user = authRepository.getCurrentUser() ?: throw IllegalStateException("Not authenticated")
        val effectiveDoctorId = cachedDoctorId ?: run {
            val d = supabaseClient.postgrest
                .from("doctors")
                .select(Columns.list("id")) {
                    filter { eq("user_id", user.id) }
                }
                .decodeSingleOrNull<DoctorDutyCheckDto>() ?: throw IllegalStateException("Doctor record not found")
            cachedDoctorId = d.id
            d.id
        }

        // Try Gen 2 atomic claim with SKIP LOCKED
        val rpcParams = buildJsonObject {
            put("p_request_id", requestId)
            put("p_doctor_id", effectiveDoctorId)
        }
        val rpcResult = runCatching {
            supabaseClient.postgrest
                .rpc("claim_pharmacy_request_tier", rpcParams)
                .decodeAs<DispatchClaimRpcDto>()
        }.getOrNull()

        if (rpcResult != null && rpcResult.success && !rpcResult.cloudflareRoomId.isNullOrBlank()) {
            val roomId = rpcResult.cloudflareRoomId
            return@runCatching PharmacyClaimResult(
                requestId = requestId,
                callId = requestId,
                roomId = roomId,
                guestInviteId = "",
                doctorRoomUrl = "/doctors/call/$roomId",
                patientJoinUrl = "/call/join/$roomId"
            )
        }

        val rpcRefused = rpcResult?.code?.takeIf { it.isNotBlank() } ?: "CLAIM_RPC_UNAVAILABLE"

        // Propagate real clinical failure when Gen 2 atomic claim does not succeed
        val userFriendlyMessage = rpcResult?.message?.takeIf { it.isNotBlank() }
            ?: when (rpcRefused) {
                "DOCTOR_ALREADY_IN_CALL" -> "Ya tienes una consulta activa en curso. Finalízala antes de aceptar otra."
                "DOCTOR_NOT_ON_DUTY" -> "Debes activar tu estado En Servicio para tomar consultas."
                "REQUEST_ALREADY_CLAIMED_OR_EXPIRED" -> "La consulta ya fue asignada a otro colega o expiró el tiempo de espera."
                "TIER_MISMATCH" -> "Esta consulta requiere una especialidad no configurada en tu guardia."
                else -> "No se pudo tomar la consulta ($rpcRefused)"
            }
        throw IllegalStateException(userFriendlyMessage)
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
        val validPharmacyUuid = pharmacyId?.trim()?.takeIf { isValidUuid(it) }
        val resolvedName = pharmacyName.trim().ifBlank { "Farmacia de Turno" }

        // Public guest intake is handled by a SECURITY DEFINER RPC. Direct table
        // INSERT/SELECT is intentionally revoked so guests cannot enumerate requests.
        val inserted = supabaseClient.postgrest
            .rpc("create_pharmacy_consultation_request", buildJsonObject {
                put("p_pharmacy_id", validPharmacyUuid?.let { JsonPrimitive(it) } ?: JsonNull)
                put("p_pharmacy_name", resolvedName)
                put("p_patient_dni", patientDni.trim())
                put("p_patient_name", patientName.trim())
                put("p_patient_phone", patientPhone.trim())
                put("p_reason", reason.trim())
            })
            .decodeAs<PharmacyRequestDto>()

        inserted.toDomain()
    }.onFailure {
        SecureLog.error("[PharmacyOnDemandRepo] Failed creating pharmacy consultation request", it)
    }

    override suspend fun getRequestStatus(requestId: String): Result<RequestStatusResponse> = runCatching {
        // The UUID is an opaque bearer capability. The RPC returns only this
        // request's status; it never grants table-wide guest SELECT.
        val status = supabaseClient.postgrest
            .rpc("get_pharmacy_consultation_request_status", buildJsonObject {
                put("p_request_id", requestId)
            })
            .decodeAs<PharmacyRequestStatusDto>()

        if (!status.found) throw NoSuchElementException("Request $requestId not found")

        val createdAt = runCatching { status.createdAt?.let { OffsetDateTime.parse(it) } }.getOrNull()
        val assignedAt = runCatching { status.assignedAt?.let { OffsetDateTime.parse(it) } }.getOrNull()
        val patientJoinUrl = status.roomId?.let { roomId ->
            status.guestInviteId?.let { inviteId -> "/call/join/$roomId?invite=$inviteId" }
                ?: "/call/join/$roomId"
        }

        RequestStatusResponse(
            id = status.id,
            status = PharmacyConsultationStatus.fromString(status.status),
            queuePosition = status.queuePosition,
            pharmacyName = status.pharmacyName,
            patientName = status.patientName,
            reason = status.reason,
            roomId = status.roomId,
            guestInviteId = status.guestInviteId,
            patientJoinUrl = patientJoinUrl,
            doctorName = status.doctorName,
            doctorSpecialty = status.doctorSpecialty,
            createdAt = createdAt,
            assignedAt = assignedAt,
        )
    }.onFailure {
        SecureLog.error("[PharmacyOnDemandRepo] Failed fetching status for request $requestId", it)
    }

    override suspend fun cancelRequest(requestId: String): Result<Unit> = runCatching {
        val result = supabaseClient.postgrest
            .rpc("cancel_pharmacy_consultation_request", buildJsonObject {
                put("p_request_id", requestId)
                put("p_reason", "cancelled_by_user")
            })
            .decodeAs<CancelPharmacyRequestDto>()
        check(result.success) { result.error ?: "request_not_found_or_not_pending" }
        Unit
    }.onFailure {
        SecureLog.error("[PharmacyOnDemandRepo] Failed cancelling request $requestId", it)
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

@Serializable
private data class PharmacyDispatchItemDto(
    val id: String,
    @SerialName("patient_dni") val patientDni: String? = null,
    @SerialName("patient_cpf") val patientCpf: String? = null,
    @SerialName("care_country") val careCountry: String? = null,
    @SerialName("patient_phone") val patientPhone: String = "",
    @SerialName("patient_name") val patientName: String? = null,
    @SerialName("tier_requested") val tierRequested: String = "general",
    @SerialName("symptom_summary") val symptomSummary: String? = null,
    val status: String = "searching",
    @SerialName("cloudflare_room_id") val cloudflareRoomId: String = "",
    @SerialName("created_at") val createdAt: String? = null,
) {
    fun toPharmacyConsultationRequest(): PharmacyConsultationRequest {
        val created = runCatching { createdAt?.let { OffsetDateTime.parse(it) } }.getOrNull()
        val mins = created?.let {
            Duration.between(it, OffsetDateTime.now()).toMinutes().coerceAtLeast(0)
        } ?: 0L
        return PharmacyConsultationRequest(
            id = id,
            pharmacyId = null,
            pharmacyName = "Farmacia de Guardia",
            patientDni = if (careCountry == "BR") patientCpf.orEmpty() else patientDni.orEmpty(),
            patientName = patientName?.ifBlank { null } ?: "Paciente en espera",
            patientPhone = patientPhone,
            reason = symptomSummary?.ifBlank { null } ?: "Motivo no especificado",
            status = PharmacyConsultationStatus.PENDING,
            roomId = cloudflareRoomId,
            createdAt = created,
            minutesWaiting = mins,
        )
    }
}
