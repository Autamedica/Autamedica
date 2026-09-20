package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.DispatchClaimResult
import com.autamedica.android.domain.model.DoctorDutyStatus
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import kotlinx.coroutines.flow.StateFlow

/**
 * On-Demand pharmacy dispatch ("Uber para médicos"): doctor duty status,
 * realtime searching queue and atomic claim via the `claim_pharmacy_request_tier` RPC.
 */
interface PharmacyDispatchRepository {

    /** Current duty status for a doctor record. */
    suspend fun getDoctorDutyStatus(doctorId: String): Result<DoctorDutyStatus>

    /** Activate/deactivate duty via `public.set_doctor_duty_status`. */
    suspend fun setDoctorDutyStatus(
        doctorId: String,
        isOnDuty: Boolean,
        activeTiers: List<String>,
    ): Result<Unit>

    /** Reactive flow of dispatch requests still in `searching` status. */
    fun observeSearchingRequests(): StateFlow<List<PharmacyDispatchRequest>>

    /** Pick up (`claim`) a searching request atomically via RPC. */
    suspend fun claimPharmacyRequest(
        requestId: String,
        doctorId: String,
    ): Result<DispatchClaimResult>

    /** Mark a request as in call / completed on the dispatch row. */
    suspend fun updateDispatchRequestStatus(requestId: String, status: String): Result<Unit>

    /** Finish a claimed request: mark completed and free the doctor for the next patient. */
    suspend fun finishPharmacyRequest(
        doctorId: String,
        requestId: String,
    ): Result<Unit>
}