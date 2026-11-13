package com.autamedica.android.presentation.dashboard

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DashboardReserveDefaultsTest {
    @Test
    fun `dashboard never invents reserve credit balances`() {
        val state = DashboardUiState()

        assertThat(state.subscriptionTier).isEqualTo("free")
        assertThat(state.benefitBalanceCredits).isEqualTo(0)
        assertThat(state.maxCapCredits).isEqualTo(0)
        assertThat(state.walletBalanceCents).isEqualTo(0L)
    }
}
