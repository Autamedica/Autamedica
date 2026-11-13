package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.DispatchClaimResult
import com.autamedica.android.domain.model.DoctorDutyStatus
import com.autamedica.android.domain.model.DoctorGuardApproval
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/**
 * On-Demand pharmacy dispatch ("Uber para médicos"): doctor duty status,
 * private offer stream and atomic claim via the `claim_pharmacy_request_tier` RPC.
 */
/** Server-confirmed financial status only. Never infer paid from browser return URLs. */
data class DispatchCheckoutResult(
    val status: String,
    val checkoutUrl: String? = null,
)

interface PharmacyDispatchRepository {

    /** Server-authoritative administrator approval for this authenticated doctor.
     * The default fails closed for mock/alternate implementations. */
    suspend fun getMyGuardApproval(): Result<DoctorGuardApproval> =
        Result.failure(UnsupportedOperationException("Clinical guard approval unavailable"))

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

    /** Authenticated physician's pending valid offers (never the public clinical queue). */
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

    /** A physician explicitly refuses only their own unexpired offer. */
    suspend fun declinePharmacyOffer(offerId: String): Result<Boolean> =
        Result.failure(UnsupportedOperationException("Offer refusal not implemented"))

    /** Mark a request as in call / completed on the dispatch row. */
    suspend fun updateDispatchRequestStatus(requestId: String, status: String): Result<Unit>

    /** Finish a claimed request: mark completed and free the doctor for the next patient. */
    suspend fun finishPharmacyRequest(
        doctorId: String,
        requestId: String,
    ): Result<Unit>

    /** Recover the authenticated patient's latest live dispatch after process death.
     * A guest request needs its short-lived signed access token instead. */
    suspend fun getActivePatientDispatchRequest(): Result<PharmacyDispatchRequest?> = Result.success(null)

    /** Patient side: Create an on-demand intake request in `pharmacy_dispatch_requests`. */
    suspend fun createPatientDispatchRequest(
        patientDni: String,
        patientPhone: String,
        patientName: String?,
        tierRequested: String,
        symptomSummary: String?,
        patientCpf: String? = null,
        careCountry: String? = null,
        referralCode: String? = null,
    ): Result<PharmacyDispatchRequest>

    /** Short-lived HMAC JWT for the active device-owned guest request in this exact room. */
    suspend fun getGuestAccessTokenForRoom(roomId: String): String? = null

    /** Patient side: cancel a still-searching request only after server confirmation. */
    suspend fun cancelPatientDispatchRequest(requestId: String): Result<Boolean> =
        Result.failure(UnsupportedOperationException("Patient cancellation not implemented"))

    /** Patient side: Observe a specific on-demand request by id until matched/in_call. */
    fun observePatientRequest(requestId: String): kotlinx.coroutines.flow.Flow<PharmacyDispatchRequest>

    /** Starts the private BR partner checkout through the scoped patient token.
     * Unsupported backends fail closed; no client-side payment confirmation. */
    suspend fun startDispatchCheckout(requestId: String): Result<DispatchCheckoutResult> =
        Result.failure(UnsupportedOperationException("Commercial checkout unavailable"))

    /** Reads payment state from server (which reconciles against the PSP). */
    suspend fun getDispatchPaymentStatus(requestId: String): Result<String> =
        Result.failure(UnsupportedOperationException("Commercial payment status unavailable"))

    /** Public aggregate for patient radar: doctors accepting consults in AR or BR.
     * Does not expose clinician identities or return doctors from another country. */
    suspend fun getCountryOnDutyCapacity(careCountry: String): Result<Int> =
        Result.failure(UnsupportedOperationException("Country radar capacity not implemented"))

    /** Fetch live on-duty doctors currently connected to the network. */
    suspend fun getActiveOnDutyDoctors(): Result<List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo>>

    /** Patient side: Observe live on-duty doctors connected to the network in real-time. */
    fun observeActiveOnDutyDoctors(): Flow<List<com.autamedica.android.presentation.pharmacy.components.OnDutyDoctorInfo>>
}