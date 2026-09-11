package com.autamedica.android.data.repository

import com.autamedica.android.domain.repository.WalletRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WalletRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
) : WalletRepository {

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun getWalletBalance(): Result<Long> = runCatching {
        val response = supabaseClient.functions.invoke("patients-wallet-balance")
        val text = response.bodyAsText()
        val dto = json.decodeFromString<WalletBalanceResponseDto>(text)
        dto.availableCreditCents
            ?: dto.balance?.availableCreditCents
            ?: 0L
    }.onFailure { e ->
        SecureLog.warn("[WalletRepository] getWalletBalance failed: ${e.message}")
    }

    override suspend fun createTopupPreference(amountArs: Double): Result<String> = runCatching {
        val payload = buildJsonObject {
            put("amount", amountArs)
        }
        val response = supabaseClient.functions("patients-wallet-topup", payload)
        val text = response.bodyAsText()
        val dto = json.decodeFromString<TopupResponseDto>(text)
        dto.checkoutUrl
            ?: dto.checkoutUrlSnake
            ?: dto.initPoint
            ?: error("Missing checkoutUrl in response")
    }.onFailure { e ->
        SecureLog.warn("[WalletRepository] createTopupPreference failed: ${e.message}")
    }
}

@Serializable
private data class WalletBalanceResponseDto(
    @SerialName("available_credit_cents") val availableCreditCents: Long? = null,
    val balance: WalletBalanceInnerDto? = null,
)

@Serializable
private data class WalletBalanceInnerDto(
    @SerialName("available_credit_cents") val availableCreditCents: Long? = null,
)

@Serializable
private data class TopupResponseDto(
    @SerialName("checkoutUrl") val checkoutUrl: String? = null,
    @SerialName("checkout_url") val checkoutUrlSnake: String? = null,
    @SerialName("init_point") val initPoint: String? = null,
)
