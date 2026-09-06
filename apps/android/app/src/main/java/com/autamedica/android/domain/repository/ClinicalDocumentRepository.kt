package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.ClinicalDocument
import java.io.InputStream

/**
 * Domain repository contract for managing clinical studies and medical documents.
 */
interface ClinicalDocumentRepository {

    /**
     * Retrieves all clinical documents, studies and lab reports for the current patient.
     */
    suspend fun getDocuments(): Result<List<ClinicalDocument>>

    /**
     * Uploads a clinical file to Supabase Storage and records it in medical_records.
     */
    suspend fun uploadDocument(
        title: String,
        type: String,
        fileName: String,
        mimeType: String,
        inputStream: InputStream,
    ): Result<ClinicalDocument>
}
