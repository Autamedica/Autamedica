package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.ClinicalNoteEntry
import com.autamedica.android.domain.model.CreateClinicalNoteRequest
import com.autamedica.android.domain.model.CreateFollowupRequest
import com.autamedica.android.domain.model.CreateVitalSignRequest
import com.autamedica.android.domain.model.ExternalPatientRecord
import com.autamedica.android.domain.model.PatientFollowupEntry
import com.autamedica.android.domain.model.PatientPrescriptionRenewalItem
import com.autamedica.android.domain.model.RegisterExternalPatientRequest
import com.autamedica.android.domain.model.VitalSignAlert
import com.autamedica.android.domain.model.VitalSignEntry

data class PatientVitalsPayload(
    val vitals: List<VitalSignEntry> = emptyList(),
    val alerts: List<VitalSignAlert> = emptyList(),
)

interface DoctorPatientWorkspaceRepository {
    suspend fun getClinicalNotes(patientId: String): Result<List<ClinicalNoteEntry>>
    suspend fun createClinicalNote(request: CreateClinicalNoteRequest): Result<ClinicalNoteEntry>
    suspend fun getVitals(patientId: String): Result<PatientVitalsPayload>
    suspend fun recordVitals(request: CreateVitalSignRequest): Result<PatientVitalsPayload>
    suspend fun getFollowups(patientId: String): Result<List<PatientFollowupEntry>>
    suspend fun createFollowup(request: CreateFollowupRequest): Result<PatientFollowupEntry>
    suspend fun updateFollowup(patientId: String, followupId: String, action: String): Result<PatientFollowupEntry>
    suspend fun getPatientPrescriptions(patientId: String): Result<List<PatientPrescriptionRenewalItem>>
    suspend fun getExternalPatients(): Result<List<ExternalPatientRecord>>
    suspend fun registerExternalPatient(request: RegisterExternalPatientRequest): Result<ExternalPatientRecord>
}
