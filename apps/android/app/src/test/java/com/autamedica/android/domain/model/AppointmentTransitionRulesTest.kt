package com.autamedica.android.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppointmentTransitionRulesTest {

    @Test
    fun `payment pending only transitions to confirmed or cancelled`() {
        assertTrue(AppointmentTransitionRules.isTransitionAllowed(AppointmentStatus.PAYMENT_PENDING, AppointmentStatus.CONFIRMED))
        assertTrue(AppointmentTransitionRules.isTransitionAllowed(AppointmentStatus.PAYMENT_PENDING, AppointmentStatus.CANCELLED))
        assertFalse(AppointmentTransitionRules.isTransitionAllowed(AppointmentStatus.PAYMENT_PENDING, AppointmentStatus.IN_PROGRESS))
        assertFalse(AppointmentTransitionRules.isTransitionAllowed(AppointmentStatus.PAYMENT_PENDING, AppointmentStatus.COMPLETED))
    }

    @Test
    fun `in progress only transitions to completed`() {
        assertEquals(
            setOf(AppointmentStatus.COMPLETED),
            AppointmentTransitionRules.getValidTransitions(AppointmentStatus.IN_PROGRESS),
        )
        assertTrue(AppointmentTransitionRules.isTransitionAllowed(AppointmentStatus.IN_PROGRESS, AppointmentStatus.COMPLETED))
        assertFalse(AppointmentTransitionRules.isTransitionAllowed(AppointmentStatus.IN_PROGRESS, AppointmentStatus.CANCELLED))
    }

    @Test
    fun `terminal states have no valid outgoing transitions`() {
        assertTrue(AppointmentTransitionRules.getValidTransitions(AppointmentStatus.COMPLETED).isEmpty())
        assertTrue(AppointmentTransitionRules.getValidTransitions(AppointmentStatus.CANCELLED).isEmpty())
        assertTrue(AppointmentTransitionRules.getValidTransitions(AppointmentStatus.NO_SHOW).isEmpty())
    }

    @Test
    fun `reschedulable only allows pre-consultation statuses`() {
        assertTrue(AppointmentTransitionRules.isReschedulable(AppointmentStatus.PAYMENT_PENDING))
        assertTrue(AppointmentTransitionRules.isReschedulable(AppointmentStatus.SCHEDULED))
        assertTrue(AppointmentTransitionRules.isReschedulable(AppointmentStatus.CONFIRMED))
        assertFalse(AppointmentTransitionRules.isReschedulable(AppointmentStatus.IN_PROGRESS))
        assertFalse(AppointmentTransitionRules.isReschedulable(AppointmentStatus.COMPLETED))
        assertFalse(AppointmentTransitionRules.isReschedulable(AppointmentStatus.CANCELLED))
    }
}
