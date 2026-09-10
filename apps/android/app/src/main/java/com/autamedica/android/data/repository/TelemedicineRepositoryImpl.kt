package com.autamedica.android.data.repository

import com.autamedica.android.BuildConfig
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.domain.repository.IceServerInfo
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.domain.repository.TelemedicineSessionInfo
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
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
                    iceServers = getDefaultIceServers(),
                )
            }

            val session = findTelemedicineSessionForIdentifier(identifier)
            if (session != null) {
                return@runCatching TelemedicineSessionInfo(
                    sessionId = session.id,
                    roomId = session.roomId?.trim()?.takeIf { it.isNotEmpty() } ?: identifier,
                    signalingUrl = BuildConfig.SIGNALING_URL,
                    iceServers = getDefaultIceServers(),
                )
            }
        }

        SecureLog.info("[Telemedicine] Fallback to direct roomId connection for identifier=$identifier")
        TelemedicineSessionInfo(
            sessionId = identifier,
            roomId = identifier,
            signalingUrl = BuildConfig.SIGNALING_URL,
            iceServers = getDefaultIceServers(),
        )
    }.onFailure {
        SecureLog.error("[Telemedicine] Failed fetching session", it)
    }

    override suspend fun updateCallStatus(callId: String, status: String): Result<Unit> = runCatching {
        val trimmedCallId = callId.trim()
        if (trimmedCallId.isEmpty()) return@runCatching

        runCatching {
            supabaseClient.postgrest
                .from("calls")
                .update(mapOf("status" to status)) {
                    filter { eq("id", trimmedCallId) }
                }
        }

        runCatching {
            supabaseClient.postgrest
                .from("telemedicine_sessions")
                .update(mapOf("status" to status)) {
                    filter {
                        or {
                            eq("appointment_id", trimmedCallId)
                            eq("id", trimmedCallId)
                        }
                    }
                }
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
