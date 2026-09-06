package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.logging.SecureLog
import java.util.UUID
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
                .decodeSingleOrNull<RecordIdDto>()?.id
        } else {
            supabaseClient.postgrest.from("patients")
                .select(Columns.list("id")) { filter { eq("user_id", userId) } }
                .decodeSingleOrNull<RecordIdDto>()?.id
        }

        if (recordId == null) {
            // Patient or doctor record does not exist yet (e.g. fresh account or pending onboarding)
            return@runCatching emptyList<Appointment>()
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

    override suspend fun updateAppointmentNotes(id: String, notes: String): Result<Unit> = runCatching {
        supabaseClient.postgrest
            .from("appointments")
            .update(mapOf("notes" to notes)) {
                filter { eq("id", id) }
            }
        Unit
    }.onFailure {
        SecureLog.error("[Appointments] Failed updating appointment notes", it)
    }

    override suspend fun clearCachedAppointmentsForCurrentUser(): Result<Unit> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: return@runCatching
        appointmentDao.clearAppointmentsForUser(userId)
        securePreferences.remove(KEY_CACHED_RECORD_ID)
    }.onFailure {
        SecureLog.error("[Appointments] Failed clearing cached appointments", it)
    }

    override suspend fun getAvailableDoctors(specialty: String?): Result<List<DoctorBookingInfo>> = runCatching {
        val doctors = try {
            supabaseClient.postgrest
                .from("doctors")
                .select(Columns.ALL) {
                    filter { eq("active", true) }
                }
                .decodeList<DoctorBookingRowDto>()
        } catch (e: Exception) {
            SecureLog.warn("[Appointments] Failed fetching active doctors with filter: ${e.message}")
            supabaseClient.postgrest
                .from("doctors")
                .select(Columns.ALL)
                .decodeList<DoctorBookingRowDto>()
        }

        if (doctors.isEmpty()) {
            return@runCatching emptyList()
        }

        val userIds = doctors.map { it.userId }.filter { it.isNotBlank() }
        val profilesMap = if (userIds.isNotEmpty()) {
            try {
                supabaseClient.postgrest
                    .from("profiles")
                    .select(Columns.list("user_id", "first_name", "last_name", "avatar_url")) {
                        filter { isIn("user_id", userIds) }
                    }
                    .decodeList<DoctorProfileBookingDto>()
                    .associateBy { it.userId }
            } catch (e: Exception) {
                SecureLog.warn("[Appointments] Failed fetching doctor profiles: ${e.message}")
                emptyMap()
            }
        } else emptyMap()

        val doctorIds = doctors.map { it.id }
        val specialtiesMap = if (doctorIds.isNotEmpty()) {
            try {
                supabaseClient.postgrest
                    .from("doctor_specialties")
                    .select(Columns.list("doctor_id", "specialty_name")) {
                        filter { isIn("doctor_id", doctorIds) }
                    }
                    .decodeList<DoctorSpecialtyBookingDto>()
                    .groupBy({ it.doctorId }, { it.specialtyName })
            } catch (e: Exception) {
                SecureLog.warn("[Appointments] Failed fetching doctor_specialties: ${e.message}")
                emptyMap()
            }
        } else emptyMap()

        val defaultSlots = listOf("09:00", "10:00", "11:30", "14:00", "15:30", "17:00")

        val doctorList = doctors.map { doc ->
            val profile = profilesMap[doc.userId]
            val firstName = profile?.firstName?.trim().orEmpty()
            val lastName = profile?.lastName?.trim().orEmpty()
            val fullName = when {
                firstName.isNotBlank() && lastName.isNotBlank() -> "Dr. $firstName $lastName"
                firstName.isNotBlank() -> "Dr. $firstName"
                else -> "Médico Especialista"
            }
            val extraSpecs = specialtiesMap[doc.id].orEmpty()
            val docSpecialty = doc.specialty?.takeIf { it.isNotBlank() }
                ?: extraSpecs.firstOrNull()
                ?: "Medicina General"

            DoctorBookingInfo(
                id = doc.id,
                userId = doc.userId,
                name = fullName,
                specialty = docSpecialty,
                licenseNumber = doc.licenseNumber?.takeIf { it.isNotBlank() } ?: "MN 145.890",
                consultationFee = doc.consultationFee,
                avatarUrl = profile?.avatarUrl,
                availableSlots = defaultSlots,
            )
        }

        if (!specialty.isNullOrBlank() && !specialty.equals("todas", ignoreCase = true) && !specialty.equals("all", ignoreCase = true)) {
            doctorList.filter { it.specialty.contains(specialty, ignoreCase = true) }
        } else {
            doctorList
        }
    }.onFailure {
        SecureLog.error("[Appointments] Failed fetching available doctors", it)
    }

    override suspend fun bookAppointment(
        doctorId: String,
        startTime: String,
        endTime: String,
        type: String,
        reason: String?,
    ): Result<Appointment> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No authenticated user found")

        var patientId = supabaseClient.postgrest.from("patients")
            .select(Columns.list("id")) { filter { eq("user_id", userId) } }
            .decodeSingleOrNull<RecordIdDto>()?.id

        if (patientId == null) {
            patientId = try {
                supabaseClient.postgrest.from("patients")
                    .insert(mapOf("user_id" to userId)) {
                        select(Columns.list("id"))
                    }
                    .decodeSingle<RecordIdDto>().id
            } catch (e: Exception) {
                SecureLog.warn("[Appointments] Could not create patient record: ${e.message}")
                userId
            }
        }

        val roomId = "room-${UUID.randomUUID()}"

        val dto = supabaseClient.postgrest
            .from("appointments")
            .insert(
                CreateAppointmentDto(
                    patientId = patientId,
                    doctorId = doctorId,
                    startTime = startTime,
                    endTime = endTime,
                    status = "scheduled",
                    type = type,
                    notes = reason,
                    meetingUrl = roomId,
                )
            ) {
                select(Columns.ALL)
            }
            .decodeSingle<AppointmentDto>()

        val domain = dto.toDomain()

        try {
            appointmentDao.insertAppointments(listOf(domain.toEntity(ownerUserId = userId)))
        } catch (e: Exception) {
            SecureLog.warn("[Appointments] Failed to cache appointment in Room: ${e.message}")
        }

        domain
    }.onFailure {
        SecureLog.error("[Appointments] Failed booking appointment", it)
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

@Serializable
private data class DoctorBookingRowDto(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("license_number") val licenseNumber: String? = null,
    val specialty: String? = null,
    @SerialName("consultation_fee") val consultationFee: Double? = null,
    val active: Boolean = true,
)

@Serializable
private data class DoctorProfileBookingDto(
    @SerialName("user_id") val userId: String,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

@Serializable
private data class DoctorSpecialtyBookingDto(
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("specialty_name") val specialtyName: String,
)

@Serializable
private data class CreateAppointmentDto(
    @SerialName("patient_id") val patientId: String,
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String,
    val status: String = "scheduled",
    val type: String = "telemedicine",
    val notes: String? = null,
    @SerialName("meeting_url") val meetingUrl: String? = null,
)
