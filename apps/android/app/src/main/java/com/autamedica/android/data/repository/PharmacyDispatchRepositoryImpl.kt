package com.autamedica.android.data.repository

import com.autamedica.android.di.IoDispatcher
import com.autamedica.android.domain.model.DispatchClaimResult
import com.autamedica.android.domain.model.DoctorDutyStatus
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PharmacyDispatchRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val authRepository: AuthRepository,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) : PharmacyDispatchRepository {

    private val scope = CoroutineScope(SupervisorJob() + ioDispatcher)

    private val _searchingRequests = MutableStateFlow<List<PharmacyDispatchRequest>>(emptyList())
    private var searchingChannel: RealtimeChannel? = null

    override suspend fun getDoctorDutyStatus(doctorId: String): Result<DoctorDutyStatus> = runCatching {
        supabaseClient.postgrest
            .from("doctor_duty_status")
            .select(Columns.ALL) {
                filter { eq("doctor_id", doctorId) }
            }
            .decodeSingleOrNull<DoctorDutyStatusDto>()
            ?.toDomain()
            ?: DoctorDutyStatus(doctorId = doctorId)
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Failed fetching duty status", it)
    }

    override suspend fun setDoctorDutyStatus(
        doctorId: String,
        isOnDuty: Boolean,
        activeTiers: List<String>,
    ): Result<Unit> = runCatching {
        val params = buildJsonObject {
            put("p_doctor_id", doctorId)
            put("p_is_on_duty", isOnDuty)
            put("p_active_tiers", JsonArray(activeTiers.map { JsonPrimitive(it) }))
        }
        supabaseClient.postgrest.rpc("set_doctor_duty_status", params)
        Unit
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Failed setting duty status", it)
    }

    override suspend fun sendDoctorHeartbeat(doctorId: String): Result<Unit> = runCatching {
        val params = buildJsonObject {
            put("p_doctor_id", doctorId)
        }
        supabaseClient.postgrest.rpc("doctor_heartbeat", params)
        Unit
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Failed sending doctor heartbeat", it)
    }

    override fun observeSearchingRequests(): kotlinx.coroutines.flow.StateFlow<List<PharmacyDispatchRequest>> {
        scope.launch { loadSearchingRequests() }
        scope.launch { subscribeToSearchingQueue() }
        return _searchingRequests.asStateFlow()
    }

    override fun observeIncomingOffers(): kotlinx.coroutines.flow.StateFlow<List<PharmacyDispatchRequest>> =
        observeSearchingRequests()

    override val incomingOffers: kotlinx.coroutines.flow.StateFlow<List<PharmacyDispatchRequest>>
        get() = observeSearchingRequests()

    override suspend fun claimPharmacyRequest(
        requestId: String,
        doctorId: String,
    ): Result<DispatchClaimResult> = runCatching {
        val params = buildJsonObject {
            put("p_request_id", requestId)
            put("p_doctor_id", doctorId)
        }
        val dto = supabaseClient.postgrest
            .rpc("claim_pharmacy_request_tier", params)
            .decodeAs<DispatchClaimRpcDto>()
        dto.toDomain()
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Failed claiming request", it)
    }

    override suspend fun updateDispatchRequestStatus(
        requestId: String,
        status: String,
    ): Result<Unit> = runCatching {
        val updates = buildMap {
            put("status", status)
            if (status == "in_call") put("call_started_at", java.time.OffsetDateTime.now().toString())
            if (status == "completed") put("call_ended_at", java.time.OffsetDateTime.now().toString())
        }
        supabaseClient.postgrest
            .from("pharmacy_dispatch_requests")
            .update(updates) {
                filter { eq("id", requestId) }
            }
        Unit
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Failed updating request status", it)
    }

    override suspend fun finishPharmacyRequest(
        doctorId: String,
        requestId: String,
    ): Result<Unit> = runCatching {
        val rpcParams = buildJsonObject {
            put("p_doctor_id", doctorId)
            if (requestId.isNotBlank()) put("p_request_id", requestId)
        }
        val rpcSuccess = runCatching {
            supabaseClient.postgrest.rpc("finish_pharmacy_consultation", rpcParams)
        }.isSuccess

        if (!rpcSuccess) {
            supabaseClient.postgrest
                .from("pharmacy_dispatch_requests")
                .update(mapOf("status" to "completed", "call_ended_at" to java.time.OffsetDateTime.now().toString())) {
                    filter { eq("id", requestId) }
                }

            supabaseClient.postgrest
                .from("doctor_duty_status")
                .update(mapOf("current_active_request_id" to null, "updated_at" to java.time.OffsetDateTime.now().toString())) {
                    filter { eq("doctor_id", doctorId) }
                }
        }
        Unit
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Failed finishing request", it)
    }

    override suspend fun createPatientDispatchRequest(
        patientDni: String,
        patientPhone: String,
        patientName: String?,
        tierRequested: String,
        symptomSummary: String?,
        patientCpf: String?,
    ): Result<PharmacyDispatchRequest> = runCatching {
        val sanitizedDni = patientDni.replace("\\D".toRegex(), "").takeLast(4).ifEmpty { "0000" }
        val randomSuffix = java.util.UUID.randomUUID().toString().take(5)
        val timestamp = System.currentTimeMillis().toString(36)
        val cloudflareRoomId = "cf-room-$tierRequested-$sanitizedDni-$timestamp-$randomSuffix"

        val payload = buildJsonObject {
            put("patient_dni", patientDni.trim())
            put("patient_phone", patientPhone.trim())
            if (!patientName.isNullOrBlank()) {
                put("patient_name", patientName.trim())
            }
            if (!patientCpf.isNullOrBlank()) {
                put("patient_cpf", patientCpf.trim())
            }
            put("tier_requested", tierRequested.ifBlank { "general" })
            if (!symptomSummary.isNullOrBlank()) {
                put("symptom_summary", symptomSummary.trim())
            }
            put("cloudflare_room_id", cloudflareRoomId)
            put("status", "searching")
            authRepository.getCurrentUser()?.id?.let { put("requested_by_user_id", it) }
        }

        val dto = supabaseClient.postgrest
            .from("pharmacy_dispatch_requests")
            .insert(payload) {
                select(Columns.ALL)
            }
            .decodeSingle<DispatchRequestDto>()

        dto.toDomain()
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Failed creating patient dispatch request", it)
    }

    override fun observePatientRequest(requestId: String): kotlinx.coroutines.flow.Flow<PharmacyDispatchRequest> = kotlinx.coroutines.flow.callbackFlow {
        val channel = supabaseClient.channel("dispatch_request_$requestId")
        val changeFlow = channel.postgresChangeFlow<PostgresAction>(
            schema = "public",
        ) {
            table = "pharmacy_dispatch_requests"
        }

        suspend fun fetchCurrent() {
            runCatching {
                supabaseClient.postgrest
                    .from("pharmacy_dispatch_requests")
                    .select(Columns.ALL) {
                        filter { eq("id", requestId) }
                    }
                    .decodeSingleOrNull<DispatchRequestDto>()
                    ?.toDomain()
            }.getOrNull()?.let { trySend(it) }
        }

        // Emit initial state if available
        launch { fetchCurrent() }

        // Realtime change collection
        val realtimeJob = launch {
            changeFlow.collect {
                fetchCurrent()
            }
        }

        // Polling ticker fallback (3000ms): guarantees state updates even if websocket reconnects/lags
        val pollJob = launch {
            while (isActive) {
                delay(3000L)
                fetchCurrent()
            }
        }

        channel.subscribe()

        awaitClose {
            realtimeJob.cancel()
            pollJob.cancel()
            launch { supabaseClient.realtime.removeChannel(channel) }
        }
    }

    override suspend fun getActiveOnDutyDoctors(): Result<List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo>> = runCatching {
        supabaseClient.postgrest
            .rpc("get_active_on_duty_doctors")
            .decodeAs<List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo>>()
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Failed fetching active on-duty doctors", it)
    }

    override fun observeActiveOnDutyDoctors(): Flow<List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo>> = callbackFlow {
        val channel = supabaseClient.channel("doctor_duty_realtime")
        val changeFlow = channel.postgresChangeFlow<PostgresAction>(
            schema = "public",
        ) {
            table = "doctor_duty_status"
        }

        suspend fun fetchCurrent() {
            runCatching {
                supabaseClient.postgrest
                    .rpc("get_active_on_duty_doctors")
                    .decodeAs<List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo>>()
            }.onSuccess { docs ->
                trySend(docs)
            }.onFailure { err ->
                SecureLog.error("[PharmacyDispatch] Failed fetching active on-duty doctors in realtime stream", err)
            }
        }

        // Emit initial state immediately
        launch { fetchCurrent() }

        // Realtime change collection (INSERT, UPDATE, DELETE)
        val realtimeJob = launch {
            changeFlow.collect {
                fetchCurrent()
            }
        }

        // Polling ticker fallback (2 seconds): guarantees updates even if websocket reconnects/lags
        val pollJob = launch {
            while (isActive) {
                delay(2000L)
                fetchCurrent()
            }
        }

        channel.subscribe()

        awaitClose {
            realtimeJob.cancel()
            pollJob.cancel()
            launch { supabaseClient.realtime.removeChannel(channel) }
        }
    }

    // ────────────────────────────────────────────────────────────
    //  Internals
    // ────────────────────────────────────────────────────────────

    private suspend fun loadSearchingRequests() {
        runCatching {
            val dtos = supabaseClient.postgrest
                .from("pharmacy_dispatch_requests")
                .select(Columns.ALL) {
                    filter { eq("status", "searching") }
                    order("created_at", Order.ASCENDING)
                }
                .decodeList<DispatchRequestDto>()
            _searchingRequests.value = dtos.map { it.toDomain() }
        }.onFailure {
            SecureLog.error("[PharmacyDispatch] Failed loading searching requests", it)
        }
    }

    private suspend fun subscribeToSearchingQueue() {
        if (searchingChannel != null) return

        runCatching {
            val channel = supabaseClient.channel("pharmacy-dispatch-search-queue")
            val changeFlow = channel.postgresChangeFlow<PostgresAction>(
                schema = "public",
            ) {
                table = "pharmacy_dispatch_requests"
            }

            channel.subscribe()
            searchingChannel = channel

            changeFlow.collect {
                Timber.d("[PharmacyDispatch] Realtime dispatch update: ${it::class.simpleName}")
                loadSearchingRequests()
            }
        }.onFailure {
            SecureLog.error("[PharmacyDispatch] Failed subscribing to searching queue", it)
        }
    }
}

// ── DTOs ────────────────────────────────────────────────────

@Serializable
private data class DoctorDutyStatusDto(
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("is_on_duty") val isOnDuty: Boolean = false,
    @SerialName("active_tiers") val activeTiers: List<String> = listOf("general"),
    @SerialName("current_active_request_id") val currentActiveRequestId: String? = null,
) {
    fun toDomain() = DoctorDutyStatus(
        doctorId = doctorId,
        isOnDuty = isOnDuty,
        activeTiers = activeTiers.ifEmpty { listOf("general") },
        currentActiveRequestId = currentActiveRequestId,
    )
}

@Serializable
private data class DispatchRequestDto(
    val id: String,
    @SerialName("patient_dni") val patientDni: String,
    @SerialName("patient_phone") val patientPhone: String,
    @SerialName("patient_name") val patientName: String? = null,
    @SerialName("tier_requested") val tierRequested: String = "general",
    @SerialName("symptom_summary") val symptomSummary: String? = null,
    val status: String = "searching",
    @SerialName("assigned_doctor_id") val assignedDoctorId: String? = null,
    @SerialName("cloudflare_room_id") val cloudflareRoomId: String,
    @SerialName("created_at") val createdAt: String,
) {
    fun toDomain() = PharmacyDispatchRequest(
        id = id,
        patientDni = patientDni,
        patientPhone = patientPhone,
        patientName = patientName,
        tierRequested = tierRequested,
        symptomSummary = symptomSummary,
        status = status,
        assignedDoctorId = assignedDoctorId,
        cloudflareRoomId = cloudflareRoomId,
        createdAt = createdAt,
    )
}

@Serializable
internal data class DispatchClaimRpcDto(
    val success: Boolean = false,
    val code: String = "",
    val message: String? = null,
    @SerialName("request_id") val requestId: String? = null,
    @SerialName("cloudflare_room_id") val cloudflareRoomId: String? = null,
    @SerialName("patient_dni") val patientDni: String? = null,
    @SerialName("patient_phone") val patientPhone: String? = null,
    @SerialName("tier_requested") val tierRequested: String? = null,
) {
    fun toDomain() = DispatchClaimResult(
        success = success,
        code = code,
        message = message,
        requestId = requestId,
        cloudflareRoomId = cloudflareRoomId,
        patientDni = patientDni,
        patientPhone = patientPhone,
        tierRequested = tierRequested,
    )
}