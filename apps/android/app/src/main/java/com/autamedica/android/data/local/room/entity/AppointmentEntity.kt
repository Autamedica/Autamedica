package com.autamedica.android.data.local.room.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType

@Entity(tableName = "appointments")
data class AppointmentEntity(
    @PrimaryKey val id: String,
    val ownerUserId: String?,
    val patientId: String?,
    val doctorId: String?,
    val startTime: String,
    val endTime: String?,
    val durationMinutes: Int?,
    val type: String,
    val status: String,
    val notes: String?,
    val meetingUrl: String?,
    val doctorName: String? = null,
    val doctorSpecialty: String? = null,
    val doctorAvatarUrl: String? = null,
    val doctorFee: Double? = null,
    // Timestamp used to clear old data cache
    val cachedAt: Long = System.currentTimeMillis()
)

fun AppointmentEntity.toDomain() = Appointment(
    id = id,
    patientId = patientId,
    doctorId = doctorId,
    startTime = startTime,
    endTime = endTime,
    durationMinutes = durationMinutes,
    type = runCatching { AppointmentType.valueOf(type) }.getOrDefault(AppointmentType.TELEMEDICINE),
    status = runCatching { AppointmentStatus.valueOf(status) }.getOrDefault(AppointmentStatus.SCHEDULED),
    notes = notes,
    meetingUrl = meetingUrl,
    doctorName = doctorName,
    doctorSpecialty = doctorSpecialty,
    doctorAvatarUrl = doctorAvatarUrl,
    doctorFee = doctorFee,
)

fun Appointment.toEntity(ownerUserId: String) = AppointmentEntity(
    id = id,
    ownerUserId = ownerUserId,
    patientId = patientId,
    doctorId = doctorId,
    startTime = startTime,
    endTime = endTime,
    durationMinutes = durationMinutes,
    type = type.name,
    status = status.name,
    notes = notes,
    meetingUrl = meetingUrl,
    doctorName = doctorName,
    doctorSpecialty = doctorSpecialty,
    doctorAvatarUrl = doctorAvatarUrl,
    doctorFee = doctorFee,
    cachedAt = System.currentTimeMillis()
)
