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
import com.autamedica.android.domain.model.DoctorGuardApproval
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
import com.autamedica.android.domain.repository.DispatchCheckoutResult
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
    private val securePreferences: SecurePreferences? = null,
) : PharmacyDispatchRepository {

    private val scope = CoroutineScope(SupervisorJob() + ioDispatcher)

    private val _searchingRequests = MutableStateFlow<List<PharmacyDispatchRequest>>(emptyList())
    private var searchingChannel: RealtimeChannel? = null

    // Never write short-lived guest JWTs to logs, analytics or persistent storage.
    private val guestAccessTokens = ConcurrentHashMap<String, String>()
    // Guest JWTs last two hours on the server. Refresh no later than one hour
    // to avoid an unnecessary recovery POST (and DB write) every 3s poll.
    private val guestTokenRefreshDeadline = ConcurrentHashMap<String, Long>()
    private val guestRoomIds = ConcurrentHashMap<String, String>()
    private fun rememberGuestToken(requestId: String, token: String, roomId: String) {
        guestAccessTokens[requestId] = token
        guestTokenRefreshDeadline[requestId] = System.currentTimeMillis() + 3_600_000L
        guestRoomIds[requestId] = roomId
    }
    // An opaque 256-bit RECOVERY secret (not the JWT) is Keystore-encrypted via
    // SecurePreferences. It restores the same guest request after process death.
    private val guestRecoveryKey = "pharmacy_guest_queue_recovery_v1"
    // For referral guests created while signed in, bind local recovery to
    // the same account. Never resurrect another person's queue after login.
    private val guestRecoveryOwnerKey = "pharmacy_guest_queue_recovery_owner_v1"

    private fun savedGuestRecovery(): Pair<String, String>? {
        val saved = securePreferences?.getString(guestRecoveryKey) ?: return null
        val parts = saved.split(':', limit = 2)
        return if (parts.size == 2 &&
            parts[0].matches(Regex("^[0-9a-fA-F-]{36}$")) &&
            parts[1].matches(Regex("^[0-9a-f]{64}$"))) {
            parts[0] to parts[1]
        } else null
    }

    private fun clearGuestRecovery(requestId: String) {
        if (savedGuestRecovery()?.first == requestId) {
            securePreferences?.remove(guestRecoveryKey)
            securePreferences?.remove(guestRecoveryOwnerKey)
        }
        guestAccessTokens.remove(requestId)
        guestTokenRefreshDeadline.remove(requestId)
        guestRoomIds.remove(requestId)
    }

    private suspend fun resumeGuestRequestFromEncryptedDevice(requestId: String): PharmacyDispatchRequest? =
        withContext(ioDispatcher) {
            val ownerId = securePreferences?.getString(guestRecoveryOwnerKey)
            val activeUser = authRepository.getCurrentUser()?.id
            if (ownerId != activeUser) return@withContext null
            val recovery = savedGuestRecovery()?.takeIf { it.first == requestId }
                ?: return@withContext null
            val body = buildJsonObject {
                put("requestId", requestId)
                put("recoveryToken", recovery.second)
            }
            val requestBuilder = Request.Builder()
                .url("$guestApiOrigin/api/pharmacy/dispatch/resume")
                .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            if (ownerId != null) {
                val accessToken = supabaseClient.auth.currentSessionOrNull()?.accessToken
                    ?: error("Authenticated recovery requires an active session")
                requestBuilder.header("Authorization", "Bearer $accessToken")
            }
            val request = requestBuilder.build()

            guestClient.newCall(request).execute().use { response ->
                if (response.code == 401) {
                    clearGuestRecovery(requestId)
                    return@withContext null
                }
                check(response.isSuccessful) {
                    "Guest queue recovery endpoint failed (HTTP ${response.code})"
                }
                val rawBody = response.body?.string() ?: error("Empty guest recovery response")
                val data = json.parseToJsonElement(rawBody).jsonObject["data"]?.jsonObject
                    ?: error("Missing guest recovery data")
                val freshJwt = data["accessToken"]?.jsonPrimitive?.content
                    ?.takeIf { it.isNotBlank() } ?: error("Missing renewed guest access token")
                val dto = json.decodeFromJsonElement<DispatchRequestDto>(
                    data["request"] ?: error("Missing recovered guest request")
                )
                check(dto.id == requestId) { "Recovered guest request mismatch" }
                rememberGuestToken(requestId, freshJwt, dto.cloudflareRoomId)
                dto.toDomain()
            }
        }
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

    private suspend fun createGuestRequestViaSignedApi(payload: kotlinx.serialization.json.JsonObject, ownerUserId: String? = null): PharmacyDispatchRequest =
        withContext(ioDispatcher) {
            val requestBuilder = Request.Builder()
                .url("$guestApiOrigin/api/pharmacy/dispatch/request")
                .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            if (ownerUserId != null) {
                val accessToken = supabaseClient.auth.currentSessionOrNull()?.accessToken
                    ?: error("Authenticated referral requires an active session")
                requestBuilder.header("Authorization", "Bearer $accessToken")
            }
            val request = requestBuilder.build()

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
                val recoveryToken = data["recoveryToken"]?.jsonPrimitive?.content
                    ?.takeIf { it.matches(Regex("^[0-9a-f]{64}$")) }
                    ?: error("Missing scoped guest queue recovery token")
                check(securePreferences != null) {
                    "Encrypted guest queue recovery unavailable on this device"
                }
                // The originating device alone retains this opaque credential.
                securePreferences.putString(guestRecoveryKey, "${dto.id}:$recoveryToken")
                if (ownerUserId != null) securePreferences.putString(guestRecoveryOwnerKey, ownerUserId)
                else securePreferences.remove(guestRecoveryOwnerKey)
                rememberGuestToken(dto.id, token, dto.cloudflareRoomId)
                dto.toDomain()
            }
        }

    override suspend fun getGuestAccessTokenForRoom(roomId: String): String? =
        withContext(ioDispatcher) {
            val expectedRoom = roomId.trim()
            if (expectedRoom.isEmpty()) return@withContext null
            val recovery = savedGuestRecovery() ?: return@withContext null
            val requestId = recovery.first
            val ownerId = securePreferences?.getString(guestRecoveryOwnerKey)
            val activeUserId = authRepository.getCurrentUser()?.id
            // The encrypted recovery credential is account-bound when the queue
            // was created while signed in; never lend it to a different account.
            if (ownerId != activeUserId) return@withContext null

            val knownRoom = guestRoomIds[requestId]
            // A known room mismatch is a hard deny, never a reason to refresh
            // or recover a token for a different room.
            if (knownRoom != null && knownRoom != expectedRoom) return@withContext null

            var token = guestAccessTokens[requestId]
            val deadline = guestTokenRefreshDeadline[requestId] ?: 0L
            if (token.isNullOrBlank() || deadline <= System.currentTimeMillis() || knownRoom == null) {
                val restored = resumeGuestRequestFromEncryptedDevice(requestId)
                if (restored?.cloudflareRoomId != expectedRoom) return@withContext null
                token = guestAccessTokens[requestId]
            }

            token?.takeIf {
                it.isNotBlank() && guestRoomIds[requestId] == expectedRoom
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
                if (response.code == 401) {
                    // Short-lived JWT expired; renew using the Keystore-held
                    // recovery credential without re-submitting the intake.
                    return@withContext resumeGuestRequestFromEncryptedDevice(requestId)
                }
                if (!response.isSuccessful) return@withContext null
                val body = response.body?.string() ?: return@withContext null
                val data = json.parseToJsonElement(body).jsonObject["data"]?.jsonObject
                    ?: return@withContext null
                val dto = json.decodeFromJsonElement<DispatchRequestDto>(
                    data["request"] ?: return@withContext null
                )
                dto.toDomain().also { request ->
                    if (request.status in setOf("completed", "cancelled", "expired")) {
                        clearGuestRecovery(requestId)
                    }
                }
            }
        }

    override suspend fun getMyGuardApproval(): Result<DoctorGuardApproval> = runCatching {
        check(!supabaseClient.auth.currentSessionOrNull()?.accessToken.isNullOrBlank()) {
            "Authenticated medical professional required for eligibility query"
        }
        val eligibility = supabaseClient.postgrest
            .rpc("get_my_guard_approval")
            .decodeAs<DoctorGuardApprovalDto>()
        DoctorGuardApproval(
            approved = eligibility.approved,
            code = eligibility.code,
            country = eligibility.careCountry,
            verificationStatus = eligibility.verificationStatus,
        )
    }.onFailure {
        SecureLog.warn("[PharmacyDispatch] Could not confirm Admin guard approval")
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
        val confirmation = supabaseClient.postgrest
            .rpc("set_doctor_duty_status", params)
            .decodeAs<DoctorGuardDutyRpcDto>()
        check(confirmation.success && confirmation.isOnDuty == isOnDuty) {
            "Doctor guard state was not confirmed by the server"
        }
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
        val confirmation = supabaseClient.postgrest
            .rpc("doctor_heartbeat", params)
            .decodeAs<DoctorGuardHeartbeatRpcDto>()
        check(confirmation.success) {
            "Doctor heartbeat was not accepted by the server"
        }
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
        val tokenOwner = securePreferences?.getString(guestRecoveryOwnerKey)
        val activeUserId = authRepository.getCurrentUser()?.id
        val guestToken = if (tokenOwner == activeUserId) guestAccessTokens[requestId] else null
        if (guestToken != null) {
            // Renew only when the in-memory guest JWT reaches its refresh
            // deadline. An unnecessary resume POST on every cancellation can
            // fail closed when the API is temporarily unavailable, even though
            // the current scoped token is still valid.
            val refreshDeadline = guestTokenRefreshDeadline[requestId] ?: 0L
            if (refreshDeadline <= System.currentTimeMillis()) {
                check(savedGuestRecovery()?.first == requestId) {
                    "Encrypted guest recovery unavailable"
                }
                check(resumeGuestRequestFromEncryptedDevice(requestId) != null) {
                    "Missing renewed guest access token"
                }
            }
            val currentToken = guestAccessTokens[requestId] ?: guestToken
            val payload = buildJsonObject {
                put("requestId", requestId)
                put("accessToken", currentToken)
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
            if (confirmed) clearGuestRecovery(requestId)
            confirmed
        } else {
            check(authRepository.getCurrentUser() != null) { "Missing authenticated owner or guest token" }
            // The old direct UPDATE was rejected by the protected clinical
            // table trigger. The RPC validates request ownership server-side.
            supabaseClient.postgrest
                .rpc("cancel_my_pharmacy_dispatch_request",
                     buildJsonObject { put("p_request_id", requestId) })
                .decodeAs<PatientCancelRpcDto>()
                .cancelled
        }
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Patient cancellation not confirmed", it)
    }

    override suspend fun declinePharmacyOffer(offerId: String): Result<Boolean> = runCatching {
        require(offerId.isNotBlank()) { "Missing offer ID" }
        check(authRepository.getCurrentUser() != null) { "Authenticated physician required" }
        supabaseClient.postgrest
            .rpc("decline_my_pharmacy_dispatch_offer",
                 buildJsonObject { put("p_offer_id", offerId) })
            .decodeAs<DoctorDeclineRpcDto>()
            .declined
    }.onFailure {
        SecureLog.error("[PharmacyDispatch] Doctor offer refusal not confirmed", it)
    }

    override suspend fun updateDispatchRequestStatus(
        requestId: String,
        status: String,
    ): Result<Unit> = runCatching {
        require(status == "in_call" || status == "completed") {
            "Unsupported clinical dispatch transition"
        }
        val updates = buildMap {
            put("status", status)
            if (status == "in_call") put("call_started_at", java.time.OffsetDateTime.now().toString())
            if (status == "completed") put("call_ended_at", java.time.OffsetDateTime.now().toString())
        }
        val persisted = supabaseClient.postgrest
            .from("pharmacy_dispatch_requests")
            .update(updates) {
                filter { eq("id", requestId) }
                select(Columns.list("id", "status"))
            }
            .decodeSingleOrNull<DispatchStatusConfirmationDto>()
        check(persisted?.status == status) {
            "Clinical video transition was not confirmed by the server"
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
        val recovery = savedGuestRecovery()
        val recoveryOwner = securePreferences?.getString(guestRecoveryOwnerKey)
        if (recovery != null && recoveryOwner == currentUser?.id) {
            val restored = resumeGuestRequestFromEncryptedDevice(recovery.first)
            if (restored != null && restored.status in setOf("searching", "matched", "in_call")) {
                return@runCatching restored
            }
        }
        if (currentUser != null) {
            // Never reuse a previous guest's credential for a different
            // authenticated patient on a shared phone.
            return@runCatching supabaseClient.postgrest
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
        }
        null // Anonymous recovery was handled above, with an owner check.
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
        referralCode: String?,
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
        val commercialCode = referralCode?.trim()?.uppercase(java.util.Locale.ROOT)?.takeIf { it.isNotBlank() }
        require(commercialCode == null || commercialCode.matches(Regex("^[A-Z0-9_-]{3,32}$"))) {
            "Código de referencia inválido"
        }
        require(commercialCode != "JORDAN" || careCountry == "BR") {
            "El código de Jordan solo corresponde a Brasil"
        }
        if (currentUser == null || commercialCode != null) {
            val guestPayload = buildJsonObject {
                put("careCountry", careCountry)
                if (careCountry == "BR") put("patientCpf", documentDigits)
                else put("patientDni", documentDigits)
                put("patientPhone", patientPhone.trim())
                if (!patientName.isNullOrBlank()) put("patientName", patientName.trim())
                put("tier", tierRequested.ifBlank { "general" })
                if (!symptomSummary.isNullOrBlank()) put("symptomSummary", symptomSummary.trim())
                if (commercialCode != null) put("referralCode", commercialCode)
            }
            // The signed server endpoint validates the commercial QR source.
            // It also issues a room-scoped token and encrypted recovery material.
            // Authenticated patients using a referral are handled as a locally
            // account-bound guest until the backend supports authenticated QR binding.
            // The server creates the request and returns a scoped guest token.
            return@runCatching createGuestRequestViaSignedApi(guestPayload, currentUser?.id)
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

    // Payment requests remain server-authorized and room-scoped. Never persist
    // the short-lived token, never trust a browser redirect as paid, and never
    // attach a payment to a different user's restored queue.
    private suspend fun paymentGuestToken(requestId: String): String {
        require(requestId.matches(Regex("^[0-9a-fA-F-]{36}$"))) { "Invalid payment request" }
        val owner = securePreferences?.getString(guestRecoveryOwnerKey)
        check(owner == authRepository.getCurrentUser()?.id) { "Payment credential belongs to another session" }
        val now = System.currentTimeMillis()
        if (guestAccessTokens[requestId] == null ||
            (guestTokenRefreshDeadline[requestId] ?: 0L) <= now) {
            check(savedGuestRecovery()?.first == requestId) {
                "Encrypted payment recovery unavailable"
            }
            check(resumeGuestRequestFromEncryptedDevice(requestId) != null) {
                "Cannot restore signed payment credential"
            }
        }
        return guestAccessTokens[requestId] ?: error("Signed payment credential unavailable")
    }

    private suspend fun paymentRequest(requestId: String, endpoint: String): DispatchCheckoutResult =
        withContext(ioDispatcher) {
            val body = buildJsonObject {
                put("requestId", requestId)
                put("accessToken", paymentGuestToken(requestId))
            }
            val request = Request.Builder()
                .url("$guestApiOrigin/api/pharmacy/dispatch/payment/$endpoint")
                .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()
            guestClient.newCall(request).execute().use { response ->
                check(response.isSuccessful) { "Payment API unavailable (HTTP ${response.code})" }
                val raw = response.body?.string() ?: error("Empty payment response")
                val payment = json.parseToJsonElement(raw).jsonObject["data"]?.jsonObject
                    ?: error("Missing payment response data")
                val status = payment["status"]?.jsonPrimitive?.content ?: error("Missing payment status")
                check(status in setOf("not_started","initializing","pending","approved","refunded","cancelled","rejected","failed")) {
                    "Unexpected payment status"
                }
                val url = payment["checkoutUrl"]?.jsonPrimitive?.content?.takeIf { it.startsWith("https://") }
                DispatchCheckoutResult(status = status, checkoutUrl = url)
            }
        }

    override suspend fun startDispatchCheckout(requestId: String): Result<DispatchCheckoutResult> = runCatching {
        paymentRequest(requestId, "create")
    }.onFailure { SecureLog.warn("[PharmacyDispatch] Secure Brazilian checkout unavailable") }

    override suspend fun getDispatchPaymentStatus(requestId: String): Result<String> = runCatching {
        paymentRequest(requestId, "status").status
    }.onFailure { SecureLog.warn("[PharmacyDispatch] Payment confirmation not available") }

    override suspend fun getCountryOnDutyCapacity(careCountry: String): Result<Int> = runCatching {
        require(careCountry == "AR" || careCountry == "BR") { "Invalid care country" }
        supabaseClient.postgrest
            .rpc("get_country_on_duty_capacity", buildJsonObject {
                put("p_care_country", careCountry)
            })
            .decodeAs<Int>()
            .coerceAtLeast(0)
    }.onFailure {
        SecureLog.warn("[PharmacyDispatch] Country radar capacity temporarily unavailable")
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
private data class DispatchStatusConfirmationDto(
    val id: String,
    val status: String,
)

@Serializable
private data class PatientCancelRpcDto(val cancelled: Boolean)

@Serializable
private data class DoctorDeclineRpcDto(val declined: Boolean)


@Serializable
private data class DoctorGuardDutyRpcDto(
    val success: Boolean = false,
    @SerialName("is_on_duty") val isOnDuty: Boolean = false,
)

@Serializable
private data class DoctorGuardHeartbeatRpcDto(
    val success: Boolean = false,
)

@Serializable
private data class DoctorGuardApprovalDto(
    val approved: Boolean = false,
    val code: String = "DOCTOR_PENDING_CLINICAL_APPROVAL",
    @SerialName("care_country") val careCountry: String? = null,
    @SerialName("verification_status") val verificationStatus: String = "pending",
)

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
    @SerialName("referral_partner_id") val referralPartnerId: String? = null,
    @SerialName("offer_id") val offerId: String? = null,
    @SerialName("offer_expires_at") val offerExpiresAt: String? = null,
) {
    fun toDomain() = PharmacyDispatchRequest(
        id = id,
        offerId = offerId,
        offerExpiresAt = offerExpiresAt,
        careCountry = careCountry,
        referralPartnerId = referralPartnerId,
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