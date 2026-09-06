package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.Prescription

/**
 * Domain repository contract for accessing patient digital prescriptions.
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
}
