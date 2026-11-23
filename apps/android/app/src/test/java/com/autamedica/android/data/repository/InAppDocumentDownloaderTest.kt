package com.autamedica.android.data.repository

import android.content.Context
import com.google.common.truth.Truth.assertThat
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.MemoryCodeVerifierCache
import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.createSupabaseClient
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.Base64
import java.util.concurrent.TimeUnit

class InAppDocumentDownloaderTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    private lateinit var apiServer: MockWebServer
    private lateinit var storageServer: MockWebServer
    private lateinit var supabaseClient: SupabaseClient
    private lateinit var downloader: InAppDocumentDownloader

    @Before
    fun setUp() {
        apiServer = MockWebServer()
        storageServer = MockWebServer()
        apiServer.start()
        storageServer.start()

        val context = mockk<Context>()
        every { context.cacheDir } returns tempFolder.root

        supabaseClient = createSupabaseClient(
            supabaseUrl = apiServer.url("/").toString(),
            supabaseKey = "test-anon-key",
        ) {
            install(Auth) {
                sessionManager = MemorySessionManager()
                codeVerifierCache = MemoryCodeVerifierCache()
                autoLoadFromStorage = false
                autoSaveToStorage = false
                alwaysAutoRefresh = false
                enableLifecycleCallbacks = false
            }
        }

        downloader = InAppDocumentDownloader(
            context = context,
            supabaseClient = supabaseClient,
            httpClient = OkHttpClient(),
        ).apply {
            webApiBaseUrl = apiServer.url("/").toString().trimEnd('/')
            supabaseBaseUrl = storageServer.url("/").toString().trimEnd('/')
            allowCleartextLoopbackForTests = true
        }
    }

    @After
    fun tearDown() {
        apiServer.shutdown()
        storageServer.shutdown()
    }

    private suspend fun signInSyntheticUser() {
        val encoder = Base64.getUrlEncoder().withoutPadding()
        val header = encoder.encodeToString("""{"alg":"none","typ":"JWT"}""".toByteArray())
        val payload = encoder.encodeToString(
            """{"sub":"user-123","aud":"authenticated","role":"authenticated","exp":4102444800,"iat":1700000000}"""
                .toByteArray(),
        )
        val jwt = "$header.$payload.sig"
        apiServer.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"id":"user-123","aud":"authenticated","role":"authenticated","email":"doc@test.invalid","email_confirmed_at":"2026-01-01T00:00:00Z","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z","app_metadata":{},"user_metadata":{},"identities":[]}"""),
        )
        supabaseClient.auth.importAuthToken(accessToken = jwt, retrieveUser = true, autoRefresh = false)
        apiServer.takeRequest(2, TimeUnit.SECONDS)
    }

    @Test
    fun `downloads valid PDF from signed storage URL into private cache`() = runTest {
        val pdfBytes = "%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF".toByteArray()
        storageServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/pdf")
                .setBody(Buffer().write(pdfBytes)),
        )

        val result = downloader.downloadToPrivateCache(
            storageServer.url("/storage/v1/object/sign/clinical/cert.pdf?token=abc").toString(),
        ).getOrThrow()

        assertThat(result.isPdf).isTrue()
        assertThat(result.isImage).isFalse()
        assertThat(result.mimeType).isEqualTo("application/pdf")
        assertThat(result.file.exists()).isTrue()
        assertThat(result.file.parentFile?.name).isEqualTo("documents")
        assertThat(result.file.readBytes()).isEqualTo(pdfBytes)
    }

    @Test
    fun `strips Authorization header when following redirect from API to Storage`() = runTest {
        signInSyntheticUser()
        val pdfBytes = "%PDF-1.7\n%%EOF".toByteArray()
        val signedStorageUrl = storageServer.url("/storage/v1/object/sign/orders/order.pdf?token=xyz").toString()

        apiServer.enqueue(
            MockResponse()
                .setResponseCode(302)
                .setHeader("Location", signedStorageUrl),
        )
        storageServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/pdf")
                .setBody(Buffer().write(pdfBytes)),
        )

        val result = downloader.downloadToPrivateCache("/api/patients/medical-orders/order-1/pdf").getOrThrow()
        assertThat(result.isPdf).isTrue()

        val apiReq = apiServer.takeRequest(2, TimeUnit.SECONDS)
        assertThat(apiReq?.getHeader("Authorization")).startsWith("Bearer ")

        val storageReq = storageServer.takeRequest(2, TimeUnit.SECONDS)
        assertThat(storageReq?.getHeader("Authorization")).isNull()
    }

    @Test
    fun `rejects untrusted external hosts and non-HTTPS URLs`() = runTest {
        downloader.allowCleartextLoopbackForTests = false

        val untrusted = downloader.downloadToPrivateCache("https://evil.example.com/fake.pdf")
        assertThat(untrusted.isFailure).isTrue()
        assertThat(untrusted.exceptionOrNull()?.message).contains("document_host_untrusted")

        val cleartext = downloader.downloadToPrivateCache("http://www.autamedica.com/api/test.pdf")
        assertThat(cleartext.isFailure).isTrue()
        assertThat(cleartext.exceptionOrNull()?.message).contains("document_https_required")
    }

    @Test
    fun `rejects HTML responses masquerading as clinical documents`() = runTest {
        storageServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "text/html; charset=utf-8")
                .setBody("<html><body>Not a PDF</body></html>"),
        )
        val result = downloader.downloadToPrivateCache(
            storageServer.url("/storage/v1/object/sign/clinical/page.html").toString(),
        )
        assertThat(result.isFailure).isTrue()
        assertThat(result.exceptionOrNull()?.message).contains("document_unsupported_format")
    }
}
