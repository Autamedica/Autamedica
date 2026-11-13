package com.autamedica.android.presentation.doctors.accounting

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DoctorAccountingStateTest {
    @Test
    fun initialStateContainsNoSimulatedIncomeOrTransactions() {
        val state = DoctorAccountingState()
        assertThat(state.isLoading).isTrue()
        assertThat(state.paidAmountCents).isEqualTo(0L)
        assertThat(state.pendingSettlementCents).isEqualTo(0L)
        assertThat(state.totalConsultationsMonth).isEqualTo(0)
        assertThat(state.currency).isNull()
        assertThat(state.transactions).isEmpty()
    }
}
