package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.google.common.truth.Truth.assertThat
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FollowupRepositoryImplTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private val supabaseClient = mockk<SupabaseClient>(relaxed = true)
    private val securePreferences = mockk<SecurePreferences>(relaxed = true)
    private lateinit var repository: FollowupRepositoryImpl

    @Before
    fun setUp() {
        mockkStatic("io.github.jan.supabase.postgrest.PostgrestKt")
        repository = FollowupRepositoryImpl(
            ioDispatcher = testDispatcher,
            supabaseClient = supabaseClient,
            securePreferences = securePreferences,
        )
    }

    @After
    fun tearDown() {
        unmockkAll()
    }

    @Test
    fun submitCheckInWithBlankFollowupIdReturnsFailure() = runTest {
        val result = repository.submitCheckIn(
            followupId = "   ",
            evolution = "better",
        )
        assertThat(result.isFailure).isTrue()
        assertThat(result.exceptionOrNull()).isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun submitCheckInWithBlankEvolutionReturnsFailure() = runTest {
        val result = repository.submitCheckIn(
            followupId = "fup-123",
            evolution = "",
        )
        assertThat(result.isFailure).isTrue()
        assertThat(result.exceptionOrNull()).isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun getActiveFollowupsForPatientPropagatesNetworkError() = runTest {
        val postgrest = mockk<Postgrest>(relaxed = true)
        every { supabaseClient.postgrest } returns postgrest
        every { postgrest[any()] } throws RuntimeException("Network connection failed")

        val result = repository.getActiveFollowupsForPatient("patient-999")
        assertThat(result.isFailure).isTrue()
        assertThat(result.exceptionOrNull()?.message).contains("Network connection failed")
    }

    @Test
    fun getPendingCheckInPropagatesNetworkError() = runTest {
        val postgrest = mockk<Postgrest>(relaxed = true)
        every { supabaseClient.postgrest } returns postgrest
        every { postgrest[any()] } throws RuntimeException("Connection timeout")

        val result = repository.getPendingCheckIn("patient-999")
        assertThat(result.isFailure).isTrue()
        assertThat(result.exceptionOrNull()?.message).contains("Connection timeout")
    }
}
