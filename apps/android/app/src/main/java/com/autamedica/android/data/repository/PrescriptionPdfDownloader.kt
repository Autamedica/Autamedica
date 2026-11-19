package com.autamedica.android.data.repository

import android.content.Context
import com.autamedica.android.BuildConfig
import com.autamedica.android.domain.model.DownloadedPrescriptionPdf
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PrescriptionPdfDownloader @Inject constructor(
    @ApplicationContext private val context: Context,
    private val supabaseClient: SupabaseClient,
) {
    suspend fun download(prescriptionId: String): Result<DownloadedPrescriptionPdf> =
        withContext(Dispatchers.IO) {
            runCatching {
                val accessToken = requireNotNull(
                    supabaseClient.auth.currentSessionOrNull()?.accessToken,
                ) { "prescription_pdf_auth_required" }

                val endpointPath = if (prescriptionId.startsWith("memed:")) {
                    val rowId = prescriptionId.removePrefix("memed:")
                    require(UUID_PATTERN.matches(rowId)) { "invalid_memed_prescription_id" }
                    "/api/patients/prescriptions/memed-$rowId/pdf"
                } else {
                    require(UUID_PATTERN.matches(prescriptionId)) { "invalid_prescription_id" }
                    "/api/doctors/prescriptions/$prescriptionId/pdf"
                }

                val endpoint = URL(BuildConfig.WEB_API_URL.trimEnd('/') + endpointPath)
                require(endpoint.protocol == "https") { "prescription_pdf_https_required" }
                val connection = (endpoint.openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    instanceFollowRedirects = false
                    connectTimeout = CONNECT_TIMEOUT_MS
                    readTimeout = READ_TIMEOUT_MS
                    setRequestProperty("Authorization", "Bearer $accessToken")
                    setRequestProperty("Accept", "application/pdf")
                }

                try {
                    val status = connection.responseCode
                    check(status == HttpURLConnection.HTTP_OK) { "prescription_pdf_http_$status" }
                    check(connection.contentType?.substringBefore(';')?.trim()
                        .equals("application/pdf", ignoreCase = true)) {
                        "prescription_pdf_content_type_invalid"
                    }

                    val expectedHash = connection.getHeaderField("X-Content-SHA256")?.lowercase()
                    require(expectedHash != null && SHA256_PATTERN.matches(expectedHash)) {
                        "prescription_pdf_hash_header_missing"
                    }
                    val expectedLength = connection.getHeaderField("X-Content-Length")?.toLongOrNull()

                    val output = ByteArrayOutputStream()
                    connection.inputStream.use { input ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        var total = 0
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            total += read
                            require(total <= MAX_PDF_BYTES) { "prescription_pdf_too_large" }
                            output.write(buffer, 0, read)
                        }
                    }

                    val bytes = output.toByteArray()
                    require(bytes.size >= PDF_MAGIC.size &&
                        bytes.copyOfRange(0, PDF_MAGIC.size).contentEquals(PDF_MAGIC)) {
                        "prescription_pdf_signature_invalid"
                    }
                    require(expectedLength == null || expectedLength == bytes.size.toLong()) {
                        "prescription_pdf_length_mismatch"
                    }

                    val actualHash = MessageDigest.getInstance("SHA-256")
                        .digest(bytes)
                        .joinToString("") { byte -> (byte.toInt() and 0xff).toString(16).padStart(2, '0') }
                    check(actualHash == expectedHash) { "prescription_pdf_sha256_mismatch" }

                    val directory = File(context.cacheDir, "prescriptions")
                    check(directory.isDirectory || directory.mkdirs()) {
                        "prescription_pdf_cache_unavailable"
                    }
                    val safeName = endpointPath.substringAfterLast('/').replace(
                        Regex("[^A-Za-z0-9_-]"),
                        "_",
                    )
                    val target = File(directory, "$safeName.pdf")
                    val temporary = File(directory, "$safeName.pdf.tmp")
                    temporary.writeBytes(bytes)
                    if (target.exists()) check(target.delete()) { "prescription_pdf_cache_replace_failed" }
                    check(temporary.renameTo(target)) { "prescription_pdf_cache_write_failed" }

                    DownloadedPrescriptionPdf(
                        localPath = target.absolutePath,
                        sha256 = actualHash,
                    )
                } finally {
                    connection.disconnect()
                }
            }
        }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 30_000
        const val MAX_PDF_BYTES = 25 * 1024 * 1024
        val PDF_MAGIC = "%PDF-".toByteArray(Charsets.US_ASCII)
        val UUID_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        val SHA256_PATTERN = Regex("^[0-9a-f]{64}$")
    }
}
