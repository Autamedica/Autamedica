package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.DoctorOnDutyPharmacyState
import com.autamedica.android.domain.model.PharmacyClaimResult
import com.autamedica.android.domain.model.PharmacyConsultationRequest
import com.autamedica.android.domain.model.RequestStatusResponse
import kotlinx.coroutines.flow.Flow

interface PharmacyOnDemandRepository {
    fun observeOnDutyState(): Flow<DoctorOnDutyPharmacyState>
    suspend fun getOnDutyStatus(): Result<DoctorOnDutyPharmacyState>
    suspend fun toggleOnDuty(onDuty: Boolean): Result<DoctorOnDutyPharmacyState>
    suspend fun getPendingQueue(): Result<List<PharmacyConsultationRequest>>
    suspend fun claimRequest(requestId: String): Result<PharmacyClaimResult>

    suspend fun createRequest(
        pharmacyId: String?,
        pharmacyName: String,
        patientDni: String,
        patientName: String,
        patientPhone: String,
        reason: String,
    ): Result<PharmacyConsultationRequest>

    suspend fun getRequestStatus(requestId: String): Result<RequestStatusResponse>

    suspend fun cancelRequest(requestId: String): Result<Unit>
}
