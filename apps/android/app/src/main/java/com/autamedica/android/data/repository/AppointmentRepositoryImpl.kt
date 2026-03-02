package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.repository.AppointmentRepository
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AppointmentRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
) : AppointmentRepository {

    override suspend fun getUpcomingAppointments(): Result<List<Appointment>> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No user ID found")

        val dtos = supabaseClient.postgrest
            .from("appointments")
            .select(Columns.ALL) {
                filter {
                    or {
                        eq("patient_id", userId)
                        eq("doctor_id", userId)
                    }
                    isIn("status", listOf("scheduled", "confirmed", "in_progress"))
                }
                order("start_time", Order.ASCENDING)
            }
            .decodeList<AppointmentDto>()

        dtos.map { it.toDomain() }
    }.onFailure {
        Timber.e(it, "[Appointments] Failed fetching upcoming")
    }

    override suspend fun getAppointmentById(id: String): Result<Appointment> = runCatching {
        val dto = supabaseClient.postgrest
            .from("appointments")
            .select(Columns.ALL) {
                filter { eq("id", id) }
            }
            .decodeSingle<AppointmentDto>()

        dto.toDomain()
    }.onFailure {
        Timber.e(it, "[Appointments] Failed fetching appointment $id")
    }
}

@Serializable
private data class AppointmentDto(
    val id: String,
    @SerialName("patient_id") val patientId: String? = null,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("duration_minutes") val durationMinutes: Int? = null,
    val type: String? = null,
    val status: String,
    val notes: String? = null,
    @SerialName("meeting_url") val meetingUrl: String? = null,
) {
    fun toDomain() = Appointment(
        id = id,
        patientId = patientId,
        doctorId = doctorId,
        startTime = startTime,
        endTime = endTime,
        durationMinutes = durationMinutes,
        type = parseType(type),
        status = parseStatus(status),
        notes = notes,
        meetingUrl = meetingUrl,
    )

    private fun parseType(raw: String?): AppointmentType = when (raw?.lowercase()) {
        "consultation" -> AppointmentType.CONSULTATION
        "follow_up" -> AppointmentType.FOLLOW_UP
        "emergency" -> AppointmentType.EMERGENCY
        "telemedicine" -> AppointmentType.TELEMEDICINE
        "lab_test" -> AppointmentType.LAB_TEST
        "checkup" -> AppointmentType.CHECKUP
        else -> AppointmentType.CONSULTATION
    }

    private fun parseStatus(raw: String): AppointmentStatus = when (raw.lowercase()) {
        "scheduled" -> AppointmentStatus.SCHEDULED
        "confirmed" -> AppointmentStatus.CONFIRMED
        "in_progress" -> AppointmentStatus.IN_PROGRESS
        "completed" -> AppointmentStatus.COMPLETED
        "cancelled" -> AppointmentStatus.CANCELLED
        "no_show" -> AppointmentStatus.NO_SHOW
        else -> AppointmentStatus.SCHEDULED
    }
}
