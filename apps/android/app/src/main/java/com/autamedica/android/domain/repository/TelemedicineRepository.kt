package com.autamedica.android.domain.repository

data class TelemedicineSessionInfo(
    val sessionId: String,
    val roomId: String,
    val signalingUrl: String,
    val iceServers: List<IceServerInfo>,
)

data class IceServerInfo(
    val urls: List<String>,
    val username: String? = null,
    val credential: String? = null,
)

interface TelemedicineRepository {
    suspend fun getSession(sessionId: String): Result<TelemedicineSessionInfo>
}
