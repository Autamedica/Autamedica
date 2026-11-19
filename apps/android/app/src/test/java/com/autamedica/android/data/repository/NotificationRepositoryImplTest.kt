package com.autamedica.android.data.repository

import android.content.Context
import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.google.common.truth.Truth.assertThat
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.mockk.every
import io.mockk.firstArg
import io.mockk.mockk
import io.mockk.secondArg
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.MockResponse
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Before
import org.junit.Test

class NotificationRepositoryImplTest {
    private lateinit var server: MockWebServer
    private lateinit var repository: NotificationRepositoryImpl
    private val secureValues = mutableMapOf<String, String>()
    private val securePreferences = mockk<SecurePreferences>()
    private val authRepository = mockk<AuthRepository>(relaxed = true)
    private val sessionFlow = MutableStateFlow<User?>(null)
    private val pendingTokenRegistered = CountDownLatch(1)
    private lateinit var supabaseClient: io.github.jan.supabase.SupabaseClient

    @Before
    fun setUp() {
        server = MockWebServer().also { it.start() }
        every { securePreferences.getString(any()) } answers { secureValues[firstArg<String>()] }
        every { securePreferences.putString(any(), any()) } answers {
            secureValues[firstArg<String>()] = secondArg<String>()
            Unit
        }
        every { securePreferences.remove(any()) } answers {
            val key = firstArg<String>()
            secureValues.remove(key)
            if (key == "fcm_token_pending_registration") pendingTokenRegistered.countDown()
            Unit
        }
        every { authRepository.observeSession() } returns sessionFlow

        supabaseClient = createSupabaseClient(
            supabaseUrl = server.url("/").toString(),
            supabaseKey = "test-anon-key",
        ) {
            install(Auth) { sessionManager = MemorySessionManager() }
            install(Postgrest)
        }
        repository = NotificationRepositoryImpl(
            context = mockk<Context>(relaxed = true),
            supabaseClient = supabaseClient,
            authRepository = authRepository,
            securePreferences = securePreferences,
            ioDispatcher = UnconfinedTestDispatcher(),
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `pending FCM token is registered automatically after authenticated login`() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"id":"authenticated-user-id","aud":"authenticated","role":"authenticated","email":"patient@example.test","email_confirmed_at":"2026-01-01T00:00:00Z","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z","app_metadata":{"provider":"email","providers":["email"]},"user_metadata":{},"identities":[]}"""),
        )
        server.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""[{"fcm_token":"synthetic-login-fcm-token","device_platform":"android"}]"""),
        )
        secureValues[SecurePreferences.KEY_USER_ID] = "cached-profile-user"
        assertThat(repository.registerFcmToken("synthetic-login-fcm-token").isSuccess).isTrue()
        assertThat(server.requestCount).isEqualTo(0)

        supabaseClient.auth.importAuthToken(
            accessToken = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhdXRoZW50aWNhdGVkLXVzZXItaWQiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQxMDI0NDQ4MDAsImlhdCI6MTcwMDAwMDAwMH0.c3ludGhldGljLXNpZ25hdHVyZQ",
            retrieveUser = true,
            autoRefresh = false,
        )
        val authUserRequest = server.takeRequest(2, TimeUnit.SECONDS)
        assertThat(authUserRequest?.path).contains("/auth/v1/user")
        sessionFlow.value = User(
            id = "authenticated-user-id",
            email = "patient@example.test",
            role = UserRole.PATIENT,
        )

        val request = server.takeRequest(2, TimeUnit.SECONDS)
        assertThat(request).isNotNull()
        assertThat(request!!.path).contains("/rest/v1/profiles")
        assertThat(request.getHeader("Authorization"))
            .isEqualTo("Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhdXRoZW50aWNhdGVkLXVzZXItaWQiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQxMDI0NDQ4MDAsImlhdCI6MTcwMDAwMDAwMH0.c3ludGhldGljLXNpZ25hdHVyZQ")
        assertThat(pendingTokenRegistered.await(2, TimeUnit.SECONDS)).isTrue()
        assertThat(secureValues["fcm_token"]).isEqualTo("synthetic-login-fcm-token")
        assertThat(secureValues.containsKey("fcm_token_pending_registration")).isFalse()
    }

    @Test
    fun `new FCM token is held pending without session even when stale user id is cached`() = runTest {
        secureValues[SecurePreferences.KEY_USER_ID] = "stale-user-id"

        val result = repository.registerFcmToken("synthetic-pending-fcm-token")

        assertThat(result.isSuccess).isTrue()
        assertThat(repository.getCachedToken()).isEqualTo("synthetic-pending-fcm-token")
        assertThat(server.requestCount).isEqualTo(0)
    }
}
