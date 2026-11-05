package com.autamedica.android.data.repository

import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.DoctorAvailabilitySlot
import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.InCallDocumentPolicy
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.PatientClinicalContext
import com.autamedica.android.domain.model.PatientDetail
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DoctorRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
) : DoctorRepository {

    override suspend fun getDoctorProfile(userId: String): Result<DoctorProfile> = runCatching {
        val dto = supabaseClient.postgrest
            .from("doctors")
            .select(Columns.ALL) {
                filter { eq("user_id", userId) }
            }
            .decodeSingle<DoctorDto>()

        val sssValidationStatus = runCatching {
            supabaseClient.postgrest
                .from("profiles")
                .select(Columns.list("sss_validation_status")) {
                    filter { eq("user_id", userId) }
                }
                .decodeSingle<DoctorProfileValidationDto>()
                .sssValidationStatus
        }.getOrElse {
            SecureLog.warn("[DoctorRepo] Failed fetching doctor validation status: ${it.message}")
            null
        }

        dto.toDomain(sssValidationStatus = sssValidationStatus)
    }.onFailure {
        SecureLog.error("[DoctorRepo] Failed fetching doctor profile", it)
    }

    override suspend fun getDoctorStats(doctorId: String): Result<DoctorStats> = runCatching {
        // The clinic's local calendar day, not midnight UTC.
        val localZone = ZoneId.systemDefault()
        val todayStart = LocalDate.now(localZone).atStartOfDay(localZone).toOffsetDateTime()
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
        val todayEnd = LocalDate.now(localZone).plusDays(1).atStartOfDay(localZone).toOffsetDateTime()
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
        val weekStart = LocalDate.now(localZone).minusDays(6).atStartOfDay(localZone).toOffsetDateTime()
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

        // Today's appointments (all statuses except cancelled)
        val todayAppointments = supabaseClient.postgrest
            .from("appointments")
            .select(Columns.list("id", "status")) {
                filter {
                    eq("doctor_id", doctorId)
                    gte("start_time", todayStart)
                    lt("start_time", todayEnd)
                    neq("status", "cancelled")
                }
            }
            .decodeList<AppointmentStatusDto>()

        val completedToday = todayAppointments.count { it.status == "completed" }
        val cancelledToday = supabaseClient.postgrest
            .from("appointments")
            .select(Columns.list("id")) {
                filter {
                    eq("doctor_id", doctorId)
                    gte("start_time", todayStart)
                    lt("start_time", todayEnd)
                    eq("status", "cancelled")
                }
            }
            .decodeList<IdDto>()
            .size

        // Pending (scheduled or confirmed, future)
        val now = OffsetDateTime.now(ZoneOffset.UTC)
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
        val pendingAppointments = supabaseClient.postgrest
            .from("appointments")
            .select(Columns.list("id")) {
                filter {
                    eq("doctor_id", doctorId)
                    gte("start_time", now)
                    isIn("status", listOf("scheduled", "confirmed"))
                }
            }
            .decodeList<IdDto>()
            .size

        // Weekly appointments
        val weeklyAppointments = supabaseClient.postgrest
            .from("appointments")
            .select(Columns.list("id")) {
                filter {
                    eq("doctor_id", doctorId)
                    gte("start_time", weekStart)
                    lt("start_time", todayEnd)
                    neq("status", "cancelled")
                }
            }
            .decodeList<IdDto>()
            .size

        // Total unique patients
        val totalPatients = supabaseClient.postgrest
            .from("doctor_patient")
            .select(Columns.list("patient_id")) {
                filter { eq("doctor_id", doctorId) }
            }
            .decodeList<PatientIdDto>()
            .size

        DoctorStats(
            todayAppointments = todayAppointments.size,
            pendingAppointments = pendingAppointments,
            completedToday = completedToday,
            totalPatients = totalPatients,
            weeklyAppointments = weeklyAppointments,
            cancelledToday = cancelledToday,
        )
    }.onFailure {
        SecureLog.error("[DoctorRepo] Failed fetching doctor stats", it)
    }

    override suspend fun getDoctorPatients(doctorId: String): Result<List<PatientSummary>> = runCatching {
        // Get patient IDs linked to this doctor
        val patientLinks = supabaseClient.postgrest
            .from("doctor_patient")
            .select(Columns.list("patient_id")) {
                filter { eq("doctor_id", doctorId) }
            }
            .decodeList<PatientIdDto>()

        if (patientLinks.isEmpty()) return@runCatching emptyList()

        val patientIds = patientLinks.map { it.patientId }

        // Get patient details with profile info
        val patients = supabaseClient.postgrest
            .from("patients")
            .select(Columns.list("id", "user_id", "birth_date", "gender")) {
                filter { isIn("id", patientIds) }
            }
            .decodeList<PatientDto>()

        // Get profile info for each patient
        val userIds = patients.mapNotNull { it.userId }
        val profiles = if (userIds.isNotEmpty()) {
            supabaseClient.postgrest
                .from("profiles")
                .select(Columns.list("user_id", "first_name", "last_name", "avatar_url")) {
                    filter { isIn("user_id", userIds) }
                }
                .decodeList<DoctorPatientProfileDto>()
                .associateBy { it.userId }
        } else emptyMap()

        // Get last appointment for each patient
        val appointments = supabaseClient.postgrest
            .from("appointments")
            .select(Columns.list("patient_id", "start_time", "status")) {
                filter {
                    eq("doctor_id", doctorId)
                    isIn("patient_id", patientIds)
                }
                order("start_time", Order.DESCENDING)
            }
            .decodeList<PatientAppointmentDto>()

        val lastAppointmentMap = appointments
            .filter { it.status != "cancelled" }
            .groupBy { it.patientId }
            .mapValues { (_, appts) ->
                val nowDt = OffsetDateTime.now()
                val past = appts.filter {
                    try {
                        OffsetDateTime.parse(it.startTime).isBefore(nowDt)
                    } catch (_: Exception) { false }
                }
                val future = appts.filter {
                    try {
                        OffsetDateTime.parse(it.startTime).isAfter(nowDt)
                    } catch (_: Exception) { false }
                }
                past.firstOrNull()?.startTime to future.lastOrNull()?.startTime
            }

        patients.map { patient ->
            val profile = profiles[patient.userId]
            val (lastAppt, nextAppt) = lastAppointmentMap[patient.id] ?: (null to null)
            val apptCount = appointments.count { it.patientId == patient.id && it.status != "cancelled" }

            PatientSummary(
                id = patient.id,
                userId = patient.userId ?: "",
                firstName = profile?.firstName ?: "",
                lastName = profile?.lastName ?: "",
                avatarUrl = profile?.avatarUrl,
                birthDate = patient.birthDate,
                gender = patient.gender,
                lastAppointment = lastAppt,
                nextAppointment = nextAppt,
                appointmentCount = apptCount,
            )
        }.sortedByDescending { it.appointmentCount }
    }.onFailure {
        SecureLog.error("[DoctorRepo] Failed fetching doctor patients", it)
    }

    override suspend fun getPatientDetail(doctorId: String, patientId: String): Result<PatientDetail> = runCatching {
        // Get patient basic data
        val patient = supabaseClient.postgrest
            .from("patients")
            .select(Columns.ALL) {
                filter { eq("id", patientId) }
            }
            .decodeSingle<PatientFullDto>()

        // Get profile info
        val profile = patient.userId?.let { uid ->
            supabaseClient.postgrest
                .from("profiles")
                .select(Columns.list("user_id", "first_name", "last_name", "avatar_url", "phone")) {
                    filter { eq("user_id", uid) }
                }
                .decodeSingle<PatientProfileFullDto>()
        }

        // Get email from auth (from profiles table which has it)
        val email = patient.userId?.let { uid ->
            try {
                supabaseClient.postgrest
                    .from("profiles")
                    .select(Columns.list("email")) {
                        filter { eq("user_id", uid) }
                    }
                    .decodeSingle<EmailDto>()
                    .email
            } catch (_: Exception) { null }
        }

        // Get appointment history for this patient with this doctor
        val appointments = supabaseClient.postgrest
            .from("appointments")
            .select(Columns.list(
                "id", "patient_id", "doctor_id", "start_time", "end_time",
                "duration_minutes", "type", "status", "notes", "meeting_url",
            )) {
                filter {
                    eq("doctor_id", doctorId)
                    eq("patient_id", patientId)
                }
                order("start_time", Order.DESCENDING)
            }
            .decodeList<AppointmentFullDto>()

        val nowDt = OffsetDateTime.now()
        val pastAppointments = appointments.filter {
            try {
                OffsetDateTime.parse(it.startTime).isBefore(nowDt)
            } catch (_: Exception) { true }
        }
        val futureAppointments = appointments.filter {
            try {
                OffsetDateTime.parse(it.startTime).isAfter(nowDt)
            } catch (_: Exception) { false }
        }

        PatientDetail(
            id = patient.id,
            userId = patient.userId ?: "",
            firstName = profile?.firstName ?: "",
            lastName = profile?.lastName ?: "",
            avatarUrl = profile?.avatarUrl,
            email = email,
            phone = profile?.phone,
            birthDate = patient.birthDate,
            gender = patient.gender,
            bloodType = patient.bloodType,
            allergies = patient.allergies,
            appointmentHistory = appointments.map { it.toDomain() },
            totalAppointments = appointments.count { it.status != "cancelled" },
            lastAppointment = pastAppointments.firstOrNull()?.startTime,
            nextAppointment = futureAppointments.lastOrNull()?.startTime,
        )
    }.onFailure {
        SecureLog.error("[DoctorRepo] Failed fetching patient detail", it)
    }

    override suspend fun getDoctorAvailability(doctorId: String): Result<List<DoctorAvailabilitySlot>> = runCatching {
        val dtos = supabaseClient.postgrest
            .from("doctor_availability")
            .select(Columns.ALL) {
                filter {
                    eq("doctor_id", doctorId)
                    eq("is_active", true)
                }
                order("day_of_week", Order.ASCENDING)
                order("start_time", Order.ASCENDING)
            }
            .decodeList<DoctorAvailabilityDto>()

        // Check if fake 24/7 preset exists (matching Web: 7 days, 00:00 to 23:59)
        val isFake = dtos.size >= 7 && dtos.all {
            it.startTime.startsWith("00:00") && it.endTime.startsWith("23:59")
        }
        if (isFake) emptyList() else dtos.map { it.toDomain() }
    }.onFailure {
        SecureLog.error("[DoctorRepo] Failed fetching doctor availability", it)
    }

    override suspend fun saveDoctorAvailability(
        doctorId: String,
        slots: List<DoctorAvailabilitySlot>,
    ): Result<Unit> = runCatching {
        // Delete existing availability for this doctor
        supabaseClient.postgrest
            .from("doctor_availability")
            .delete {
                filter { eq("doctor_id", doctorId) }
            }

        // Insert new slots
        if (slots.isNotEmpty()) {
            val insertRows = slots.map { s ->
                DoctorAvailabilityDto(
                    doctorId = doctorId,
                    dayOfWeek = s.dayOfWeek,
                    startTime = if (s.startTime.length == 5) "${s.startTime}:00" else s.startTime,
                    endTime = if (s.endTime.length == 5) "${s.endTime}:00" else s.endTime,
                    slotDuration = s.slotDuration,
                    location = s.location,
                    isActive = s.isActive,
                )
            }
            supabaseClient.postgrest
                .from("doctor_availability")
                .insert(insertRows)
        }
        Unit
    }.onFailure {
        SecureLog.error("[DoctorRepo] Failed saving doctor availability", it)
    }

    override suspend fun getPatientClinicalContext(patientId: String): Result<PatientClinicalContext> = runCatching {
        val anamnesisList = supabaseClient.postgrest
            .from("anamnesis")
            .select(Columns.ALL) {
                filter { eq("patient_id", patientId) }
                order("updated_at", Order.DESCENDING)
                limit(1)
            }
            .decodeList<AnamnesisContextDto>()

        val anamnesis = anamnesisList.firstOrNull() ?: return@runCatching PatientClinicalContext(hasAnamnesis = false)

        val sections = supabaseClient.postgrest
            .from("anamnesis_sections")
            .select(Columns.ALL) {
                filter { eq("anamnesis_id", anamnesis.id) }
            }
            .decodeList<AnamnesisContextSectionDto>()

        var chiefComplaint: String? = null
        val allergies = mutableListOf<String>()
        var medications: String? = null
        val chronicDiseases = mutableListOf<String>()

        for (sec in sections) {
            val sectionName = sec.section.lowercase()
            val stringValues = sec.data.values.mapNotNull {
                runCatching { it.jsonPrimitive.contentOrNull }.getOrNull()
            }

            when {
                sectionName.contains("motivo") -> {
                    val complaint = stringValues.firstOrNull { it.isNotBlank() }
                    if (complaint != null) {
                        chiefComplaint = complaint
                    }
                }
                sectionName.contains("alergia") -> {
                    stringValues.forEach { valStr ->
                        if (!valStr.contains("no documentado", ignoreCase = true) && !valStr.contains("niega", ignoreCase = true)) {
                            allergies.addAll(valStr.split(",").map { it.trim() }.filter { it.isNotBlank() })
                        }
                    }
                }
                sectionName.contains("medicamento") || sectionName.contains("medication") -> {
                    val medStr = stringValues.firstOrNull { 
                        it.isNotBlank() && !it.contains("no documentado", ignoreCase = true) && !it.contains("niega", ignoreCase = true)
                    }
                    if (medStr != null) {
                        medications = medStr
                    }
                }
                sectionName.contains("enfermedad") || sectionName.contains("patolog") || sectionName.contains("condition") -> {
                    stringValues.forEach { valStr ->
                        if (!valStr.contains("no documentado", ignoreCase = true) && !valStr.contains("niega", ignoreCase = true)) {
                            chronicDiseases.addAll(valStr.split(",").map { it.trim() }.filter { it.isNotBlank() })
                        }
                    }
                }
            }
        }

        PatientClinicalContext(
            hasAnamnesis = true,
            chiefComplaint = chiefComplaint,
            allergies = allergies.distinct(),
            medications = medications,
            chronicDiseases = chronicDiseases.distinct(),
        )
    }.onFailure {
        SecureLog.error("[DoctorRepo] Failed fetching patient clinical context", it)
    }

    override suspend fun resolvePatientNames(patientIds: List<String>): Result<Map<String, String>> = runCatching {
        if (patientIds.isEmpty()) return@runCatching emptyMap()

        val patients = supabaseClient.postgrest
            .from("patients")
            .select(Columns.list("id", "user_id")) {
                filter { isIn("id", patientIds) }
            }
            .decodeList<PatientIdUserDto>()

        val userIds = patients.mapNotNull { it.userId }.distinct()
        if (userIds.isEmpty()) return@runCatching emptyMap()

        val profiles = supabaseClient.postgrest
            .from("profiles")
            .select(Columns.list("user_id", "first_name", "last_name")) {
                filter { isIn("user_id", userIds) }
            }
            .decodeList<DoctorPatientProfileDto>()
            .associateBy { it.userId }

        val nameMap = mutableMapOf<String, String>()
        for (patient in patients) {
            val profile = profiles[patient.userId]
            if (profile != null) {
                val fullName = "${profile.firstName.orEmpty()} ${profile.lastName.orEmpty()}".trim()
                if (fullName.isNotBlank()) {
                    nameMap[patient.id] = fullName
                }
            }
        }
        nameMap
    }.onFailure {
        SecureLog.error("[DoctorRepo] Failed resolving patient names", it)
    }

    override suspend fun resolvePatientSummaries(patientIds: List<String>): Result<Map<String, PatientSummary>> = runCatching {
        if (patientIds.isEmpty()) return@runCatching emptyMap()

        val patients = supabaseClient.postgrest
            .from("patients")
            .select(Columns.list("id", "user_id", "birth_date", "gender")) {
                filter { isIn("id", patientIds) }
            }
            .decodeList<PatientDto>()

        val userIds = patients.mapNotNull { it.userId }.distinct()
        val profiles = if (userIds.isNotEmpty()) {
            supabaseClient.postgrest
                .from("profiles")
                .select(Columns.list("user_id", "first_name", "last_name", "avatar_url")) {
                    filter { isIn("user_id", userIds) }
                }
                .decodeList<DoctorPatientProfileDto>()
                .associateBy { it.userId }
        } else emptyMap()

        val map = mutableMapOf<String, PatientSummary>()
        for (patient in patients) {
            val profile = profiles[patient.userId]
            val summary = PatientSummary(
                id = patient.id,
                userId = patient.userId ?: "",
                firstName = profile?.firstName.orEmpty(),
                lastName = profile?.lastName.orEmpty(),
                avatarUrl = profile?.avatarUrl,
                birthDate = patient.birthDate,
                gender = patient.gender,
            )
            map[patient.id] = summary
            if (!patient.userId.isNullOrBlank()) {
                map[patient.userId] = summary
            }
        }
        map
    }.onFailure {
        SecureLog.error("[DoctorRepo] Failed resolving patient summaries", it)
    }
}

// ── DTOs ────────────────────────────────────────────────────────────────────

@Serializable
private data class DoctorDto(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("license_number") val licenseNumber: String? = null,
    val specialty: String? = null,
    val subspecialty: String? = null,
    @SerialName("years_experience") val yearsExperience: Int? = null,
    val bio: String? = null,
    @SerialName("consultation_fee") val consultationFee: Double? = null,
    val active: Boolean = true,
    @SerialName("uf_brazil") val ufBrazil: String? = null,
    @SerialName("license_type") val licenseType: String? = null,
    @SerialName("care_country") val careCountry: String? = null,
    @SerialName("refeps_id") val refepsId: String? = null,
) {
    fun toDomain(sssValidationStatus: String? = null) = DoctorProfile(
        id = id,
        userId = userId,
        licenseNumber = licenseNumber.orEmpty(),
        specialty = specialty ?: "Medicina General",
        subspecialty = subspecialty,
        yearsExperience = yearsExperience ?: 0,
        bio = bio,
        consultationFee = consultationFee,
        active = active,
        sssValidationStatus = sssValidationStatus,
        licenseType = licenseType,
        ufBrazil = ufBrazil,
        countryCode = InCallDocumentPolicy.doctorCountry(
            licenseType = licenseType,
            careCountry = careCountry,
            ufBrazil = ufBrazil,
        ),
    )
}

@Serializable
private data class DoctorProfileValidationDto(
    @SerialName("sss_validation_status") val sssValidationStatus: String? = null,
)

@Serializable
private data class AppointmentStatusDto(
    val id: String,
    val status: String,
)

@Serializable
private data class IdDto(val id: String)

@Serializable
private data class PatientIdDto(
    @SerialName("patient_id") val patientId: String,
)

@Serializable
private data class PatientDto(
    val id: String,
    @SerialName("user_id") val userId: String? = null,
    @SerialName("birth_date") val birthDate: String? = null,
    val gender: String? = null,
)

@Serializable
private data class PatientFullDto(
    val id: String,
    @SerialName("user_id") val userId: String? = null,
    @SerialName("birth_date") val birthDate: String? = null,
    val gender: String? = null,
    @SerialName("blood_type") val bloodType: String? = null,
    val allergies: String? = null,
)

@Serializable
private data class DoctorPatientProfileDto(
    @SerialName("user_id") val userId: String,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

@Serializable
private data class PatientProfileFullDto(
    @SerialName("user_id") val userId: String,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val phone: String? = null,
)

@Serializable
private data class EmailDto(
    val email: String? = null,
)

@Serializable
private data class PatientAppointmentDto(
    @SerialName("patient_id") val patientId: String? = null,
    @SerialName("start_time") val startTime: String,
    val status: String,
)

@Serializable
private data class AppointmentFullDto(
    val id: String,
    @SerialName("patient_id") val patientId: String? = null,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("duration_minutes") val durationMinutes: Int? = null,
    val type: String = "consultation",
    val status: String = "scheduled",
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

    private fun parseType(value: String): AppointmentType = when (value.lowercase()) {
        "follow_up" -> AppointmentType.FOLLOW_UP
        "emergency" -> AppointmentType.EMERGENCY
        "telemedicine" -> AppointmentType.TELEMEDICINE
        "lab_test" -> AppointmentType.LAB_TEST
        "checkup" -> AppointmentType.CHECKUP
        else -> AppointmentType.CONSULTATION
    }

    private fun parseStatus(value: String): AppointmentStatus = when (value.lowercase()) {
        "confirmed" -> AppointmentStatus.CONFIRMED
        "in_progress" -> AppointmentStatus.IN_PROGRESS
        "completed" -> AppointmentStatus.COMPLETED
        "cancelled" -> AppointmentStatus.CANCELLED
        "no_show" -> AppointmentStatus.NO_SHOW
        else -> AppointmentStatus.SCHEDULED
    }
}

@Serializable
private data class DoctorAvailabilityDto(
    val id: String? = null,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("day_of_week") val dayOfWeek: Int,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String,
    @SerialName("slot_duration") val slotDuration: Int = 30,
    val location: String? = null,
    @SerialName("is_active") val isActive: Boolean = true,
) {
    fun toDomain() = DoctorAvailabilitySlot(
        id = id,
        dayOfWeek = dayOfWeek,
        startTime = startTime.take(5),
        endTime = endTime.take(5),
        slotDuration = slotDuration,
        location = location,
        isActive = isActive,
    )
}

@Serializable
private data class AnamnesisContextDto(
    val id: String,
    @SerialName("patient_id") val patientId: String,
    val status: String = "in_progress",
)

@Serializable
private data class AnamnesisContextSectionDto(
    val id: String,
    val section: String,
    val data: JsonObject = JsonObject(emptyMap()),
)

@Serializable
private data class PatientIdUserDto(
    val id: String,
    @SerialName("user_id") val userId: String? = null,
)
