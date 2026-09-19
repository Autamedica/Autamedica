package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.DoctorOnDutyPharmacyState
import com.autamedica.android.domain.model.PharmacyClaimResult
import com.autamedica.android.domain.model.PharmacyConsultationRequest
import kotlinx.coroutines.flow.Flow

interface PharmacyOnDemandRepository {
    fun observeOnDutyState(): Flow<DoctorOnDutyPharmacyState>
    suspend fun getOnDutyStatus(): Result<DoctorOnDutyPharmacyState>
    suspend fun toggleOnDuty(onDuty: Boolean): Result<DoctorOnDutyPharmacyState>
    suspend fun getPendingQueue(): Result<List<PharmacyConsultationRequest>>
    suspend fun claimRequest(requestId: String): Result<PharmacyClaimResult>
}
