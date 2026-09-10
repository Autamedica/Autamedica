package com.autamedica.android.data.repository

import com.google.common.truth.Truth.assertThat
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.mockk.*
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test

class TelemedicineRepositoryImplTest {

    private val supabaseClient = mockk<SupabaseClient>(relaxed = true)
    private lateinit var repository: TelemedicineRepositoryImpl

    @Before
    fun setUp() {
        mockkStatic("io.github.jan.supabase.postgrest.PostgrestKt")
        repository = TelemedicineRepositoryImpl(supabaseClient)
    }

    @After
    fun tearDown() {
        unmockkAll()
    }

    @Test
    fun getSessionWithEmptySessionIdReturnsFailure() = runTest {
        val result = repository.getSession("   ")
        assertThat(result.isFailure).isTrue()
        assertThat(result.exceptionOrNull()).isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun getSessionPropagatesNetworkErrorsFromPostgrestQuery() = runTest {
        val postgrest = mockk<Postgrest>(relaxed = true)
        every { supabaseClient.postgrest } returns postgrest
        every { postgrest.from(any()) } throws RuntimeException("Database network timeout")

        val result = repository.getSession("call-123")
        assertThat(result.isFailure).isTrue()
        assertThat(result.exceptionOrNull()?.message).contains("Database network timeout")
    }

    @Test
    fun defaultIceServersIncludesStunServers() {
        val servers = repository.getDefaultIceServers()
        assertThat(servers).isNotEmpty()
        val allUrls = servers.flatMap { it.urls }
        assertThat(allUrls.any { it.startsWith("stun:") }).isTrue()
        assertThat(allUrls).contains("stun:stun.l.google.com:19302")
    }

    @Test
    fun customIceServersProviderSupportsTurnRelay() = runTest {
        val customTurn = listOf(
            com.autamedica.android.domain.repository.IceServerInfo(
                urls = listOf("turn:turn.autamedica.com:3478", "turns:turn.autamedica.com:5349"),
                username = "telemed-user",
                credential = "telemed-password",
            ),
            com.autamedica.android.domain.repository.IceServerInfo(
                urls = listOf("stun:stun.l.google.com:19302"),
            )
        )
        repository.iceServersProvider = { customTurn }
        repository.sessionInfoFinder = { null }

        val result = repository.getSession("room-turn-test")
        assertThat(result.isSuccess).isTrue()
        val session = result.getOrNull()
        assertThat(session).isNotNull()
        assertThat(session?.iceServers).hasSize(2)
        val turnServer = session?.iceServers?.first()
        assertThat(turnServer?.urls).contains("turn:turn.autamedica.com:3478")
        assertThat(turnServer?.username).isEqualTo("telemed-user")
        assertThat(turnServer?.credential).isEqualTo("telemed-password")
    }

    @Test
    fun updateCallStatusWithEmptyCallIdReturnsSuccessImmediately() = runTest {
        val result = repository.updateCallStatus("   ", "completed")
        assertThat(result.isSuccess).isTrue()
    }

    @Test
    fun getSessionFallsBackToDirectRoomIdWhenNoPriorRecordExists() = runTest {
        repository.sessionInfoFinder = { null }
        val result = repository.getSession("custom-room-456")
        assertThat(result.isSuccess).isTrue()
        val session = result.getOrNull()
        assertThat(session).isNotNull()
        assertThat(session?.sessionId).isEqualTo("custom-room-456")
        assertThat(session?.roomId).isEqualTo("custom-room-456")
        assertThat(session?.signalingUrl).isNotEmpty()
    }
}
