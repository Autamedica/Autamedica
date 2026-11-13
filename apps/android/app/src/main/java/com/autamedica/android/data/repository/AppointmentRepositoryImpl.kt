package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentTransitionRules
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.repository.AppointmentPaymentExecution
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.logging.SecureLog
import java.time.OffsetDateTime
import java.time.LocalDate
import java.time.LocalTime
import java.time.DayOfWeek
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.UUID
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.coroutines.flow.firstOrNull
import javax.inject.Inject
import javax.inject.Singleton
import com.autamedica.android.data.local.room.dao.AppointmentDao
import com.autamedica.android.data.local.room.entity.toDomain
import com.autamedica.android.data.local.room.entity.toEntity

private const val KEY_CACHED_RECORD_ID = "cached_record_id"

private const val ACTIVE_WINDOW_MINUTES = 30L

private fun filterActiveWindow(appointments: List<Appointment>): List<Appointment> {
    val terminalStatuses = setOf(
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
    )
    val now = OffsetDateTime.now()
    return appointments.filter { apt ->
        if (apt.status in terminalStatuses) {
            true
        } else {
            runCatching {
                OffsetDateTime.parse(apt.startTime).isAfter(now.minusMinutes(ACTIVE_WINDOW_MINUTES))
            }.getOrDefault(false)
        }
    }
}

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
                .decodeSingleOrNull<AppointmentRecordIdDto>()?.id
        } else {
            supabaseClient.postgrest.from("patients")
                .select(Columns.list("id")) { filter { eq("user_id", userId) } }
                .decodeSingleOrNull<AppointmentRecordIdDto>()?.id
        }

        if (recordId == null) {
            // Patient or doctor record does not exist yet (e.g. fresh account or pending onboarding)
            return@runCatching emptyList<Appointment>()
        }

        // Cache recordId for offline fallback
        securePreferences.putString(KEY_CACHED_RECORD_ID, recordId)

        val filterColumn = if (role == "doctor") "doctor_id" else "patient_id"

        val statusList = if (role == "doctor") {
            listOf("scheduled", "confirmed", "in_progress", "completed", "no_show")
        } else {
            listOf("payment_pending", "scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show")
        }

        val dtos = supabaseClient.postgrest
            .from("appointments")
            .select(Columns.ALL) {
                filter {
                    eq(filterColumn, recordId)
                    isIn("status", statusList)
                }
                order("start_time", Order.ASCENDING)
            }
            .decodeList<AppointmentDto>()

        val rawDomainModels = dtos.map { it.toDomain() }

        val reconciledModels = if (role != "doctor") {
            reconcileApprovedPayments(rawDomainModels)
        } else {
            rawDomainModels
        }

        val domainModels = if (role != "doctor") {
            enrichWithDoctorInfo(
                filterActiveWindow(reconciledModels)
            )
        } else {
            reconciledModels
        }

        // Phase 3: Cache data to Room for offline access
        appointmentDao.insertAppointments(domainModels.map { it.toEntity(ownerUserId = userId) })

        domainModels
    }.recoverCatching {
        SecureLog.error("[Appointments] Network failed, falling back to offline cache", it)
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: return@recoverCatching emptyList<Appointment>()
        val role = securePreferences.getString(SecurePreferences.KEY_USER_ROLE) ?: "patient"
        val cachedEntities = try {
            appointmentDao.getAppointmentsForUser(userId).firstOrNull() ?: emptyList()
        } catch (dbErr: Exception) {
            SecureLog.warn("[Appointments] Failed to read from cache", dbErr)
            emptyList()
        }
        val domainModels = cachedEntities.map { entity -> entity.toDomain() }
        if (role != "doctor") {
            try {
                filterActiveWindow(domainModels)
            } catch (_: Exception) {
                domainModels
            }
        } else {
            domainModels
        }
    }

    override suspend fun getAppointmentById(id: String): Result<Appointment> = runCatching {
        val dto = supabaseClient.postgrest
            .from("appointments")
            .select(Columns.ALL) {
                filter { eq("id", id) }
            }
            .decodeSingle<AppointmentDto>()

        val domain = dto.toDomain()
        val role = securePreferences.getString(SecurePreferences.KEY_USER_ROLE) ?: "patient"
        if (role != "doctor") {
            enrichWithDoctorInfo(listOf(domain)).first()
        } else {
            domain
        }
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

    override suspend fun updateAppointmentStatus(id: String, status: AppointmentStatus): Result<Unit> = runCatching {
        val wireStatus = when (status) {
            AppointmentStatus.PAYMENT_PENDING -> "payment_pending"
            AppointmentStatus.SCHEDULED -> "scheduled"
            AppointmentStatus.CONFIRMED -> "confirmed"
            AppointmentStatus.IN_PROGRESS -> "in_progress"
            AppointmentStatus.COMPLETED -> "completed"
            AppointmentStatus.CANCELLED -> "cancelled"
            AppointmentStatus.NO_SHOW -> "no_show"
        }
        supabaseClient.postgrest
            .from("appointments")
            .update(mapOf("status" to wireStatus)) {
                filter { eq("id", id) }
            }
        Unit
    }.onFailure {
        SecureLog.error("[Appointments] Failed updating appointment status", it)
    }

    override suspend fun cancelAppointment(id: String): Result<Unit> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No user ID found")

        val appointment = getAppointmentById(id).getOrThrow()

        val currentStatus = appointment.status
        if (!AppointmentTransitionRules.isTransitionAllowed(currentStatus, AppointmentStatus.CANCELLED)) {
            throw IllegalStateException("Cannot cancel appointment with status $currentStatus")
        }

        supabaseClient.postgrest
            .from("appointments")
            .update(mapOf("status" to "cancelled")) {
                filter { eq("id", id) }
            }
        appointmentDao.clearAppointmentsForUser(userId)
        Unit
    }.onFailure {
        SecureLog.error("[Appointments] Failed canceling appointment", it)
    }

    override suspend fun rescheduleAppointment(
        id: String,
        newStartTime: String,
        newEndTime: String,
    ): Result<Unit> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No user ID found")

        val (newStart, newEnd) = AppointmentScheduleGuard.parseRescheduleWindow(newStartTime, newEndTime)
        if (newStart.isBefore(OffsetDateTime.now())) {
            throw IllegalStateException("No se puede reprogramar una cita en el pasado")
        }

        val appointment = getAppointmentById(id).getOrThrow()
        if (!AppointmentTransitionRules.isReschedulable(appointment.status)) {
            throw IllegalStateException("No se puede reprogramar una cita con estado ${appointment.status}")
        }
        val doctorId = appointment.doctorId ?: throw IllegalStateException("Cannot reschedule: no doctor assigned")

        val busy = runCatching {
            val params = buildJsonObject {
                put("p_doctor_id", doctorId)
                put("p_start_date", newStart.toLocalDate().toString())
                put("p_end_date", newStart.toLocalDate().toString())
            }
            supabaseClient.postgrest
                .rpc("get_doctor_busy_slots", params)
                .decodeList<DoctorBusySlotDto>()
        }.getOrElse { throw IllegalStateException("No se pudo confirmar la disponibilidad del médico", it) }

        val hasConflict = AppointmentScheduleGuard.hasConflict(
            newStart, newEnd, busy.map { it.startTime to it.endTime },
        )
        if (hasConflict) {
            throw IllegalStateException("El profesional tiene una cita conflictiva en el horario solicitado")
        }

        supabaseClient.postgrest
            .from("appointments")
            .update(
                mapOf(
                    "start_time" to newStartTime,
                    "end_time" to newEndTime,
                ),
            ) {
                filter { eq("id", id) }
            }
        appointmentDao.clearAppointmentsForUser(userId)
        Unit
    }.onFailure {
        SecureLog.error("[Appointments] Failed rescheduling appointment", it)
    }

    override suspend fun clearCachedAppointmentsForCurrentUser(): Result<Unit> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: return@runCatching
        appointmentDao.clearAppointmentsForUser(userId)
        securePreferences.remove(KEY_CACHED_RECORD_ID)
    }.onFailure {
        SecureLog.error("[Appointments] Failed clearing cached appointments", it)
    }

    override suspend fun getCareCountry(): Result<String?> = runCatching {
        val userId = requireNotNull(securePreferences.getString(SecurePreferences.KEY_USER_ID))
        supabaseClient.postgrest.from("patients")
            .select(Columns.list("care_country")) { filter { eq("user_id", userId) } }
            .decodeList<PatientCareCountryDto>().firstOrNull()?.careCountry
    }

    override suspend fun selectCareCountry(country: String): Result<Unit> = runCatching {
        require(country == "AR" || country == "BR") { "País de atención inválido" }
        val userId = requireNotNull(securePreferences.getString(SecurePreferences.KEY_USER_ID))
        val current = getCareCountry().getOrThrow()
        check(current == null || current == country) { "El país de atención ya fue seleccionado" }
        if (current == null) {
            supabaseClient.postgrest.from("patients")
                .update(mapOf("care_country" to country)) {
                    filter { eq("user_id", userId) }
                }
            check(getCareCountry().getOrThrow() == country) { "No se pudo guardar el país de atención" }
        }
    }

    override suspend fun getAvailableDoctors(specialty: String?): Result<List<DoctorBookingInfo>> = runCatching {
        val country = getCareCountry().getOrThrow()
        check(country == "AR" || country == "BR") {
            "Seleccioná tu país de atención en Agenda / Selecione seu país de atendimento em Agenda"
        }
        // Do not fall back to unfiltered/inactive doctors if the active-only
        // query fails: this must surface as Result.failure.
        val doctors = supabaseClient.postgrest
            .rpc("get_patient_doctor_directory")
            .decodeList<DoctorBookingRowDto>()
        check(doctors.all { it.careCountry == country }) { "País de atención inconsistente" }
        if (doctors.isEmpty()) return@runCatching emptyList()
        val profilesMap = doctors.associate { doctor ->
            doctor.userId to DoctorProfileBookingDto(
                userId = doctor.userId,
                firstName = doctor.firstName,
                lastName = doctor.lastName,
                avatarUrl = doctor.avatarUrl,
                sssValidationStatus = doctor.sssValidationStatus,
            )
        }

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

        val availabilityMap = if (doctorIds.isNotEmpty()) {
            try {
                val rawAvailabilities = supabaseClient.postgrest
                    .from("doctor_availability")
                    .select(Columns.list("doctor_id", "day_of_week", "start_time", "end_time", "is_active")) {
                        filter {
                            isIn("doctor_id", doctorIds)
                            eq("is_active", true)
                        }
                    }
                    .decodeList<DoctorAvailabilityDayDto>()

                rawAvailabilities
                    .groupBy { it.doctorId }
                    .filterValues { slots ->
                        val isFake = slots.size >= 7 && slots.all {
                            it.startTime.startsWith("00:00") && it.endTime.startsWith("23:59")
                        }
                        !isFake && slots.isNotEmpty()
                    }
                    .mapValues { entry ->
                        entry.value.map { it.dayOfWeek }.toSet()
                    }
            } catch (e: Exception) {
                SecureLog.warn("[Appointments] Failed fetching doctor availability days: ${e.message}")
                emptyMap()
            }
        } else emptyMap()

        val femaleNames = setOf(
            "amancay", "layla", "bianca", "bárbara", "barbara", "julieta",
            "leticia", "camila", "valentina", "sofía", "sofia", "carolina",
            "mariana", "rachel", "manuela", "florencia", "lucía", "lucia",
            "maría", "maria", "victoria", "laura", "ana", "paula", "claudia",
            "andrea", "natalia", "gabriela", "daniela", "melisa", "melissa"
        )

        val doctorList = doctors.map { doc ->
            val profile = profilesMap[doc.userId]
            val firstName = profile?.firstName?.trim().orEmpty()
            val lastName = profile?.lastName?.trim().orEmpty()

            val rawName = when {
                firstName.isNotBlank() && lastName.isNotBlank() -> "$firstName $lastName"
                firstName.isNotBlank() -> firstName
                lastName.isNotBlank() -> lastName
                else -> ""
            }

            val fullName = if (rawName.isNotBlank()) {
                val lowerFirst = firstName.lowercase().split(" ").firstOrNull().orEmpty()
                val isDra = femaleNames.contains(lowerFirst) || rawName.startsWith("Dra.", ignoreCase = true)
                when {
                    rawName.startsWith("Dr.", ignoreCase = true) || rawName.startsWith("Dra.", ignoreCase = true) -> rawName
                    isDra -> "Dra. $rawName"
                    else -> "Dr. $rawName"
                }
            } else {
                "Médico Especialista"
            }

            val extraSpecs = specialtiesMap[doc.id].orEmpty()
            val rawSpecialty = doc.specialty?.takeIf { it.isNotBlank() }
                ?: extraSpecs.firstOrNull()
                ?: "Medicina General"
            val docSpecialty = if (rawSpecialty.equals("General", ignoreCase = true)) "Medicina General" else rawSpecialty

            val formattedLicense = formatDoctorCredential(doc.careCountry, doc.licenseType, doc.licenseNumber, doc.ufBrazil)

            val rawFee = doc.consultationFee
            val normalizedFee = when {
                rawFee == null || rawFee <= 0 -> null
                rawFee >= 10000.0 -> rawFee / 100.0 // Stored in cents in Supabase DB (e.g. 3000000.00 -> 30000.0)
                else -> rawFee
            }

            val activeDays = availabilityMap[doc.id].orEmpty()

            DoctorBookingInfo(
                id = doc.id,
                userId = doc.userId,
                name = fullName,
                specialty = docSpecialty,
                licenseNumber = formattedLicense,
                consultationFee = normalizedFee,
                avatarUrl = profile?.avatarUrl?.takeIf { it.isNotBlank() },
                subspecialty = doc.subspecialty?.takeIf { it.isNotBlank() },
                availableSlots = emptyList(),
                availableDays = activeDays,
                sssValidationStatus = profile?.sssValidationStatus,
            )
        }.sortedWith(
            compareByDescending<DoctorBookingInfo> { it.avatarUrl != null }
                .thenByDescending { it.name != "Médico Especialista" }
                .thenBy { it.name }
        )

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
            .decodeSingleOrNull<AppointmentRecordIdDto>()?.id

        if (patientId == null) {
            patientId = try {
                supabaseClient.postgrest.from("patients")
                    .insert(mapOf("user_id" to userId)) {
                        select(Columns.list("id"))
                    }
                    .decodeSingle<AppointmentRecordIdDto>().id
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

    override suspend fun createDoctorAppointment(
        doctorId: String,
        patientId: String?,
        startTime: String,
        endTime: String,
        type: String,
        notes: String?,
        guestName: String?,
        guestPhone: String?,
    ): Result<Appointment> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No authenticated user found")

        val formattedNotes = buildString {
            if (!guestName.isNullOrBlank()) {
                append("[INVITADO: ${guestName.trim()}")
                if (!guestPhone.isNullOrBlank()) {
                    append(" - Tel: ${guestPhone.trim()}")
                }
                append("] ")
            }
            if (!notes.isNullOrBlank()) {
                append(notes.trim())
            }
        }.trim().ifBlank { null }

        val roomId = "room-${UUID.randomUUID()}"

        val dto = supabaseClient.postgrest
            .from("appointments")
            .insert(
                CreateAppointmentDto(
                    patientId = patientId,
                    doctorId = doctorId,
                    startTime = startTime,
                    endTime = endTime,
                    status = "confirmed",
                    type = type,
                    notes = formattedNotes,
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
            SecureLog.warn("[Appointments] Failed to cache doctor appointment in Room: ${e.message}")
        }

        domain
    }.onFailure {
        SecureLog.error("[Appointments] Failed creating doctor appointment", it)
    }

    override suspend fun getAvailableSlots(
        doctorId: String,
        date: String,
    ): Result<List<String>> = runCatching {
        val targetDate = LocalDate.parse(date)
        val dayOfWeekInt = when (targetDate.dayOfWeek) {
            DayOfWeek.SUNDAY -> 0
            DayOfWeek.MONDAY -> 1
            DayOfWeek.TUESDAY -> 2
            DayOfWeek.WEDNESDAY -> 3
            DayOfWeek.THURSDAY -> 4
            DayOfWeek.FRIDAY -> 5
            DayOfWeek.SATURDAY -> 6
        }

        // 1. Check for specific date override in doctor_availability_overrides
        val override = try {
            supabaseClient.postgrest
                .from("doctor_availability_overrides")
                .select(Columns.ALL) {
                    filter {
                        eq("doctor_id", doctorId)
                        eq("override_date", date)
                    }
                }
                .decodeList<DoctorAvailabilityOverrideRowDto>()
                .firstOrNull()
        } catch (e: Exception) {
            SecureLog.warn("[Appointments] Failed fetching doctor availability overrides: ${e.message}")
            throw IllegalStateException("No se pudo confirmar la disponibilidad excepcional del profesional", e)
        }

        // If override explicitly marks day as not available (holiday, vacation, leave), return empty
        if (override != null && !override.isAvailable) {
            return@runCatching emptyList()
        }

        // 2. Resolve active time ranges: from override or weekly doctor_availability
        val timeRanges: List<DoctorAvailabilityRowDto> = if (override != null && override.isAvailable) {
            val start = override.startTime?.takeIf { it.isNotBlank() } ?: "09:00:00"
            val end = override.endTime?.takeIf { it.isNotBlank() } ?: "17:00:00"
            listOf(
                DoctorAvailabilityRowDto(
                    doctorId = doctorId,
                    dayOfWeek = dayOfWeekInt,
                    startTime = if (start.length == 5) "$start:00" else start,
                    endTime = if (end.length == 5) "$end:00" else end,
                    slotDuration = 30,
                    isActive = true,
                )
            )
        } else {
            val weeklyAvailabilities = try {
                supabaseClient.postgrest
                    .from("doctor_availability")
                    .select(Columns.ALL) {
                        filter {
                            eq("doctor_id", doctorId)
                            eq("day_of_week", dayOfWeekInt)
                            eq("is_active", true)
                        }
                    }
                    .decodeList<DoctorAvailabilityRowDto>()
            } catch (e: Exception) {
                SecureLog.warn("[Appointments] Failed fetching doctor availability: ${e.message}")
                throw IllegalStateException("No se pudo consultar la agenda semanal del profesional", e)
            }

            // Exclude fake 24/7 preset (7 days, 00:00 to 23:59)
            val isFake = weeklyAvailabilities.all {
                it.startTime.startsWith("00:00") && it.endTime.startsWith("23:59")
            }
            if (isFake) emptyList() else weeklyAvailabilities
        }

        // If no availability configured for this day, doctor does NOT work. Return empty.
        if (timeRanges.isEmpty()) {
            return@runCatching emptyList()
        }

        // 3. Fetch busy ranges (appointments already booked)
        val busyRanges = try {
            val params = buildJsonObject {
                put("p_doctor_id", doctorId)
                put("p_start_date", date)
                put("p_end_date", date)
            }
            supabaseClient.postgrest
                .rpc("get_doctor_busy_slots", params)
                .decodeList<DoctorBusySlotDto>()
        } catch (e: Exception) {
            SecureLog.warn("[Appointments] Failed calling get_doctor_busy_slots: ${e.message}")
            throw IllegalStateException("No se pudieron verificar los turnos ocupados del profesional", e)
        }

        val argZone = ZoneId.of("America/Argentina/Buenos_Aires")
        val bookedTimeWindows = AppointmentScheduleGuard.bookedLocalTimes(
            busyRanges.map { it.startTime to it.endTime }, argZone,
        )

        val generatedSlots = mutableListOf<String>()

        for (avail in timeRanges) {
            val startParts = avail.startTime.split(":")
            val endParts = avail.endTime.split(":")
            val startH = startParts.getOrNull(0)?.toIntOrNull() ?: 9
            val startM = startParts.getOrNull(1)?.toIntOrNull() ?: 0
            val endH = endParts.getOrNull(0)?.toIntOrNull() ?: 18
            val endM = endParts.getOrNull(1)?.toIntOrNull() ?: 0

            var current = LocalTime.of(startH, startM)
            val end = LocalTime.of(endH, endM)
            val durationMinutes = if (avail.slotDuration > 0) avail.slotDuration.toLong() else 30L

            while (current.plusMinutes(durationMinutes) <= end) {
                val slotStart = current
                val slotEnd = current.plusMinutes(durationMinutes)

                val isBusy = bookedTimeWindows.any { (busyStart, busyEnd) ->
                    slotStart < busyEnd && slotEnd > busyStart
                }

                if (!isBusy) {
                    val formattedSlot = "%02d:%02d".format(slotStart.hour, slotStart.minute)
                    generatedSlots.add(formattedSlot)
                }

                current = slotEnd
            }
        }

        val nowInArg = ZonedDateTime.now(argZone)
        val filtered = if (targetDate == nowInArg.toLocalDate()) {
            val currentHour = nowInArg.hour
            val currentMin = nowInArg.minute
            generatedSlots.filter { slot ->
                val parts = slot.split(":")
                val h = parts.getOrNull(0)?.toIntOrNull() ?: 0
                val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
                h > currentHour || (h == currentHour && m > currentMin + 15)
            }
        } else {
            generatedSlots
        }

        filtered.distinct().sorted()
    }.onFailure {
        SecureLog.error("[Appointments] Failed fetching available slots", it)
    }

    private suspend fun enrichWithDoctorInfo(appointments: List<Appointment>): List<Appointment> {
        val doctorIds = appointments.mapNotNull { it.doctorId }.distinct()
        if (doctorIds.isEmpty()) return appointments

        val availableDoctors = runCatching {
            getAvailableDoctors().getOrNull() ?: emptyList()
        }.getOrDefault(emptyList())

        val doctorsMap = availableDoctors.associateBy { it.id }.toMutableMap()

        val missingDoctorIds = doctorIds.filter { it !in doctorsMap }
        if (missingDoctorIds.isNotEmpty()) {
            try {
                val missingDoctors = supabaseClient.postgrest
                    .from("doctors")
                    .select(Columns.ALL) {
                        filter { isIn("id", missingDoctorIds) }
                    }
                    .decodeList<DoctorBookingRowDto>()

                val userIds = missingDoctors.map { it.userId }.filter { it.isNotBlank() }
                val profilesMap = if (userIds.isNotEmpty()) {
                    supabaseClient.postgrest
                        .from("profiles")
                        .select(Columns.list("user_id", "first_name", "last_name", "avatar_url", "sss_validation_status")) {
                            filter { isIn("user_id", userIds) }
                        }
                        .decodeList<DoctorProfileBookingDto>()
                        .associateBy { it.userId }
                } else emptyMap()

                for (doc in missingDoctors) {
                    val profile = profilesMap[doc.userId]
                    val firstName = profile?.firstName?.trim().orEmpty()
                    val lastName = profile?.lastName?.trim().orEmpty()
                    val rawName = when {
                        firstName.isNotBlank() && lastName.isNotBlank() -> "$firstName $lastName"
                        firstName.isNotBlank() -> firstName
                        lastName.isNotBlank() -> lastName
                        else -> "Médico Especialista"
                    }
                    val fullName = if (rawName.startsWith("Dr.", ignoreCase = true) || rawName.startsWith("Dra.", ignoreCase = true)) {
                        rawName
                    } else if (rawName != "Médico Especialista") {
                        "Dr. $rawName"
                    } else {
                        rawName
                    }
                    val rawFee = doc.consultationFee
                    val normalizedFee = when {
                        rawFee == null || rawFee <= 0 -> null
                        rawFee >= 10000.0 -> rawFee / 100.0
                        else -> rawFee
                    }
                    doctorsMap[doc.id] = DoctorBookingInfo(
                        id = doc.id,
                        userId = doc.userId,
                        name = fullName,
                        specialty = doc.specialty ?: "Medicina General",
                        licenseNumber = doc.licenseNumber.orEmpty(),
                        consultationFee = normalizedFee,
                        avatarUrl = profile?.avatarUrl?.takeIf { it.isNotBlank() },
                        subspecialty = doc.subspecialty?.takeIf { it.isNotBlank() },
                        availableSlots = emptyList(),
                        sssValidationStatus = profile?.sssValidationStatus,
                    )
                }
            } catch (e: Exception) {
                SecureLog.warn("[Appointments] Failed fetching missing doctors: ${e.message}")
            }
        }

        return appointments.map { apt ->
            val doc = apt.doctorId?.let { doctorsMap[it] }
            if (doc != null) {
                apt.copy(
                    doctorName = doc.name,
                    doctorSpecialty = doc.specialty,
                    doctorAvatarUrl = doc.avatarUrl,
                    doctorFee = doc.consultationFee,
                    doctorLicenseNumber = doc.licenseNumber,
                )
            } else {
                apt
            }
        }
    }

    /**
     * Reconciles local appointment status against the backend payment ledger.
     * If a turno is PAYMENT_PENDING or SCHEDULED but its appointment_payment is
     * already 'approved' (e.g. the MercadoPago webhook arrived after Android's
     * 60s polling window expired), it is promoted locally to CONFIRMED so the UI
     * reflects the true backend state on next load.
     */
    private suspend fun reconcileApprovedPayments(appointments: List<Appointment>): List<Appointment> {
        val reconcilable = appointments.filter { apt ->
            apt.status == AppointmentStatus.PAYMENT_PENDING || apt.status == AppointmentStatus.SCHEDULED
        }
        if (reconcilable.isEmpty()) return appointments

        val approvedIds = runCatching {
            val pendingIds = reconcilable.map { it.id }
            val statuses = supabaseClient.postgrest
                .from("appointment_payments")
                .select(Columns.list("appointment_id,status")) {
                    filter {
                        isIn("appointment_id", pendingIds)
                    }
                }
                .decodeList<AppointmentPaymentIdStatusDto>()
                .filter { it.status == "approved" }
                .map { it.appointmentId }
                .toSet()
            statuses
        }.getOrDefault(emptySet())

        if (approvedIds.isEmpty()) return appointments

        return appointments.map { apt ->
            if ((apt.status == AppointmentStatus.PAYMENT_PENDING || apt.status == AppointmentStatus.SCHEDULED) &&
                apt.id in approvedIds
            ) {
                apt.copy(status = AppointmentStatus.CONFIRMED)
            } else {
                apt
            }
        }
    }

    override suspend fun createAppointmentPayment(
        appointmentId: String,
    ): Result<AppointmentPaymentExecution> = runCatching {
        val payload = buildJsonObject {
            put("appointmentId", appointmentId)
        }
        val response = supabaseClient.functions("create-appointment-payment", payload)
        val text = response.bodyAsText()
        val json = Json { ignoreUnknownKeys = true }
        val dto = json.decodeFromString<AppointmentPaymentResponseDto>(text)
        AppointmentPaymentExecution(
            status = dto.status,
            checkoutUrl = dto.checkoutUrl,
        )
    }

    override suspend fun getAppointmentPaymentStatus(
        appointmentId: String,
    ): Result<String?> = runCatching {
        val result = supabaseClient.postgrest
            .from("appointment_payments")
            .select(Columns.list("status")) {
                filter { eq("appointment_id", appointmentId) }
                limit(1)
            }
            .decodeList<AppointmentPaymentStatusDto>()
            .firstOrNull()
            ?.status
        result
    }
}

@Serializable
private data class AppointmentRecordIdDto(val id: String)

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
        "payment_pending" -> AppointmentStatus.PAYMENT_PENDING
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
private data class AppointmentPaymentResponseDto(
    val ok: Boolean = false,
    val status: String = "pending",
    @SerialName("payment_source") val paymentSource: String? = null,
    @SerialName("checkout_url") val checkoutUrl: String? = null,
    @SerialName("preference_id") val preferenceId: String? = null,
    @SerialName("appointment_payment_id") val appointmentPaymentId: String? = null,
)

@Serializable
private data class AppointmentPaymentStatusDto(
    val status: String,
)

@Serializable
private data class AppointmentPaymentIdStatusDto(
    @SerialName("appointment_id") val appointmentId: String,
    val status: String,
)


@Serializable
private data class DoctorBookingRowDto(
    @SerialName("license_type") val licenseType: String? = null,
    @SerialName("uf_brazil") val ufBrazil: String? = null,
    @SerialName("care_country") val careCountry: String? = null,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("sss_validation_status") val sssValidationStatus: String? = null,
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("license_number") val licenseNumber: String? = null,
    val specialty: String? = null,
    val subspecialty: String? = null,
    @SerialName("consultation_fee") val consultationFee: Double? = null,
    val active: Boolean = true,
)

@Serializable
private data class DoctorProfileBookingDto(
    @SerialName("user_id") val userId: String,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("sss_validation_status") val sssValidationStatus: String? = null,
)

@Serializable
private data class DoctorSpecialtyBookingDto(
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("specialty_name") val specialtyName: String,
)

@Serializable
private data class CreateAppointmentDto(
    @SerialName("patient_id") val patientId: String? = null,
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String,
    val status: String = "scheduled",
    val type: String = "telemedicine",
    val notes: String? = null,
    @SerialName("meeting_url") val meetingUrl: String? = null,
)

@Serializable
private data class DoctorAvailabilityRowDto(
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("day_of_week") val dayOfWeek: Int,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String,
    @SerialName("slot_duration") val slotDuration: Int = 30,
    @SerialName("is_active") val isActive: Boolean = true,
)

@Serializable
private data class DoctorAvailabilityOverrideRowDto(
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("override_date") val overrideDate: String,
    @SerialName("is_available") val isAvailable: Boolean = false,
    @SerialName("start_time") val startTime: String? = null,
    @SerialName("end_time") val endTime: String? = null,
)

@Serializable
private data class DoctorAvailabilityDayDto(
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("day_of_week") val dayOfWeek: Int,
    @SerialName("start_time") val startTime: String = "",
    @SerialName("end_time") val endTime: String = "",
    @SerialName("is_active") val isActive: Boolean = true,
)

@Serializable
private data class DoctorBusySlotDto(
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String,
)

@Serializable
private data class PatientCareCountryDto(@SerialName("care_country") val careCountry: String? = null)

