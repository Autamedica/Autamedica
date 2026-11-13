package com.autamedica.android.data.remote

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.IDToken
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

data class AuthUser(
    val id: String,
    val email: String,
    val role: String?,
    val displayName: String? = null,
    val phone: String? = null,
)

@Singleton
class SupabaseAuthDataSource @Inject constructor(
    private val supabase: SupabaseClient,
) {
    private val auth: Auth get() = supabase.auth

    fun observeSessionStatus(): Flow<SessionStatus> = auth.sessionStatus

    fun observeAuthUser(): Flow<AuthUser?> = auth.sessionStatus
        .filter { it !is SessionStatus.Initializing }
        .map { status ->
            when (status) {
                is SessionStatus.Authenticated -> {
                    val user = status.session.user
                    if (user != null) {
                        val role = extractRole(user)
                        val fullName = user.userMetadata?.jsonObject?.get("full_name")?.jsonPrimitive?.contentOrNull
                            ?: user.userMetadata?.jsonObject?.get("name")?.jsonPrimitive?.contentOrNull
                        val phone = user.phone ?: user.userMetadata?.jsonObject?.get("phone")?.jsonPrimitive?.contentOrNull
                        AuthUser(
                            id = user.id,
                            email = user.email ?: "",
                            role = role,
                            displayName = fullName,
                            phone = phone,
                        )
                    } else null
                }
                else -> null
            }
        }

    suspend fun signIn(email: String, password: String): AuthUser {
        auth.signInWith(Email) {
            this.email = email
            this.password = password
        }

        val session = auth.currentSessionOrNull()
            ?: throw IllegalStateException("Session is null after sign-in")
        val user = session.user
            ?: throw IllegalStateException("User is null after sign-in")

        val role = extractRole(user)
        val fullName = user.userMetadata?.jsonObject?.get("full_name")?.jsonPrimitive?.contentOrNull
            ?: user.userMetadata?.jsonObject?.get("name")?.jsonPrimitive?.contentOrNull
        val phone = user.phone ?: user.userMetadata?.jsonObject?.get("phone")?.jsonPrimitive?.contentOrNull

        return AuthUser(
            id = user.id,
            email = user.email ?: email,
            role = role,
            displayName = fullName,
            phone = phone,
        )
    }

    suspend fun signInWithGoogle(googleIdToken: String): AuthUser {
        auth.signInWith(IDToken) {
            idToken = googleIdToken
            provider = Google
        }

        val session = auth.currentSessionOrNull()
            ?: throw IllegalStateException("Session is null after Google sign-in")
        val user = session.user
            ?: throw IllegalStateException("User is null after Google sign-in")

        val role = extractRole(user)
        val fullName = user.userMetadata?.jsonObject?.get("full_name")?.jsonPrimitive?.contentOrNull
            ?: user.userMetadata?.jsonObject?.get("name")?.jsonPrimitive?.contentOrNull
        val phone = user.phone ?: user.userMetadata?.jsonObject?.get("phone")?.jsonPrimitive?.contentOrNull

        return AuthUser(
            id = user.id,
            email = user.email ?: "",
            role = role,
            displayName = fullName,
            phone = phone,
        )
    }

    suspend fun signUp(email: String, password: String, role: String): AuthUser? {
        val result = auth.signUpWith(Email) {
            this.email = email
            this.password = password
            data = kotlinx.serialization.json.buildJsonObject {
                put("role", kotlinx.serialization.json.JsonPrimitive(role))
            }
        }
        val user = result ?: auth.currentSessionOrNull()?.user
        return user?.let {
            val fullName = it.userMetadata?.jsonObject?.get("full_name")?.jsonPrimitive?.contentOrNull
                ?: it.userMetadata?.jsonObject?.get("name")?.jsonPrimitive?.contentOrNull
            val phone = it.phone ?: it.userMetadata?.jsonObject?.get("phone")?.jsonPrimitive?.contentOrNull
            AuthUser(
                id = it.id,
                email = it.email ?: email,
                role = extractRole(it),
                displayName = fullName,
                phone = phone,
            )
        }
    }

    suspend fun signOut() {
        auth.signOut()
    }

    suspend fun getCurrentUser(): AuthUser? {
        auth.awaitInitialization()
        val session = auth.currentSessionOrNull() ?: return null
        val user = session.user ?: return null
        val role = extractRole(user)
        val fullName = user.userMetadata?.jsonObject?.get("full_name")?.jsonPrimitive?.contentOrNull
            ?: user.userMetadata?.jsonObject?.get("name")?.jsonPrimitive?.contentOrNull
        val phone = user.phone ?: user.userMetadata?.jsonObject?.get("phone")?.jsonPrimitive?.contentOrNull
        return AuthUser(
            id = user.id,
            email = user.email ?: "",
            role = role,
            displayName = fullName,
            phone = phone,
        )
    }

    private fun extractRole(user: io.github.jan.supabase.auth.user.UserInfo): String? {
        // Only app_metadata is server-controlled; user_metadata can be edited by the user.
        return user.appMetadata?.get("role")?.jsonPrimitive?.contentOrNull
            ?.takeIf { it.isNotBlank() }
    }

    fun isCurrentUser(userId: String): Boolean =
        auth.currentSessionOrNull()?.user?.id == userId

    suspend fun fetchUserRole(userId: String): String? {
        return supabase.postgrest.from("profiles")
            .select(io.github.jan.supabase.postgrest.query.Columns.list("role")) {
                filter { eq("user_id", userId) }
            }
            .decodeList<ProfileRoleOnly>()
            .firstOrNull()?.role
    }

    suspend fun sendPasswordResetEmail(email: String) {
        auth.resetPasswordForEmail(email)
    }
}

@kotlinx.serialization.Serializable
private data class ProfileRoleOnly(
    val role: String? = null,
)
