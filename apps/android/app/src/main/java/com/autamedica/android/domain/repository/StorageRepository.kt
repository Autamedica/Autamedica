package com.autamedica.android.domain.repository

import java.io.InputStream

/**
 * Enterprise gateway to Supabase Storage (Phase 4).
 * Handles uploads of prescriptions and avatars securely.
 */
interface StorageRepository {
    /**
     * Uploads the file under the current user's isolated folder.
     * Requires RLS matching user.id.
     */
    suspend fun uploadFile(
        bucketName: String,
        bucketPath: String,
        inputStream: InputStream,
        useUpsert: Boolean = true
    ): Result<String>

    /** Returns a signed URL valid for [expiryInSeconds]. */
    suspend fun getSignedUrl(bucketName: String, bucketPath: String, expiryInSeconds: Int = 3600): Result<String>
    
    /** Returns public URL for open buckets (e.g. `avatars`). */
    suspend fun getPublicUrl(bucketName: String, bucketPath: String): Result<String>
}
