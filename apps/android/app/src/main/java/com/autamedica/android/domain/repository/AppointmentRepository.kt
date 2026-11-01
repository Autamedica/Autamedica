package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.DoctorBookingInfo

interface AppointmentRepository {
    suspend fun getCareCountry(): Result<String?> = Result.success(null)
    suspend fun selectCareCountry(country: String): Result<Unit> = Result.failure(IllegalStateException("country_selection_unavailable"))
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

    suspend fun createDoctorAppointment(
        doctorId: String,
        patientId: String?,
        startTime: String,
        endTime: String,
        type: String = "telemedicine",
        notes: String? = null,
        guestName: String? = null,
        guestPhone: String? = null,
    ): Result<Appointment> = Result.failure(NotImplementedError("createDoctorAppointment not implemented"))

    suspend fun getAvailableSlots(
        doctorId: String,
        date: String,
    ): Result<List<String>> = Result.success(emptyList())

    suspend fun createAppointmentPayment(
        appointmentId: String,
    ): Result<AppointmentPaymentExecution> = Result.success(AppointmentPaymentExecution(status = "approved"))

    suspend fun getAppointmentPaymentStatus(
        appointmentId: String,
    ): Result<String?> = Result.success("approved")

    suspend fun cancelAppointment(id: String): Result<Unit> = Result.success(Unit)

    suspend fun rescheduleAppointment(
        id: String,
        newStartTime: String,
        newEndTime: String,
    ): Result<Unit> = Result.success(Unit)
}

data class AppointmentPaymentExecution(
    val status: String,
    val checkoutUrl: String? = null,
)

