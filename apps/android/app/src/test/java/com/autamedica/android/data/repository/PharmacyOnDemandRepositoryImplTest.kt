package com.autamedica.android.data.repository

import com.autamedica.android.domain.repository.AuthRepository
import com.google.common.truth.Truth.assertThat
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.mockk.coEvery
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
    fun `cancelRequest uses request-scoped RPC and propagates network failures`() = runTest {
        val postgrest = mockk<Postgrest>(relaxed = true)
        every { supabaseClient.postgrest } returns postgrest
        coEvery { postgrest.rpc(any(), any()) } throws RuntimeException("Network timeout")

        val result = repository.cancelRequest("req-123")

        assertThat(result.isFailure).isTrue()
        assertThat(result.exceptionOrNull()?.message).contains("Network timeout")
    }
}
