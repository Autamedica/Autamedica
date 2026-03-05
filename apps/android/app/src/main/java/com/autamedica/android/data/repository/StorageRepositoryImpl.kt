package com.autamedica.android.data.repository

import com.autamedica.android.domain.repository.StorageRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.storage.storage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.InputStream
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StorageRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient
) : StorageRepository {

    override suspend fun uploadFile(
        bucketName: String,
        bucketPath: String,
        inputStream: InputStream,
        useUpsert: Boolean
    ): Result<String> = runCatching {
        withContext(Dispatchers.IO) {
            val bytes = inputStream.readBytes()
            supabaseClient.storage.from(bucketName).upload(bucketPath, bytes) {
                upsert = useUpsert
            }
            bucketPath // Returning the internal path which can later be resolved into a URL
        }
    }.onFailure {
        SecureLog.error("[Storage] Failed uploading $bucketPath", it)
    }

    override suspend fun getSignedUrl(
        bucketName: String,
        bucketPath: String,
        expiryInSeconds: Int
    ): Result<String> = runCatching {
        supabaseClient.storage.from(bucketName).createSignedUrl(bucketPath, expiresIn = kotlin.time.Duration.parse("${expiryInSeconds}s"))
    }.onFailure {
        SecureLog.error("[Storage] Failed creating Signed URL for $bucketPath", it)
    }

    override suspend fun getPublicUrl(bucketName: String, bucketPath: String): Result<String> = runCatching {
        supabaseClient.storage.from(bucketName).publicUrl(bucketPath)
    }.onFailure {
        SecureLog.error("[Storage] Failed resolving public url for $bucketPath", it)
    }
}
