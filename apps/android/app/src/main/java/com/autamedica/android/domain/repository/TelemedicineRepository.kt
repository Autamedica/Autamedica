package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.Appointment

data class TelemedicineSessionInfo(
    val sessionId: String,
    val roomId: String,
    val signalingUrl: String,
    val iceServers: List<IceServerInfo>,
)

data class LiveKitCredentials(
    val token: String,
    val roomName: String,
    val wsUrl: String,
)

data class IceServerInfo(
    val urls: List<String>,
    val username: String? = null,
    val credential: String? = null,
)

interface TelemedicineRepository {
    suspend fun getSession(sessionId: String): Result<TelemedicineSessionInfo>
    suspend fun getLiveKitCredentials(sessionId: String): Result<LiveKitCredentials>
    suspend fun getJoinableAppointmentIds(appointments: List<Appointment>): Result<Set<String>>
}
