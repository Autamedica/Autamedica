package com.autamedica.android.data.repository

import com.autamedica.android.BuildConfig
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.ConcurrentHashMap
import com.autamedica.android.di.IoDispatcher
import com.autamedica.android.domain.model.DispatchClaimResult
import com.autamedica.android.domain.model.DoctorDutyStatus
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
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
    private val httpClient: OkHttpClient,
    private val json: Json,
) : PharmacyDispatchRepository {

    private val scope = CoroutineScope(SupervisorJob() + ioDispatcher)

    private val _searchingRequests = MutableStateFlow<List<PharmacyDispatchRequest>>(emptyList())
    private var searchingChannel: RealtimeChannel? = null

    // Never write guest access tokens to logs, analytics or persistent storage.
    private val guestAccessTokens = ConcurrentHashMap<String, String>()
    // The shared DEBUG HTTP client logs BODY and headers; this isolated client
    // removes logging interceptors to protect names, DNI, symptoms and tokens.
    private val guestClient: OkHttpClient by lazy {
        httpClient.newBuilder().apply {
            interceptors().removeAll { it is HttpLoggingInterceptor }
            networkInterceptors().removeAll { it is HttpLoggingInterceptor }
        }.build()
    }
    // Visible to the repository's MockWebServer tests; production defaults to WEB_API_URL.
    internal var guestApiOrigin = BuildConfig.WEB_API_URL.trimEnd('/')

    private suspend fun createGuestRequestViaSignedApi(payload: kotlinx.serialization.json.JsonObject): PharmacyDispatchRequest =
        withContext(ioDispatcher) {
            val request = Request.Builder()
                .url("$guestApiOrigin/api/pharmacy/dispatch/request")
                .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()

            guestClient.newCall(request).execute().use { response ->
                check(response.isSuccessful) { "Guest dispatch API rejected intake (HTTP ${response.code})" }
                val body = response.body?.string() ?: error("Empty guest dispatch API response")
                val root = json.parseToJsonElement(body).jsonObject
                val data = root["data"]?.jsonObject ?: error("Missing signed dispatch response payload")
                val dto = json.decodeFromJsonElement<DispatchRequestDto>(
                    data["request"] ?: error("Missing signed dispatch request")
                )
                val token = data["accessToken"]?.jsonPrimitive?.content
                    ?.takeIf { it.isNotBlank() } ?: error("Missing signed guest access token")
                guestAccessTokens[dto.id] = token
                dto.toDomain()
            }
        }

    private suspend fun fetchGuestRequestViaSignedApi(requestId: String, token: String): PharmacyDispatchRequest? =
        withContext(ioDispatcher) {
            // Never place the signed guest token in a URL or in request logs.
            val request = Request.Builder()
                .url("$guestApiOrigin/api/pharmacy/dispatch/$requestId")
                .header("Authorization", "Bearer $token")
                .get()
                .build()

            guestClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val body = response.body?.string() ?: return@withContext null
                val data = json.parseToJsonElement(body).jsonObject["data"]?.jsonObject
                    ?: return@withContext null
                val dto = json.decodeFromJsonElement<DispatchRequestDto>(
                    data["request"] ?: return@withContext null
                )
                dto.toDomain()
            }
        }

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
        // A cached doctor profile is not proof of an authenticated Supabase session.
        // Never send a clinical heartbeat with the anonymous API credential.
        check(!supabaseClient.auth.currentSessionOrNull()?.accessToken.isNullOrBlank()) {
            "Authenticated doctor session required for heartbeat"
        }
        val params = buildJsonObject {
            put("p_doctor_id", doctorId)
        }
        supabaseClient.postgrest.rpc("doctor_heartbeat", params)
        Unit
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Failed sending doctor heartbeat", it)
    }

    override fun observeSearchingRequests(): kotlinx.coroutines.flow.StateFlow<List<PharmacyDispatchRequest>> {
        // This stream is NOT a country-wide clinical waiting list. Only the
        // server-authorized physician's offers are returned (least privilege).
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

    /**
     * A patient may only leave the waiting queue after a confirmed cancellation.
     * Guests use the room-bound token returned by the signed intake API. Authenticated
     * owners use their own Supabase session with RLS and a searching-only condition.
     */
    override suspend fun cancelPatientDispatchRequest(requestId: String): Result<Boolean> = runCatching {
        require(requestId.isNotBlank()) { "Missing request ID" }
        val guestToken = guestAccessTokens[requestId]
        if (guestToken != null) {
            val payload = buildJsonObject {
                put("requestId", requestId)
                put("accessToken", guestToken)
            }
            val request = Request.Builder()
                .url("$guestApiOrigin/api/pharmacy/on-demand/cancel")
                .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()
            val confirmed = withContext(ioDispatcher) {
                guestClient.newCall(request).execute().use { response ->
                    check(response.isSuccessful) { "Guest cancellation API returned HTTP ${response.code}" }
                    val data = json.parseToJsonElement(response.body?.string() ?: error("Empty cancellation response"))
                        .jsonObject["data"]?.jsonObject ?: error("Missing cancellation response data")
                    val answer = data["cancelled"]?.jsonPrimitive?.content
                    check(answer == "true" || answer == "false") { "Missing cancellation confirmation" }
                    answer == "true"
                }
            }
            if (confirmed) guestAccessTokens.remove(requestId)
            confirmed
        } else {
            check(authRepository.getCurrentUser() != null) { "Missing authenticated owner or guest token" }
            val result = supabaseClient.postgrest
                .from("pharmacy_dispatch_requests")
                .update(buildJsonObject { put("status", "cancelled") }) {
                    filter {
                        eq("id", requestId)
                        eq("status", "searching")
                    }
                    select(Columns.list("id"))
                }
                .decodeSingleOrNull<CancelledDispatchRequestDto>()
            result != null
        }
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Patient cancellation not confirmed", it)
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
        // The server RPC is the authorization boundary. Never fall back to
        // direct clinical writes when it rejects a request.
        supabaseClient.postgrest.rpc("finish_pharmacy_consultation", rpcParams)
        Unit
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Failed finishing request", it)
    }

    override suspend fun getActivePatientDispatchRequest(): Result<PharmacyDispatchRequest?> = runCatching {
        val currentUser = authRepository.getCurrentUser()
            ?: return@runCatching null
        supabaseClient.postgrest
            .from("pharmacy_dispatch_requests")
            .select(Columns.ALL) {
                filter {
                    eq("requested_by_user_id", currentUser.id)
                    isIn("status", listOf("searching", "matched", "in_call"))
                }
                order("created_at", Order.DESCENDING)
                limit(1)
            }
            .decodeSingleOrNull<DispatchRequestDto>()
            ?.toDomain()
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Failed recovering patient's active waiting request", it)
    }

    override suspend fun createPatientDispatchRequest(
        patientDni: String,
        patientPhone: String,
        patientName: String?,
        tierRequested: String,
        symptomSummary: String?,
        patientCpf: String?,
        careCountry: String?,
    ): Result<PharmacyDispatchRequest> = runCatching {
        require(careCountry == "AR" || careCountry == "BR") {
            "Seleccioná Argentina o Brasil como país de atención"
        }
        val documentDigits = (if (careCountry == "BR") patientCpf ?: patientDni else patientDni)
            .filter(Char::isDigit)
        require(if (careCountry == "BR") documentDigits.length == 11
                else documentDigits.length in 5..10) {
            "Documento del paciente inválido para el país seleccionado"
        }
        val currentUser = authRepository.getCurrentUser()
        if (currentUser == null) {
            val guestPayload = buildJsonObject {
                put("careCountry", careCountry)
                if (careCountry == "BR") put("patientCpf", documentDigits)
                else put("patientDni", documentDigits)
                put("patientPhone", patientPhone.trim())
                if (!patientName.isNullOrBlank()) put("patientName", patientName.trim())
                put("tier", tierRequested.ifBlank { "general" })
                if (!symptomSummary.isNullOrBlank()) put("symptomSummary", symptomSummary.trim())
            }
            // Anonymous users have no direct SELECT/UPDATE on the clinical table.
            // The server creates the request and returns a scoped guest token.
            return@runCatching createGuestRequestViaSignedApi(guestPayload)
        }

        // Room IDs are access-adjacent metadata, never embed DNI/CPF digits.
        val cloudflareRoomId = opaquePharmacyRoomId(tierRequested)

        val payload = buildJsonObject {
            put("care_country", careCountry)
            if (careCountry == "BR") put("patient_cpf", documentDigits)
            else put("patient_dni", documentDigits)
            put("patient_phone", patientPhone.trim())
            if (!patientName.isNullOrBlank()) {
                put("patient_name", patientName.trim())
            }
            put("tier_requested", tierRequested.ifBlank { "general" })
            if (!symptomSummary.isNullOrBlank()) {
                put("symptom_summary", symptomSummary.trim())
            }
            put("cloudflare_room_id", cloudflareRoomId)
            put("status", "searching")
            put("requested_by_user_id", currentUser.id)
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
                val guestToken = guestAccessTokens[requestId]
                if (guestToken != null) {
                    fetchGuestRequestViaSignedApi(requestId, guestToken)
                } else {
                    supabaseClient.postgrest
                        .from("pharmacy_dispatch_requests")
                        .select(Columns.ALL) {
                            filter { eq("id", requestId) }
                        }
                        .decodeSingleOrNull<DispatchRequestDto>()
                        ?.toDomain()
                }
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
            // Server resolves doctor from the verified JWT and restricts results
            // to unexpired offers in the same clinical jurisdiction.
            val dtos = supabaseClient.postgrest
                .rpc("get_my_pending_dispatch_offers")
                .decodeAs<List<DispatchRequestDto>>()
            _searchingRequests.value = dtos.map { it.toDomain() }
        }.onFailure {
            // Never keep another doctor's cached offers after auth changes.
            _searchingRequests.value = emptyList()
            SecureLog.error("[PharmacyDispatch] Failed loading own pending dispatch offers", it)
        }
    }

    private suspend fun subscribeToSearchingQueue() {
        if (searchingChannel != null) return

        runCatching {
            val channel = supabaseClient.channel("pharmacy-dispatch-doctor-offers")
            val changeFlow = channel.postgresChangeFlow<PostgresAction>(
                schema = "public",
            ) {
                table = "dispatch_offers"
            }

            channel.subscribe()
            searchingChannel = channel

            val realtimeJob = scope.launch {
                changeFlow.collect {
                    Timber.d("[PharmacyDispatch] Own offer stream updated")
                    loadSearchingRequests()
                }
            }

            // Notifications may be delayed by a phone or websocket reconnect.
            // A periodic authenticated fetch keeps the doctor UI synchronized.
            while (scope.isActive) {
                delay(3000L)
                loadSearchingRequests()
            }
            realtimeJob.cancel()
        }.onFailure {
            SecureLog.error("[PharmacyDispatch] Failed subscribing to searching queue", it)
        }
    }
}

// ── DTOs ────────────────────────────────────────────────────

@Serializable
private data class CancelledDispatchRequestDto(val id: String)


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
    @SerialName("patient_dni") val patientDni: String? = null,
    @SerialName("patient_cpf") val patientCpf: String? = null,
    @SerialName("patient_phone") val patientPhone: String,
    @SerialName("patient_name") val patientName: String? = null,
    @SerialName("tier_requested") val tierRequested: String = "general",
    @SerialName("symptom_summary") val symptomSummary: String? = null,
    val status: String = "searching",
    @SerialName("assigned_doctor_id") val assignedDoctorId: String? = null,
    @SerialName("cloudflare_room_id") val cloudflareRoomId: String,
    @SerialName("created_at") val createdAt: String,
    @SerialName("care_country") val careCountry: String? = null,
    @SerialName("offer_id") val offerId: String? = null,
    @SerialName("offer_expires_at") val offerExpiresAt: String? = null,
) {
    fun toDomain() = PharmacyDispatchRequest(
        id = id,
        offerId = offerId,
        offerExpiresAt = offerExpiresAt,
        careCountry = careCountry,
        patientDni = if (careCountry == "BR") patientCpf.orEmpty() else patientDni.orEmpty(),
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