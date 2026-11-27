package com.autamedica.android.presentation.auth

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.CancellationException

/**
 * Builds Credential Manager requests for explicit "Continue with Google" buttons.
 *
 * Uses [GetSignInWithGoogleOption] as primary because passive One Tap ([GetGoogleIdOption])
 * enforces a 24-hour Play Services cooldown after dismissal and fails with [NoCredentialException].
 */
internal object GoogleSignInRequestFactory {

    fun buildExplicitRequest(serverClientId: String): GetCredentialRequest {
        require(serverClientId.isNotBlank()) {
            "GOOGLE_WEB_CLIENT_ID must not be blank"
        }
        val signInWithGoogleOption = GetSignInWithGoogleOption.Builder(serverClientId)
            .build()
        return GetCredentialRequest.Builder()
            .addCredentialOption(signInWithGoogleOption)
            .build()
    }

    fun buildFallbackOneTapRequest(serverClientId: String): GetCredentialRequest {
        require(serverClientId.isNotBlank()) {
            "GOOGLE_WEB_CLIENT_ID must not be blank"
        }
        val googleIdOption = GetGoogleIdOption.Builder()
            .setServerClientId(serverClientId)
            .setFilterByAuthorizedAccounts(false)
            .build()
        return GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()
    }

    suspend fun requestGoogleIdToken(activity: Activity, serverClientId: String): String {
        val credentialManager = CredentialManager.create(activity)
        val result = try {
            credentialManager.getCredential(
                request = buildExplicitRequest(serverClientId),
                context = activity,
            )
        } catch (e: CancellationException) {
            throw e
        } catch (noCred: NoCredentialException) {
            try {
                credentialManager.getCredential(
                    request = buildFallbackOneTapRequest(serverClientId),
                    context = activity,
                )
            } catch (e: CancellationException) {
                throw e
            } catch (_: NoCredentialException) {
                throw noCred
            }
        }
        return GoogleIdTokenCredential.createFrom(result.credential.data).idToken
    }
}
