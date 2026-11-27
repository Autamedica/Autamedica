package com.autamedica.android.presentation.auth

import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class GoogleSignInRequestFactoryTest {

    private val clientId = "1234567890-testclient.apps.googleusercontent.com"

    @Test
    fun `buildExplicitRequest uses GetSignInWithGoogleOption to bypass One Tap cooldown`() {
        val request = GoogleSignInRequestFactory.buildExplicitRequest(clientId)

        assertThat(request.credentialOptions).hasSize(1)
        val option = request.credentialOptions.single()
        assertThat(option).isInstanceOf(GetSignInWithGoogleOption::class.java)
        assertThat((option as GetSignInWithGoogleOption).serverClientId).isEqualTo(clientId)
    }

    @Test
    fun `buildFallbackOneTapRequest disables authorized accounts filter`() {
        val request = GoogleSignInRequestFactory.buildFallbackOneTapRequest(clientId)

        assertThat(request.credentialOptions).hasSize(1)
        val option = request.credentialOptions.single()
        assertThat(option).isInstanceOf(GetGoogleIdOption::class.java)
        val googleIdOption = option as GetGoogleIdOption
        assertThat(googleIdOption.serverClientId).isEqualTo(clientId)
        assertThat(googleIdOption.filterByAuthorizedAccounts).isFalse()
    }

    @Test
    fun `blank clientId is rejected for explicit and fallback requests`() {
        assertThrows(IllegalArgumentException::class.java) {
            GoogleSignInRequestFactory.buildExplicitRequest("   ")
        }
        assertThrows(IllegalArgumentException::class.java) {
            GoogleSignInRequestFactory.buildFallbackOneTapRequest("")
        }
    }
}
