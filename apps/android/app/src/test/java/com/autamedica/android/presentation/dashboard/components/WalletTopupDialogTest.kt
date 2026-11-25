package com.autamedica.android.presentation.dashboard.components

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class WalletTopupDialogTest {

    @Test
    fun `BRL wallet shows Brazilian Real quick amounts and prefix`() {
        assertThat(isSupportedWalletCurrency("BRL")).isTrue()
        assertThat(walletDefaultAmountFor("BRL")).isEqualTo("50")
        assertThat(walletQuickAmountsFor("BRL")).containsExactly("20", "50", "100").inOrder()
        assertThat(walletCurrencyPrefixFor("BRL")).isEqualTo("R$ ")
    }

    @Test
    fun `ARS wallet shows Argentine Peso quick amounts and prefix`() {
        assertThat(isSupportedWalletCurrency("ARS")).isTrue()
        assertThat(walletDefaultAmountFor("ARS")).isEqualTo("5000")
        assertThat(walletQuickAmountsFor("ARS")).containsExactly("2000", "5000", "10000").inOrder()
        assertThat(walletCurrencyPrefixFor("ARS")).isEqualTo("$ ")
    }

    @Test
    fun `unresolved or unsupported currency never falls back to ARS values`() {
        for (invalid in listOf(null, "", "USD", "EUR")) {
            assertThat(isSupportedWalletCurrency(invalid)).isFalse()
            assertThat(walletDefaultAmountFor(invalid)).isEmpty()
            assertThat(walletQuickAmountsFor(invalid)).isEmpty()
            assertThat(walletCurrencyPrefixFor(invalid)).isNull()
        }
    }
}
