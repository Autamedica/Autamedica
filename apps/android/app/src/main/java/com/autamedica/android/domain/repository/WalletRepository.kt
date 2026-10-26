package com.autamedica.android.domain.repository

data class WalletBalanceDetails(
    val availableCreditCents: Long,
    val currency: String?,
)

interface WalletRepository {
    suspend fun getWalletBalance(): Result<Long>

    /**
     * Currency must be sourced from the authenticated wallet endpoint.
     * Old test repositories can return a balance with unknown denomination,
     * which is never sufficient to initiate a topup.
     */
    suspend fun getWalletBalanceDetails(): Result<WalletBalanceDetails> =
        getWalletBalance().map { WalletBalanceDetails(it, null) }

    suspend fun createTopupPreference(amountArs: Double): Result<String>
}
