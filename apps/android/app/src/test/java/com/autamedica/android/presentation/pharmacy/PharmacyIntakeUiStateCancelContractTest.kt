package com.autamedica.android.presentation.pharmacy

import com.autamedica.android.domain.model.PharmacyConsultationStatus
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PharmacyIntakeUiStateCancelContractTest {

    @Test
    fun `blocks cancellation while Jordan dispatch payment is not yet approved`() {
        val state = PharmacyIntakeUiState(
            activeRequestId = "req-jordan-1",
            status = PharmacyConsultationStatus.PENDING,
            waitingSeconds = 20 * 60,
            careCountry = "BR",
            referralCode = "JORDAN",
            paymentStatus = "pending",
        )

        assertTrue(state.requiresDispatchPayment)
        assertFalse(state.canCancelRequest)
    }

    @Test
    fun `allows cancellation after 15 minutes once Jordan dispatch payment is approved`() {
        val state = PharmacyIntakeUiState(
            activeRequestId = "req-jordan-1",
            status = PharmacyConsultationStatus.PENDING,
            waitingSeconds = 20 * 60,
            careCountry = "BR",
            referralCode = "JORDAN",
            paymentStatus = "approved",
        )

        assertTrue(state.requiresDispatchPayment)
        assertTrue(state.canCancelRequest)
    }

    @Test
    fun `allows cancellation after 15 minutes when dispatch does not require payment`() {
        val state = PharmacyIntakeUiState(
            activeRequestId = "req-free-1",
            status = PharmacyConsultationStatus.PENDING,
            waitingSeconds = 20 * 60,
            careCountry = "AR",
            referralCode = "",
            priceMinor = null,
            paymentStatus = "not_started",
        )

        assertFalse(state.requiresDispatchPayment)
        assertTrue(state.canCancelRequest)
    }
}
