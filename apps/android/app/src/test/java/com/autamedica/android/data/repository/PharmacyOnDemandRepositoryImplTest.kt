package com.autamedica.android.data.repository

import com.autamedica.android.domain.repository.AuthRepository
import com.google.common.truth.Truth.assertThat
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.auth.MemoryCodeVerifierCache
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.realtime.realtime
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import kotlinx.serialization.json.JsonObject
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import okhttp3.mockwebserver.MockWebServer

class PharmacyOnDemandRepositoryImplTest {

    private val supabaseClient = mockk<SupabaseClient>(relaxed = true)
    private val authRepository = mockk<AuthRepository>(relaxed = true)
    private lateinit var repository: PharmacyOnDemandRepositoryImpl

    @Before
    fun setUp() {
        every { authRepository.observeSession() } returns flowOf(null)
        mockkStatic("io.github.jan.supabase.postgrest.PostgrestKt")
        repository = PharmacyOnDemandRepositoryImpl(supabaseClient, authRepository)
    }

    @After
    fun tearDown() {
        unmockkAll()
    }

    @Test
    fun `getPendingQueue does not call protected RPC without authenticated Supabase session`() = runTest {
        val server = MockWebServer()
        server.start()
        try {
            val client = createSupabaseClient(
                supabaseUrl = server.url("/").toString(),
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
                install(Postgrest)
            }
            val auth = mockk<AuthRepository>(relaxed = true)
            every { auth.observeSession() } returns flowOf(null)
            coEvery { auth.getCurrentUser() } returns null
            val isolatedRepository = PharmacyOnDemandRepositoryImpl(client, auth)

            val result = isolatedRepository.getPendingQueue()

            assertThat(result.isFailure).isTrue()
            assertThat(server.requestCount).isEqualTo(0)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `cancelRequest uses request-scoped RPC and propagates network failures`() = runTest {
        val postgrest = mockk<Postgrest>(relaxed = true)
        every { supabaseClient.postgrest } returns postgrest
        coEvery { postgrest.rpc(any<String>(), any<JsonObject>()) } throws RuntimeException("Network timeout")

        val result = repository.cancelRequest("req-123")

        assertThat(result.isFailure).isTrue()
        assertThat(result.exceptionOrNull()?.message).contains("Network timeout")
    }
}
