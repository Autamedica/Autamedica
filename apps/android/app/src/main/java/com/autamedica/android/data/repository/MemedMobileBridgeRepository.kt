package com.autamedica.android.data.repository

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

/**
 * AutaMedica Brazil only. Server rechecks role, physician, CFM, encounter,
 * patient identity and LGPD before returning a link. No tokens in browser URL.
 */
@Singleton
class MemedMobileBridgeRepository @Inject constructor(private val client: SupabaseClient) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun createLaunch(appointmentId: String): Result<String> = runCatching {
        require(MemedMobileLaunchUrl.isUuid(appointmentId)) { "Consulta inválida" }
        val response = client.functions(
            "memed-mobile-preflight",
            buildJsonObject { put("appointmentId", appointmentId) },
        )
        check(response.status.value in 200..299) {
            "Memed indisponível: autorização médica ou habilitação pendente"
        }
        val result = json.decodeFromString<MemedMobilePreflightResponse>(response.bodyAsText())
        check(result.success && result.provider == "memed" &&
            result.country == "BR" && result.requiresBrowserSignIn) {
            "Resposta Memed não autorizada"
        }
        MemedMobileLaunchUrl.validate(result.launchUrl, appointmentId)
    }
}

@Serializable
data class MemedMobilePreflightResponse(
    val success: Boolean,
    val launchUrl: String,
    val requiresBrowserSignIn: Boolean,
    val provider: String,
    val country: String,
)

/** Appointment ID is a lookup handle only, never an authorization credential. */
object MemedMobileLaunchUrl {
    private val uuid = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    fun isUuid(value: String): Boolean = uuid.matches(value)

    fun validate(raw: String, expectedAppointmentId: String): String {
        require(isUuid(expectedAppointmentId)) { "Consulta inválida" }
        require(raw.length < 512) { "Endereço Memed inválido" }
        val uri = URI(raw)
        require(uri.scheme == "https" && uri.host == "doctor.autamedica.com" &&
            uri.port == -1 && uri.rawUserInfo == null && uri.fragment == null &&
            uri.path == "/doctors/prescriptions/memed-mobile") {
            "Destino Memed não autorizado"
        }
        require(uri.rawQuery == "appointmentId=$expectedAppointmentId") {
            "Consulta Memed não corresponde à consulta atual"
        }
        return uri.toASCIIString()
    }
}
