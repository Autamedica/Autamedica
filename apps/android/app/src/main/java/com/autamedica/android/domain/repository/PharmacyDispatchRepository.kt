package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.DispatchClaimResult
import com.autamedica.android.domain.model.DoctorDutyStatus
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import kotlinx.coroutines.flow.Flow
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

    /** Send periodic heartbeat to refresh doctor presence while on duty via `public.doctor_heartbeat`. */
    suspend fun sendDoctorHeartbeat(doctorId: String): Result<Unit>

    /** Reactive flow of dispatch requests still in `searching` status. */
    fun observeSearchingRequests(): StateFlow<List<PharmacyDispatchRequest>>

    /** Gen 2 incoming offers waiting for on-duty doctors. */
    fun observeIncomingOffers(): StateFlow<List<PharmacyDispatchRequest>> = observeSearchingRequests()

    /** Live incoming offers property stream. */
    val incomingOffers: StateFlow<List<PharmacyDispatchRequest>>
        get() = observeSearchingRequests()

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

    /** Patient side: Create an on-demand intake request in `pharmacy_dispatch_requests`. */
    suspend fun createPatientDispatchRequest(
        patientDni: String,
        patientPhone: String,
        patientName: String?,
        tierRequested: String,
        symptomSummary: String?,
        patientCpf: String? = null,
        careCountry: String? = null,
    ): Result<PharmacyDispatchRequest>

    /** Patient side: cancel a still-searching request only after server confirmation. */
    suspend fun cancelPatientDispatchRequest(requestId: String): Result<Boolean> =
        Result.failure(UnsupportedOperationException("Patient cancellation not implemented"))

    /** Patient side: Observe a specific on-demand request by id until matched/in_call. */
    fun observePatientRequest(requestId: String): kotlinx.coroutines.flow.Flow<PharmacyDispatchRequest>

    /** Fetch live on-duty doctors currently connected to the network. */
    suspend fun getActiveOnDutyDoctors(): Result<List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo>>

    /** Patient side: Observe live on-duty doctors connected to the network in real-time. */
    fun observeActiveOnDutyDoctors(): Flow<List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo>>
}