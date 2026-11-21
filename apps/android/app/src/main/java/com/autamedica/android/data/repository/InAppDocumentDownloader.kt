package com.autamedica.android.data.repository

import android.content.Context
import com.autamedica.android.BuildConfig
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.logging.HttpLoggingInterceptor
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URI
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

data class DownloadedInAppDocument(
    val file: File,
    val mimeType: String,
    val isPdf: Boolean,
    val isImage: Boolean,
)

/**
 * Downloads private clinical PDFs and images into the app's private cache directory
 * so they can be rendered inside AutaMedica without launching Chrome or an external app.
 *
 * Security invariants:
 * - Strictly enforces HTTPS and trusted AutaMedica / Supabase Storage hosts.
 * - Never forwards Supabase Bearer tokens to Storage URLs or across HTTP redirects.
 * - Rejects HTML responses, oversized payloads (> 25 MB), and unknown binary signatures.
 */
@Singleton
class InAppDocumentDownloader @Inject constructor(
    @ApplicationContext private val context: Context,
    private val supabaseClient: SupabaseClient,
    httpClient: OkHttpClient,
) {
    private val isolatedClient: OkHttpClient = httpClient.newBuilder().apply {
        interceptors().removeAll { it is HttpLoggingInterceptor }
        networkInterceptors().removeAll { it is HttpLoggingInterceptor }
        connectTimeout(15, TimeUnit.SECONDS)
        readTimeout(30, TimeUnit.SECONDS)
        followRedirects(false)
        followSslRedirects(false)
    }.build()

    internal var webApiBaseUrl: String = BuildConfig.WEB_API_URL.trimEnd('/')
    internal var supabaseBaseUrl: String = BuildConfig.SUPABASE_URL.trimEnd('/')
    internal var allowCleartextLoopbackForTests: Boolean = false

    suspend fun downloadToPrivateCache(
        rawUrl: String,
        isImageHint: Boolean = false,
    ): Result<DownloadedInAppDocument> = withContext(Dispatchers.IO) {
        runCatching {
            val initialUri = resolveAndValidateUri(rawUrl)
            val needsBearer = isWebApiUri(initialUri)
            val accessToken = if (needsBearer) {
                supabaseClient.auth.currentSessionOrNull()?.accessToken
            } else {
                null
            }

            val firstRequest = Request.Builder()
                .url(initialUri.toASCIIString())
                .header("Accept", if (isImageHint) "image/*,application/pdf,*/*" else "application/pdf,image/*,*/*")
                .apply {
                    if (!accessToken.isNullOrBlank()) {
                        header("Authorization", "Bearer $accessToken")
                    }
                }
                .get()
                .build()

            var bytes: ByteArray? = null
            var contentType = ""

            isolatedClient.newCall(firstRequest).execute().use { response ->
                when (response.code) {
                    in 200..299 -> {
                        contentType = response.header("Content-Type").orEmpty()
                        bytes = readBoundedBytes(response.body?.byteStream())
                    }
                    in 300..399 -> {
                        val location = response.header("Location").orEmpty()
                        require(location.isNotBlank()) { "document_redirect_missing_location" }
                        val redirectUri = resolveAndValidateUri(location)
                        // Never forward Bearer tokens across redirects to Storage signed URLs.
                        val redirectReq = Request.Builder()
                            .url(redirectUri.toASCIIString())
                            .header("Accept", if (isImageHint) "image/*,application/pdf,*/*" else "application/pdf,image/*,*/*")
                            .get()
                            .build()
                        isolatedClient.newCall(redirectReq).execute().use { redirected ->
                            check(redirected.isSuccessful) { "document_http_${redirected.code}" }
                            contentType = redirected.header("Content-Type").orEmpty()
                            bytes = readBoundedBytes(redirected.body?.byteStream())
                        }
                    }
                    else -> throw IllegalStateException("document_http_${response.code}")
                }
            }

            val payload = requireNotNull(bytes) { "document_empty_payload" }
            require(payload.isNotEmpty()) { "document_empty_payload" }

            val cleanContentType = contentType.substringBefore(';').trim().lowercase(Locale.ROOT)
            val isPdf = hasMagic(payload, PDF_MAGIC)
            val detectedImageMime = detectImageMime(payload, cleanContentType)
            val isImage = !isPdf && detectedImageMime != null
            require(isPdf || isImage) { "document_unsupported_format" }

            val finalMime = if (isPdf) "application/pdf" else requireNotNull(detectedImageMime)
            val extension = when (finalMime) {
                "application/pdf" -> "pdf"
                "image/png" -> "png"
                "image/webp" -> "webp"
                else -> "jpg"
            }

            val dir = File(context.cacheDir, CACHE_SUBDIR)
            check(dir.isDirectory || dir.mkdirs()) { "document_cache_unavailable" }
            pruneOldCacheFilesIfNeeded(dir)

            val hashPrefix = sha256Hex(payload).take(24)
            val target = File(dir, "doc_$hashPrefix.$extension")
            val temp = File(dir, "doc_$hashPrefix.$extension.tmp")
            temp.writeBytes(payload)
            if (target.exists()) {
                check(target.delete()) { "document_cache_replace_failed" }
            }
            check(temp.renameTo(target)) { "document_cache_write_failed" }

            DownloadedInAppDocument(
                file = target,
                mimeType = finalMime,
                isPdf = isPdf,
                isImage = isImage,
            )
        }.onFailure { error ->
            SecureLog.error("[InAppDocumentDownloader] Failed downloading clinical document", error)
        }
    }

    private fun resolveAndValidateUri(rawUrl: String): URI {
        val trimmed = rawUrl.trim()
        require(trimmed.isNotEmpty()) { "document_url_blank" }
        val resolved = if (trimmed.startsWith("/")) {
            webApiBaseUrl + trimmed
        } else {
            trimmed
        }
        val uri = runCatching { URI(resolved) }.getOrNull()
            ?: throw IllegalArgumentException("document_url_invalid")
        val scheme = uri.scheme?.lowercase(Locale.ROOT).orEmpty()
        val host = uri.host?.lowercase(Locale.ROOT).orEmpty()
        require(uri.userInfo == null && host.isNotBlank()) { "document_url_untrusted" }

        val isLoopbackTest = allowCleartextLoopbackForTests &&
            scheme == "http" &&
            (host == "127.0.0.1" || host == "localhost")
        require(scheme == "https" || isLoopbackTest) { "document_https_required" }
        require(isTrustedHost(host) || isLoopbackTest) { "document_host_untrusted" }
        return uri
    }

    private fun isTrustedHost(host: String): Boolean {
        val normalized = host.lowercase(Locale.ROOT)
        val trusted = buildSet {
            runCatching { URI(supabaseBaseUrl).host?.lowercase(Locale.ROOT) }.getOrNull()?.let(::add)
            runCatching { URI(webApiBaseUrl).host?.lowercase(Locale.ROOT) }.getOrNull()?.let(::add)
            add("autamedica.com")
            add("www.autamedica.com")
        }
        return normalized in trusted
    }

    private fun isWebApiUri(uri: URI): Boolean {
        val normalizedHost = uri.host?.lowercase(Locale.ROOT) ?: return false
        val apiUri = runCatching { URI(webApiBaseUrl) }.getOrNull()
        val apiHost = apiUri?.host?.lowercase(Locale.ROOT)
        if (normalizedHost == "autamedica.com" || normalizedHost == "www.autamedica.com") {
            return true
        }
        if (apiHost != null && normalizedHost == apiHost) {
            return uri.port == apiUri.port
        }
        return false
    }

    private fun readBoundedBytes(input: java.io.InputStream?): ByteArray {
        requireNotNull(input) { "document_empty_stream" }
        val out = ByteArrayOutputStream()
        input.use { stream ->
            val buf = ByteArray(DEFAULT_BUFFER_SIZE)
            var total = 0
            while (true) {
                val read = stream.read(buf)
                if (read < 0) break
                total += read
                require(total <= MAX_DOCUMENT_BYTES) { "document_too_large" }
                out.write(buf, 0, read)
            }
        }
        return out.toByteArray()
    }

    private fun detectImageMime(bytes: ByteArray, contentType: String): String? = when {
        hasMagic(bytes, PNG_MAGIC) -> "image/png"
        hasMagic(bytes, JPEG_MAGIC) -> "image/jpeg"
        bytes.size >= 12 &&
            hasMagic(bytes, RIFF_MAGIC) &&
            bytes.copyOfRange(8, 12).contentEquals(WEBP_MAGIC) -> "image/webp"
        contentType in setOf("image/jpeg", "image/jpg", "image/png", "image/webp") ->
            if (contentType == "image/jpg") "image/jpeg" else contentType
        else -> null
    }

    private fun hasMagic(bytes: ByteArray, magic: ByteArray): Boolean =
        bytes.size >= magic.size && bytes.copyOfRange(0, magic.size).contentEquals(magic)

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { b -> (b.toInt() and 0xff).toString(16).padStart(2, '0') }

    private fun pruneOldCacheFilesIfNeeded(dir: File) {
        val files = dir.listFiles()?.filter { it.isFile } ?: return
        if (files.size <= MAX_CACHED_FILES) return
        files.sortedBy { it.lastModified() }
            .take(files.size - MAX_CACHED_FILES)
            .forEach { runCatching { it.delete() } }
    }

    companion object {
        const val CACHE_SUBDIR = "documents"
        const val MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
        private const val MAX_CACHED_FILES = 24
        private val PDF_MAGIC = "%PDF-".toByteArray(Charsets.US_ASCII)
        private val PNG_MAGIC = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47)
        private val JPEG_MAGIC = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte())
        private val RIFF_MAGIC = "RIFF".toByteArray(Charsets.US_ASCII)
        private val WEBP_MAGIC = "WEBP".toByteArray(Charsets.US_ASCII)
    }
}
