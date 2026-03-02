package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.repository.IceServerInfo
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.domain.repository.TelemedicineSessionInfo
import com.autamedica.android.presentation.videocall.webrtc.WebRTCEngine
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.ktor.client.call.body
import io.ktor.client.request.setBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TelemedicineRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
) : TelemedicineRepository {

    override suspend fun createSession(doctorId: String, appointmentId: String?): Result<TelemedicineSessionInfo> = runCatching {
        val patientId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No user ID found")
            
        val payload = CreateCallRequest(doctorId = doctorId, patientId = patientId)

        val response = supabaseClient.functions.invoke("create-call") {
            setBody(payload)
        }.body<CreateCallResponse>()
        
        if (response.success != true || response.call == null) {
            throw IllegalStateException("Failed to create call: ${response.error}")
        }
        
        TelemedicineSessionInfo(
            sessionId = response.call.id,
            roomId = response.call.roomId,
            signalingUrl = WebRTCEngine.SIGNALING_URL_HTTP,
            iceServers = getDefaultIceServers()
        )
    }.onFailure {
        Timber.e(it, "[Telemedicine] Failed creating session")
    }

    override suspend fun getSession(sessionId: String): Result<TelemedicineSessionInfo> = runCatching {
        val call = supabaseClient.postgrest
            .from("calls")
            .select(Columns.ALL) {
                filter { eq("id", sessionId) }
            }
            .decodeSingle<CallDto>()
            
        TelemedicineSessionInfo(
            sessionId = call.id,
            roomId = call.roomId,
            signalingUrl = WebRTCEngine.SIGNALING_URL_HTTP,
            iceServers = getDefaultIceServers()
        )
    }.onFailure {
        Timber.e(it, "[Telemedicine] Failed fetching session $sessionId")
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
private data class CreateCallRequest(
    val doctorId: String,
    val patientId: String
)

@Serializable
private data class CreateCallResponse(
    val success: Boolean? = null,
    val call: CallDto? = null,
    val error: String? = null
)

@Serializable
private data class CallDto(
    val id: String,
    @SerialName("room_id") val roomId: String,
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("patient_id") val patientId: String,
    val status: String,
)
