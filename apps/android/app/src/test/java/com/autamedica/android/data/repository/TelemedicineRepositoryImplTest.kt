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
    fun getLiveKitCredentialsWithEmptySessionIdReturnsFailure() = runTest {
        val result = repository.getLiveKitCredentials("")
        assertThat(result.isFailure).isTrue()
        assertThat(result.exceptionOrNull()).isInstanceOf(IllegalArgumentException::class.java)
    }
}
