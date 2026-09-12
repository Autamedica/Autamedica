package com.autamedica.android.data.repository

import com.autamedica.android.BuildConfig
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.domain.repository.IceServerInfo
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.domain.repository.TelemedicineSessionInfo
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TelemedicineRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
) : TelemedicineRepository {

    companion object {
        private val UUID_REGEX = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
    }

    internal var sessionInfoFinder: (suspend (String) -> TelemedicineSessionInfo?)? = null
    internal var iceServersProvider: (() -> List<IceServerInfo>)? = null

    override suspend fun getSession(sessionId: String): Result<TelemedicineSessionInfo> = runCatching {
        val identifier = sessionId.trim()
        require(identifier.isNotEmpty()) { "Session identifier cannot be empty" }

        val customFinder = sessionInfoFinder
        if (customFinder != null) {
            val resolved = customFinder(identifier)
            if (resolved != null) return@runCatching resolved
        } else {
            val call = findCallForIdentifier(identifier)
            if (call != null) {
                return@runCatching TelemedicineSessionInfo(
                    sessionId = call.id,
                    roomId = call.roomId,
                    signalingUrl = BuildConfig.SIGNALING_URL,
                    iceServers = fetchTurnIceServers(),
                )
            }

            val session = findTelemedicineSessionForIdentifier(identifier)
            if (session != null) {
                return@runCatching TelemedicineSessionInfo(
                    sessionId = session.id,
                    roomId = session.roomId?.trim()?.takeIf { it.isNotEmpty() } ?: identifier,
                    signalingUrl = BuildConfig.SIGNALING_URL,
                    iceServers = fetchTurnIceServers(),
                )
            }
        }

        SecureLog.info("[Telemedicine] Fallback to direct roomId connection for identifier=$identifier")
        TelemedicineSessionInfo(
            sessionId = identifier,
            roomId = identifier,
            signalingUrl = BuildConfig.SIGNALING_URL,
            iceServers = fetchTurnIceServers(),
        )
    }.onFailure {
        SecureLog.error("[Telemedicine] Failed fetching session", it)
    }

    override suspend fun startDoctorCall(
        appointmentId: String,
        patientId: String?,
    ): Result<TelemedicineSessionInfo> = runCatching {
        val trimmedApptId = appointmentId.trim()
        val trimmedPatientId = patientId?.trim()?.takeIf { it.isNotEmpty() }

        SecureLog.info("[Telemedicine] Starting doctor call: apptId=$trimmedApptId, patientId=$trimmedPatientId")

        // 1. Invocar Edge Function create-call (crea registro en calls, pasa turno a in_progress y envía push FCM al paciente)
        val edgeFunctionResult = runCatching {
            val payload = buildJsonObject {
                if (trimmedApptId.isNotEmpty()) put("appointmentId", trimmedApptId)
                if (trimmedPatientId != null) put("patientId", trimmedPatientId)
            }
            val response = supabaseClient.functions.invoke("create-call", payload)
            val text = response.bodyAsText()
            SecureLog.info("[Telemedicine] create-call response: $text")
            val jsonObj = Json.parseToJsonElement(text) as? JsonObject
            val callObj = jsonObj?.get("call") as? JsonObject
            val id = (callObj?.get("id") as? JsonPrimitive)?.contentOrNull
            val roomId = (callObj?.get("room_id") as? JsonPrimitive)?.contentOrNull
            if (!id.isNullOrBlank() && !roomId.isNullOrBlank()) {
                TelemedicineSessionInfo(
                    sessionId = id,
                    roomId = roomId,
                    signalingUrl = BuildConfig.SIGNALING_URL,
                    iceServers = fetchTurnIceServers(),
                )
            } else {
                null
            }
        }.getOrNull()

        if (edgeFunctionResult != null) {
            return@runCatching edgeFunctionResult
        }

        // 2. Fallback: Si la Edge Function falló, buscar si ya existe la llamada en BD
        val existingSession = getSession(trimmedApptId).getOrNull()
        if (existingSession != null && existingSession.roomId != trimmedApptId) {
            return@runCatching existingSession
        }

        // 3. Fallback directo a getSession
        getSession(trimmedApptId).getOrThrow()
    }.onFailure {
        SecureLog.error("[Telemedicine] Failed starting doctor call", it)
    }

    override suspend fun updateCallStatus(callId: String, status: String): Result<Unit> = runCatching {
        val trimmedCallId = callId.trim()
        if (trimmedCallId.isEmpty()) return@runCatching

        val normalizedStatus = when (status) {
            "in_progress" -> "connected"
            "completed" -> "ended"
            else -> status
        }

        runCatching {
            supabaseClient.postgrest
                .from("calls")
                .update(mapOf("status" to normalizedStatus)) {
                    filter { eq("id", trimmedCallId) }
                }
        }

        runCatching {
            supabaseClient.postgrest
                .from("telemedicine_sessions")
                .update(mapOf("status" to normalizedStatus)) {
                    filter {
                        or {
                            eq("appointment_id", trimmedCallId)
                            eq("id", trimmedCallId)
                        }
                    }
                }
        }

        runCatching {
            val payload = buildJsonObject {
                put("callId", trimmedCallId)
                put("status", normalizedStatus)
            }
            supabaseClient.functions.invoke("update-call-status", payload)
        }

        Unit
    }.onFailure {
        SecureLog.warn("[Telemedicine] Failed updating call status", it)
    }

    override suspend fun getJoinableAppointmentIds(appointments: List<Appointment>): Result<Set<String>> = runCatching {
        val candidateAppointments = appointments
            .filter { it.isTelemedicineJoinCandidate() }
            .distinctBy { it.id }

        if (candidateAppointments.isEmpty()) {
            return@runCatching emptySet()
        }

        val liveSessions = supabaseClient.postgrest
            .from("telemedicine_sessions")
            .select(Columns.list("appointment_id", "status")) {
                filter { isIn("appointment_id", candidateAppointments.map { it.id }) }
            }
            .decodeList<LiveSessionAvailabilityDto>()
            .map { LiveSessionReference(appointmentId = it.appointmentId, status = it.status) }

        val identifiers = candidateAppointments
            .mapNotNull { extractMeetingIdentifier(it.meetingUrl) }
            .distinct()

        val uuidIdentifiers = identifiers.filter { it.isUuid() }

        val legacyCalls = buildList {
            if (uuidIdentifiers.isNotEmpty()) {
                addAll(
                    supabaseClient.postgrest
                        .from("calls")
                        .select(Columns.list("id", "room_id", "status")) {
                            filter { isIn("id", uuidIdentifiers) }
                        }
                        .decodeList<CallAvailabilityDto>()
                        .map { it.toReference() }
                )
            }

            if (identifiers.isNotEmpty()) {
                addAll(
                    supabaseClient.postgrest
                        .from("calls")
                        .select(Columns.list("id", "room_id", "status")) {
                            filter { isIn("room_id", identifiers) }
                        }
                        .decodeList<CallAvailabilityDto>()
                        .map { it.toReference() }
                )
            }
        }.distinctBy { it.id }

        deriveJoinableAppointmentIds(
            appointments = candidateAppointments,
            legacyCalls = legacyCalls,
            liveSessions = liveSessions,
        )
    }.onFailure {
        SecureLog.error("[Telemedicine] Failed resolving joinable appointments", it)
    }

    private suspend fun findCallForIdentifier(identifier: String): CallDto? {
        if (identifier.isUuid()) {
            val byCallId = findCallByColumn(column = "id", value = identifier)
            if (byCallId != null) return byCallId
        }

        val byRoomId = findCallByColumn(column = "room_id", value = identifier)
        if (byRoomId != null) return byRoomId

        if (!identifier.isUuid()) return null

        val callIdFromAppointment = resolveCallIdFromAppointment(identifier) ?: return null
        return if (callIdFromAppointment.isUuid()) {
            findCallByColumn(column = "id", value = callIdFromAppointment)
                ?: findCallByColumn(column = "room_id", value = callIdFromAppointment)
        } else {
            findCallByColumn(column = "room_id", value = callIdFromAppointment)
        }
    }

    private suspend fun findCallByColumn(column: String, value: String): CallDto? {
        return supabaseClient.postgrest
            .from("calls")
            .select(Columns.ALL) {
                filter { eq(column, value) }
                limit(1)
            }
            .decodeList<CallDto>()
            .firstOrNull()
    }

    private suspend fun findTelemedicineSessionForIdentifier(identifier: String): TelemedicineSessionDto? {
        if (identifier.isUuid()) {
            val byAppointmentId = findSessionByColumn("appointment_id", identifier)
            if (byAppointmentId != null) return byAppointmentId

            val byId = findSessionByColumn("id", identifier)
            if (byId != null) return byId
        }

        val byRoomId = findSessionByColumn("room_id", identifier)
        if (byRoomId != null) return byRoomId

        if (identifier.isUuid()) {
            val callIdFromAppointment = resolveCallIdFromAppointment(identifier)
            if (callIdFromAppointment != null) {
                val byResolvedRoom = findSessionByColumn("room_id", callIdFromAppointment)
                if (byResolvedRoom != null) return byResolvedRoom
            }
        }

        return null
    }

    private suspend fun findSessionByColumn(column: String, value: String): TelemedicineSessionDto? {
        return supabaseClient.postgrest
            .from("telemedicine_sessions")
            .select(Columns.ALL) {
                filter { eq(column, value) }
                limit(1)
            }
            .decodeList<TelemedicineSessionDto>()
            .firstOrNull()
    }

    private suspend fun resolveCallIdFromAppointment(appointmentId: String): String? {
        val meetingUrl = supabaseClient.postgrest
            .from("appointments")
            .select(Columns.list("meeting_url")) {
                filter { eq("id", appointmentId) }
                limit(1)
            }
            .decodeList<AppointmentMeetingDto>()
            .firstOrNull()
            ?.meetingUrl
            ?: return null

        return extractMeetingIdentifier(meetingUrl)
    }

    private fun String.isUuid(): Boolean {
        return UUID_REGEX.matches(this)
    }

    private fun String?.normalizedOrNull(): String? {
        return this?.trim()?.takeIf { it.isNotEmpty() }
    }

    internal fun getDefaultIceServers(): List<IceServerInfo> {
        val custom = iceServersProvider?.invoke()
        if (custom != null) return custom

        val servers = mutableListOf(
            IceServerInfo(listOf("stun:stun.l.google.com:19302")),
            IceServerInfo(listOf("stun:stun1.l.google.com:19302")),
            IceServerInfo(listOf("stun:stun2.l.google.com:19302")),
            IceServerInfo(listOf("stun:stun3.l.google.com:19302")),
            IceServerInfo(listOf("stun:stun4.l.google.com:19302")),
        )

        val turnUrls = BuildConfig.TURN_URLS.trim().takeIf { it.isNotEmpty() }
        if (turnUrls != null) {
            val urlList = turnUrls.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            if (urlList.isNotEmpty()) {
                servers.add(
                    IceServerInfo(
                        urls = urlList,
                        username = BuildConfig.TURN_USERNAME.trim().takeIf { it.isNotEmpty() },
                        credential = BuildConfig.TURN_CREDENTIAL.trim().takeIf { it.isNotEmpty() },
                    )
                )
            }
        }
        return servers
    }

    override suspend fun getIceServers(): Result<List<IceServerInfo>> = runCatching {
        fetchTurnIceServers()
    }

    internal suspend fun fetchTurnIceServers(): List<IceServerInfo> {
        val custom = iceServersProvider?.invoke()
        if (custom != null) return custom

        val fetched = runCatching {
            val response = supabaseClient.functions.invoke("turn-credentials")
            val text = response.bodyAsText()
            parseTurnIceServersJson(text)
        }.getOrNull()

        if (!fetched.isNullOrEmpty()) {
            return fetched
        }

        return getDefaultIceServers()
    }

    internal fun parseTurnIceServersJson(jsonText: String): List<IceServerInfo>? {
        return runCatching {
            val json = Json { ignoreUnknownKeys = true }
            val root = json.parseToJsonElement(jsonText) as? JsonObject ?: return null
            val ok = (root["ok"] as? JsonPrimitive)?.booleanOrNull ?: false
            if (!ok) return null
            val servers = root["iceServers"] as? JsonArray ?: return null
            val list = servers.mapNotNull { serverElement ->
                val obj = serverElement as? JsonObject ?: return@mapNotNull null
                val urlsElement = obj["urls"]
                val urls = when (urlsElement) {
                    is JsonArray -> urlsElement.mapNotNull { (it as? JsonPrimitive)?.content?.trim()?.takeIf { s -> s.isNotEmpty() } }
                    is JsonPrimitive -> urlsElement.content.trim().takeIf { it.isNotEmpty() }?.let { listOf(it) } ?: emptyList()
                    else -> emptyList()
                }
                val cleanUrls = urls.filter { !it.contains(":53") }
                if (cleanUrls.isNotEmpty()) {
                    val username = (obj["username"] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
                    val credential = (obj["credential"] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
                    IceServerInfo(
                        urls = cleanUrls,
                        username = username,
                        credential = credential,
                    )
                } else null
            }
            list.takeIf { it.isNotEmpty() }
        }.getOrNull()
    }
}



@Serializable
private data class CallDto(
    val id: String,
    @SerialName("room_id") val roomId: String,
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("patient_id") val patientId: String,
    val status: String,
)

@Serializable
private data class CallAvailabilityDto(
    val id: String,
    @SerialName("room_id") val roomId: String,
    val status: String,
) {
    fun toReference() = LegacyCallReference(
        id = id,
        roomId = roomId,
        status = status,
    )
}

@Serializable
private data class AppointmentMeetingDto(
    @SerialName("meeting_url") val meetingUrl: String? = null,
)

@Serializable
private data class LiveSessionAvailabilityDto(
    @SerialName("appointment_id") val appointmentId: String? = null,
    val status: String,
)

@Serializable
private data class TelemedicineSessionDto(
    val id: String,
    @SerialName("room_id") val roomId: String? = null,
    @SerialName("appointment_id") val appointmentId: String? = null,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("patient_id") val patientId: String? = null,
    val status: String? = null,
)
