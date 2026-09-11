package com.autamedica.android.domain.model

object AppointmentTransitionRules {

    private val VALID_TRANSITIONS: Map<AppointmentStatus, Set<AppointmentStatus>> = mapOf(
        AppointmentStatus.PAYMENT_PENDING to setOf(
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.CANCELLED,
        ),
        AppointmentStatus.SCHEDULED to setOf(
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.CANCELLED,
            AppointmentStatus.IN_PROGRESS,
            AppointmentStatus.NO_SHOW,
        ),
        AppointmentStatus.CONFIRMED to setOf(
            AppointmentStatus.IN_PROGRESS,
            AppointmentStatus.CANCELLED,
            AppointmentStatus.NO_SHOW,
        ),
        AppointmentStatus.IN_PROGRESS to setOf(
            AppointmentStatus.COMPLETED,
        ),
    )

    fun isTransitionAllowed(from: AppointmentStatus, to: AppointmentStatus): Boolean {
        return to in (VALID_TRANSITIONS[from] ?: emptySet())
    }

    fun getValidTransitions(from: AppointmentStatus): Set<AppointmentStatus> {
        return VALID_TRANSITIONS[from] ?: emptySet()
    }

    fun isReschedulable(from: AppointmentStatus): Boolean {
        return from in setOf(
            AppointmentStatus.PAYMENT_PENDING,
            AppointmentStatus.SCHEDULED,
            AppointmentStatus.CONFIRMED,
        )
    }
}