package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.DoctorAvailabilitySlot
import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.PatientClinicalContext
import com.autamedica.android.domain.model.PatientDetail
import com.autamedica.android.domain.model.PatientSummary

interface DoctorRepository {
    suspend fun getDoctorProfile(userId: String): Result<DoctorProfile>
    suspend fun getDoctorStats(doctorId: String): Result<DoctorStats>
    suspend fun getDoctorPatients(doctorId: String): Result<List<PatientSummary>>
    suspend fun getPatientDetail(doctorId: String, patientId: String): Result<PatientDetail>
    suspend fun getDoctorAvailability(doctorId: String): Result<List<DoctorAvailabilitySlot>> = Result.success(emptyList())
    suspend fun saveDoctorAvailability(doctorId: String, slots: List<DoctorAvailabilitySlot>): Result<Unit> = Result.success(Unit)
    suspend fun getPatientClinicalContext(patientId: String): Result<PatientClinicalContext> = Result.success(PatientClinicalContext())
    suspend fun resolvePatientNames(patientIds: List<String>): Result<Map<String, String>> = Result.success(emptyMap())
}
