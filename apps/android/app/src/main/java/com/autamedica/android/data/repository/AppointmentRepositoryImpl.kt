package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.coroutines.flow.firstOrNull
import javax.inject.Inject
import javax.inject.Singleton
import com.autamedica.android.data.local.room.dao.AppointmentDao
import com.autamedica.android.data.local.room.entity.toDomain
import com.autamedica.android.data.local.room.entity.toEntity

private const val KEY_CACHED_RECORD_ID = "cached_record_id"

@Singleton
class AppointmentRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
    private val appointmentDao: AppointmentDao,
) : AppointmentRepository {

    override suspend fun getUpcomingAppointments(): Result<List<Appointment>> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No user ID found")
        val role = securePreferences.getString(SecurePreferences.KEY_USER_ROLE) ?: "patient"

        // Resolve record IDs: appointments.patient_id → patients.id, appointments.doctor_id → doctors.id
        val recordId = if (role == "doctor") {
            supabaseClient.postgrest.from("doctors")
                .select(Columns.list("id")) { filter { eq("user_id", userId) } }
                .decodeSingle<RecordIdDto>().id
        } else {
            supabaseClient.postgrest.from("patients")
                .select(Columns.list("id")) { filter { eq("user_id", userId) } }
                .decodeSingle<RecordIdDto>().id
        }

        // Cache recordId for offline fallback
        securePreferences.putString(KEY_CACHED_RECORD_ID, recordId)

        val filterColumn = if (role == "doctor") "doctor_id" else "patient_id"

        val dtos = supabaseClient.postgrest
            .from("appointments")
            .select(Columns.ALL) {
                filter {
                    eq(filterColumn, recordId)
                    isIn("status", listOf("scheduled", "confirmed", "in_progress"))
                }
                order("start_time", Order.ASCENDING)
            }
            .decodeList<AppointmentDto>()

        val domainModels = dtos.map { it.toDomain() }

        // Phase 3: Cache data to Room for offline access
        appointmentDao.insertAppointments(domainModels.map { it.toEntity(ownerUserId = userId) })

        domainModels
    }.recoverCatching {
        SecureLog.error("[Appointments] Network failed, falling back to offline cache", it)
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No authenticated user available for offline appointments")
        val cachedEntities = appointmentDao.getAppointmentsForUser(userId).firstOrNull() ?: emptyList()
        cachedEntities.map { entity -> entity.toDomain() }
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
        SecureLog.error("[Appointments] Failed fetching appointment", it)
    }

    override suspend fun clearCachedAppointmentsForCurrentUser(): Result<Unit> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: return@runCatching
        appointmentDao.clearAppointmentsForUser(userId)
        securePreferences.remove(KEY_CACHED_RECORD_ID)
    }.onFailure {
        SecureLog.error("[Appointments] Failed clearing cached appointments", it)
    }
}

@Serializable
private data class RecordIdDto(val id: String)

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
