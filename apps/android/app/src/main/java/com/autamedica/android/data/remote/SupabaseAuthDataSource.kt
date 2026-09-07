package com.autamedica.android.data.remote

import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.IDToken
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

data class AuthUser(
    val id: String,
    val email: String,
    val role: String?,
)

@Singleton
class SupabaseAuthDataSource @Inject constructor(
    private val supabase: SupabaseClient,
) {
    private val auth: Auth get() = supabase.auth

    fun observeSessionStatus(): Flow<SessionStatus> = auth.sessionStatus

    fun observeAuthUser(): Flow<AuthUser?> = auth.sessionStatus.map { status ->
        when (status) {
            is SessionStatus.Authenticated -> {
                val user = status.session.user
                if (user != null) {
                    val role = extractRole(user)
                    AuthUser(
                        id = user.id,
                        email = user.email ?: "",
                        role = role,
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

        return AuthUser(
            id = user.id,
            email = user.email ?: email,
            role = role,
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

        return AuthUser(
            id = user.id,
            email = user.email ?: "",
            role = role,
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
            AuthUser(
                id = it.id,
                email = it.email ?: email,
                role = extractRole(it) ?: role,
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
        return AuthUser(
            id = user.id,
            email = user.email ?: "",
            role = role,
        )
    }

    private fun extractRole(user: io.github.jan.supabase.auth.user.UserInfo): String? {
        val appRole = user.appMetadata?.get("role")?.jsonPrimitive?.content
        if (!appRole.isNullOrBlank()) return appRole
        val userRole = user.userMetadata?.jsonObject?.get("role")?.jsonPrimitive?.content
        if (!userRole.isNullOrBlank()) return userRole
        return null
    }

    suspend fun fetchUserRole(userId: String): String? {
        return try {
            val result = supabase.postgrest.from("profiles")
                .select(io.github.jan.supabase.postgrest.query.Columns.list("role")) {
                    filter { eq("user_id", userId) }
                }
                .decodeList<ProfileRoleOnly>()
                .firstOrNull()
            result?.role
        } catch (e: Exception) {
            SecureLog.warn("Failed to fetch user role from profiles table", e)
            null
        }
    }

    suspend fun sendPasswordResetEmail(email: String) {
        auth.resetPasswordForEmail(email)
    }
}

@kotlinx.serialization.Serializable
private data class ProfileRoleOnly(
    val role: String? = null,
)
