package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.AppointmentFollowup

interface FollowupRepository {
    suspend fun getActiveFollowupsForPatient(patientId: String): Result<List<AppointmentFollowup>>
    suspend fun getPendingCheckIn(patientId: String): Result<AppointmentFollowup?>
    suspend fun submitCheckIn(followupId: String, evolution: String, notes: String? = null): Result<Unit>
}
