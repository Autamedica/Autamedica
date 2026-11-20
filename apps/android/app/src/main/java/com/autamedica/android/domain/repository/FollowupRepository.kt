package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.AppointmentFollowup
import com.autamedica.android.domain.model.MedicationAdherenceSummary
import com.autamedica.android.domain.model.PatientContinuityCase

interface FollowupRepository {
    suspend fun getActiveFollowupsForPatient(patientId: String): Result<List<AppointmentFollowup>>
    suspend fun getPendingCheckIn(patientId: String): Result<AppointmentFollowup?>
    suspend fun submitCheckIn(followupId: String, evolution: String, notes: String? = null): Result<Unit>

    suspend fun getContinuityCase(patientId: String): Result<PatientContinuityCase?> =
        Result.failure(UnsupportedOperationException("Continuity persistence is unavailable"))

    suspend fun requestContinuity(patientId: String): Result<PatientContinuityCase> =
        Result.failure(UnsupportedOperationException("Continuity request is unavailable"))

    suspend fun getMedicationAdherence(patientId: String, medicationName: String): Result<MedicationAdherenceSummary> =
        Result.failure(UnsupportedOperationException("Medication adherence is unavailable"))

    suspend fun recordMedicationDose(patientId: String, medicationName: String, dosage: String): Result<Unit> =
        Result.failure(UnsupportedOperationException("Medication dose persistence is unavailable"))
}
