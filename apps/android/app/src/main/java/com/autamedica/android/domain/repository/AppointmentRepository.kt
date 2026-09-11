package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.DoctorBookingInfo

interface AppointmentRepository {
    suspend fun getUpcomingAppointments(): Result<List<Appointment>>
    suspend fun getAppointmentById(id: String): Result<Appointment>
    suspend fun updateAppointmentNotes(id: String, notes: String): Result<Unit>
    suspend fun updateAppointmentStatus(id: String, status: AppointmentStatus): Result<Unit> = Result.success(Unit)
    suspend fun clearCachedAppointmentsForCurrentUser(): Result<Unit>
    suspend fun getAvailableDoctors(specialty: String? = null): Result<List<DoctorBookingInfo>>
    suspend fun bookAppointment(
        doctorId: String,
        startTime: String,
        endTime: String,
        type: String = "telemedicine",
        reason: String? = null
    ): Result<Appointment>

    suspend fun getAvailableSlots(
        doctorId: String,
        date: String,
    ): Result<List<String>> = Result.success(emptyList())
}
