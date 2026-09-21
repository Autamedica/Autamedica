package com.autamedica.android.data.repository

import com.autamedica.android.domain.repository.AuthRepository
import com.google.common.truth.Truth.assertThat
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test

class PharmacyOnDemandRepositoryImplTest {

    private val supabaseClient = mockk<SupabaseClient>(relaxed = true)
    private val authRepository = mockk<AuthRepository>(relaxed = true)
    private lateinit var repository: PharmacyOnDemandRepositoryImpl

    @Before
    fun setUp() {
        mockkStatic("io.github.jan.supabase.postgrest.PostgrestKt")
        repository = PharmacyOnDemandRepositoryImpl(supabaseClient, authRepository)
    }

    @After
    fun tearDown() {
        unmockkAll()
    }

    @Test
    fun `cancelActiveRequestsForPatient handles blank inputs gracefully without throwing`() = runTest {
        val postgrest = mockk<Postgrest>(relaxed = true)
        every { supabaseClient.postgrest } returns postgrest

        val result = repository.cancelActiveRequestsForPatient("   ", "   ")
        assertThat(result.isSuccess).isTrue()
    }

    @Test
    fun `cancelRequest handles network failure returning Result failure`() = runTest {
        val postgrest = mockk<Postgrest>(relaxed = true)
        every { supabaseClient.postgrest } returns postgrest
        every { postgrest.from(any()) } throws RuntimeException("Network timeout")

        val result = repository.cancelRequest("req-123")
        assertThat(result.isFailure).isTrue()
        assertThat(result.exceptionOrNull()?.message).contains("Network timeout")
    }

    @Test
    fun `cancelActiveRequestsForPatient handles network failure returning Result failure`() = runTest {
        val postgrest = mockk<Postgrest>(relaxed = true)
        every { supabaseClient.postgrest } returns postgrest
        every { postgrest.from(any()) } throws RuntimeException("Connection aborted")

        val result = repository.cancelActiveRequestsForPatient("35123456", "+5491155554321")
        assertThat(result.isFailure).isTrue()
        assertThat(result.exceptionOrNull()?.message).contains("Connection aborted")
    }
}
