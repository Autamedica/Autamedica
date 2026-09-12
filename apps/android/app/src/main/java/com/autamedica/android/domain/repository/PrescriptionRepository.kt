package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.CreatePrescriptionRequest
import com.autamedica.android.domain.model.DoctorEligibility
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.model.PrescriptionPatientItem

/**
 * Domain repository contract for accessing and issuing digital prescriptions (Decreto 63 / SISA REFEPS).
 */
interface PrescriptionRepository {

    /**
     * Retrieves all valid digital prescriptions for the currently authenticated patient.
     */
    suspend fun getPatientPrescriptions(): Result<List<Prescription>>

    /**
     * Retrieves a single digital prescription by its unique identifier.
     */
    suspend fun getPrescriptionById(id: String): Result<Prescription>

    /**
     * Retrieves all prescriptions issued by the authenticated doctor, optionally filtered by patient or status.
     */
    suspend fun getDoctorPrescriptions(patientId: String? = null, status: String? = null): Result<List<Prescription>>

    /**
     * Issues an official digital prescription with legal CUIR, CIE-10, and audit event logging.
     */
    suspend fun createPrescription(request: CreatePrescriptionRequest): Result<Prescription>

    /**
     * Cancels an active digital prescription with a mandatory clinical reason.
     */
    suspend fun cancelPrescription(prescriptionId: String, reason: String): Result<Unit>

    /**
     * Retrieves patients eligible to receive prescriptions from this doctor (active care team / appointments).
     */
    suspend fun getEligiblePatients(): Result<List<PrescriptionPatientItem>>

    /**
     * Verifies the doctor's professional licensing and SISA validation status under Decreto 63.
     */
    suspend fun getDoctorEligibility(): Result<DoctorEligibility>
}
