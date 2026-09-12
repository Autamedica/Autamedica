package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.CreateCertificateRequest
import com.autamedica.android.domain.model.MedicalCertificate
import com.autamedica.android.domain.model.PrescriptionPatientItem

/**
 * Domain repository contract for managing official medical certificates (Atestados Médicos).
 */
interface MedicalCertificateRepository {

    /**
     * Retrieves all medical certificates issued to the authenticated patient.
     */
    suspend fun getPatientCertificates(): Result<List<MedicalCertificate>>

    /**
     * Retrieves a single medical certificate by its unique identifier.
     */
    suspend fun getCertificateById(id: String): Result<MedicalCertificate>

    /**
     * Retrieves all certificates issued by the authenticated doctor.
     */
    suspend fun getDoctorCertificates(patientId: String? = null): Result<List<MedicalCertificate>>

    /**
     * Issues an official digital medical certificate with legal CUIR and audit trail.
     */
    suspend fun createCertificate(request: CreateCertificateRequest): Result<MedicalCertificate>

    /**
     * Retrieves patients eligible to receive certificates from this doctor.
     */
    suspend fun getEligiblePatients(): Result<List<PrescriptionPatientItem>>
}
