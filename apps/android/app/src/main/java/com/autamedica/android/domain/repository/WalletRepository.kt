package com.autamedica.android.domain.repository

interface WalletRepository {
    suspend fun getWalletBalance(): Result<Long> // Devuelve available_credit_cents
    suspend fun createTopupPreference(amountArs: Double): Result<String> // Devuelve checkoutUrl
}
