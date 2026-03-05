package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.PatientDetail
import com.autamedica.android.domain.model.PatientSummary

interface DoctorRepository {
    suspend fun getDoctorProfile(userId: String): Result<DoctorProfile>
    suspend fun getDoctorStats(doctorId: String): Result<DoctorStats>
    suspend fun getDoctorPatients(doctorId: String): Result<List<PatientSummary>>
    suspend fun getPatientDetail(doctorId: String, patientId: String): Result<PatientDetail>
}
