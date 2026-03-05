package com.autamedica.android.data.repository

import com.autamedica.android.BuildConfig
import com.autamedica.android.domain.repository.IceServerInfo
import com.autamedica.android.domain.repository.LiveKitCredentials
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.domain.repository.TelemedicineSessionInfo
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.ktor.client.call.body
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
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

    override suspend fun getSession(sessionId: String): Result<TelemedicineSessionInfo> = runCatching {
        val identifier = sessionId.trim()
        require(identifier.isNotEmpty()) { "Session identifier cannot be empty" }

        val call = findCallForIdentifier(identifier)
            ?: throw IllegalStateException("No telemedicine call found for identifier")

        TelemedicineSessionInfo(
            sessionId = call.id,
            roomId = call.roomId,
            signalingUrl = BuildConfig.SIGNALING_URL,
            iceServers = getDefaultIceServers(),
        )
    }.onFailure {
        SecureLog.error("[Telemedicine] Failed fetching session", it)
    }

    override suspend fun getLiveKitCredentials(sessionId: String): Result<LiveKitCredentials> = runCatching {
        val identifier = sessionId.trim()
        require(identifier.isNotEmpty()) { "Session identifier cannot be empty" }

        val response = supabaseClient.functions.invoke(
            BuildConfig.LIVEKIT_TOKEN_FUNCTION,
            LiveKitTokenRequest(
                consultationId = identifier,
                sessionId = identifier,
                appointmentId = identifier,
            ),
        )

        if (!response.status.isSuccess()) {
            val responseBody = runCatching { response.bodyAsText() }.getOrNull()
            throw IllegalStateException(
                "LiveKit token function failed with ${response.status.value}${responseBody?.let { ": $it" } ?: ""}",
            )
        }

        val payload = response.body<LiveKitTokenResponseDto>()
        val token = payload.token.normalizedOrNull()
            ?: throw IllegalStateException("LiveKit token is empty")
        val wsUrl = payload.wsUrl.normalizedOrNull()
            ?: BuildConfig.LIVEKIT_WS_URL.normalizedOrNull()
            ?: throw IllegalStateException("LiveKit wsUrl missing in response and BuildConfig")

        LiveKitCredentials(
            token = token,
            roomName = payload.roomName.normalizedOrNull() ?: identifier,
            wsUrl = wsUrl,
        )
    }.onFailure {
        SecureLog.error("[Telemedicine] Failed fetching LiveKit credentials", it)
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

        return parseSessionIdentifier(meetingUrl)
    }

    private fun parseSessionIdentifier(meetingUrl: String): String? {
        val trimmed = meetingUrl.trim()
        if (trimmed.isEmpty()) return null

        return trimmed
            .substringAfterLast('/')
            .substringBefore('?')
            .substringBefore('#')
            .trim()
            .ifEmpty { null }
    }

    private fun String.isUuid(): Boolean {
        return UUID_REGEX.matches(this)
    }

    private fun String?.normalizedOrNull(): String? {
        return this?.trim()?.takeIf { it.isNotEmpty() }
    }

    private fun getDefaultIceServers(): List<IceServerInfo> {
        return listOf(
            IceServerInfo(listOf("stun:stun.l.google.com:19302")),
            IceServerInfo(listOf("stun:stun1.l.google.com:19302")),
            IceServerInfo(listOf("stun:stun2.l.google.com:19302")),
            IceServerInfo(listOf("stun:stun3.l.google.com:19302")),
            IceServerInfo(listOf("stun:stun4.l.google.com:19302")),
        )
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
private data class AppointmentMeetingDto(
    @SerialName("meeting_url") val meetingUrl: String? = null,
)

@Serializable
private data class LiveKitTokenRequest(
    @SerialName("consultationId") val consultationId: String,
    @SerialName("sessionId") val sessionId: String,
    @SerialName("appointmentId") val appointmentId: String,
)

@Serializable
private data class LiveKitTokenResponseDto(
    val token: String,
    @SerialName("roomName") val roomName: String? = null,
    @SerialName("wsUrl") val wsUrl: String? = null,
)
