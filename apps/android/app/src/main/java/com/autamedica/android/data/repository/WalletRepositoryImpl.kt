package com.autamedica.android.data.repository

import com.autamedica.android.domain.repository.WalletRepository
import com.autamedica.android.domain.repository.WalletBalanceDetails
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

    override suspend fun getWalletBalance(): Result<Long> =
        getWalletBalanceDetails().map { it.availableCreditCents }

    override suspend fun getWalletBalanceDetails(): Result<WalletBalanceDetails> = runCatching {
        val response = supabaseClient.functions.invoke("patients-wallet-balance")
        val dto = json.decodeFromString<WalletBalanceResponseDto>(response.bodyAsText())
        val currency = dto.currency?.uppercase()?.takeIf { it == "BRL" || it == "ARS" }
        WalletBalanceDetails(
            availableCreditCents = dto.availableCreditCents ?: dto.balance?.availableCreditCents ?: 0L,
            currency = currency,
        )
    }.onFailure { e ->
        SecureLog.warn("[WalletRepository] Could not verify wallet denomination: ${e.message}")
    }

    override suspend fun createTopupPreference(amountArs: Double): Result<String> = runCatching {
        require(amountArs.isFinite() && amountArs > 0) { "Importe inválido" }
        val verifiedCurrency = getWalletBalanceDetails().getOrThrow().currency
            ?: error("No se pudo verificar la moneda de la billetera")
        val payload = buildJsonObject {
            put("amount", amountArs)
        }
        val response = supabaseClient.functions("patients-wallet-topup", payload)
        val text = response.bodyAsText()
        val dto = json.decodeFromString<TopupResponseDto>(text)
        require(dto.currency == verifiedCurrency) {
            "La moneda del pago no coincide con la billetera ($verifiedCurrency)."
        }
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
    val currency: String? = null,
    @SerialName("available_credit_cents") val availableCreditCents: Long? = null,
    val balance: WalletBalanceInnerDto? = null,
)

@Serializable
private data class WalletBalanceInnerDto(
    @SerialName("available_credit_cents") val availableCreditCents: Long? = null,
)

@Serializable
private data class TopupResponseDto(
    val currency: String? = null,
    @SerialName("checkoutUrl") val checkoutUrl: String? = null,
    @SerialName("checkout_url") val checkoutUrlSnake: String? = null,
    @SerialName("init_point") val initPoint: String? = null,
)
