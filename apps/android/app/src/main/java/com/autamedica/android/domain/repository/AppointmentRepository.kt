package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.Appointment

interface AppointmentRepository {
    suspend fun getUpcomingAppointments(): Result<List<Appointment>>
    suspend fun getAppointmentById(id: String): Result<Appointment>
    suspend fun clearCachedAppointmentsForCurrentUser(): Result<Unit>
}
