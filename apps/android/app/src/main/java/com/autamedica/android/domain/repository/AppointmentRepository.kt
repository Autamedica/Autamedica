package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.DoctorBookingInfo

interface AppointmentRepository {
    suspend fun getUpcomingAppointments(): Result<List<Appointment>>
    suspend fun getAppointmentById(id: String): Result<Appointment>
    suspend fun updateAppointmentNotes(id: String, notes: String): Result<Unit>
    suspend fun updateAppointmentStatus(id: String, status: AppointmentStatus): Result<Unit> = Result.failure(NotImplementedError("Operation not implemented"))
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
    ): Result<List<String>> = Result.failure(NotImplementedError("getAvailableSlots not implemented"))

    suspend fun createAppointmentPayment(
        appointmentId: String,
    ): Result<AppointmentPaymentExecution> = Result.failure(NotImplementedError("createAppointmentPayment not implemented"))

    suspend fun getAppointmentPaymentStatus(
        appointmentId: String,
    ): Result<String?> = Result.failure(NotImplementedError("getAppointmentPaymentStatus not implemented"))

    suspend fun cancelAppointment(id: String): Result<Unit> = Result.failure(NotImplementedError("Operation not implemented"))

    suspend fun rescheduleAppointment(
        id: String,
        newStartTime: String,
        newEndTime: String,
    ): Result<Unit> = Result.failure(NotImplementedError("Operation not implemented"))
}

data class AppointmentPaymentExecution(
    val status: String,
    val checkoutUrl: String? = null,
)
