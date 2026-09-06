package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.data.remote.SupabaseAuthDataSource
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.logging.SecureLog
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val authDataSource: SupabaseAuthDataSource,
    private val securePrefs: SecurePreferences,
) : AuthRepository {

    override fun observeSession(): Flow<User?> {
        return authDataSource.observeAuthUser().map { authUser ->
            authUser?.toDomainUser()
        }
    }

    override suspend fun login(email: String, password: String, selectedRole: UserRole?): Result<User> {
        return try {
            val authUser = authDataSource.signIn(email, password)

            // If role is not in JWT metadata, fetch from profiles table; fallback to selectedRole
            val dbRole = authUser.role ?: authDataSource.fetchUserRole(authUser.id)
            val effectiveRole = dbRole ?: selectedRole?.wireName ?: "patient"

            securePrefs.putString(SecurePreferences.KEY_USER_ID, authUser.id)
            securePrefs.putString(SecurePreferences.KEY_USER_ROLE, effectiveRole)

            val user = User(
                id = authUser.id,
                email = authUser.email,
                role = parseRole(effectiveRole),
            )
            Result.success(user)
        } catch (e: Exception) {
            SecureLog.error("Login failed", e)
            Result.failure(e)
        }
    }

    override suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole?): Result<User> {
        return try {
            val authUser = authDataSource.signInWithGoogle(idToken)
            val dbRole = authUser.role ?: authDataSource.fetchUserRole(authUser.id)
            val effectiveRole = dbRole ?: selectedRole?.wireName ?: "patient"

            securePrefs.putString(SecurePreferences.KEY_USER_ID, authUser.id)
            securePrefs.putString(SecurePreferences.KEY_USER_ROLE, effectiveRole)

            val user = User(
                id = authUser.id,
                email = authUser.email,
                role = parseRole(effectiveRole),
            )
            Result.success(user)
        } catch (e: Exception) {
            SecureLog.error("Google login failed", e)
            Result.failure(e)
        }
    }

    override suspend fun logout() {
        try {
            authDataSource.signOut()
        } catch (e: Exception) {
            SecureLog.warn("Sign out error (clearing local state anyway)", e)
        }
        securePrefs.clear()
    }

    override suspend fun getCurrentUser(): User? {
        return try {
            val authUser = authDataSource.getCurrentUser() ?: return null

            // Ensure SecurePreferences are hydrated for restored sessions
            securePrefs.putString(SecurePreferences.KEY_USER_ID, authUser.id)
            val role = authUser.role ?: authDataSource.fetchUserRole(authUser.id)
            if (role != null) {
                securePrefs.putString(SecurePreferences.KEY_USER_ROLE, role)
            }

            authUser.toDomainUser()
        } catch (e: Exception) {
            SecureLog.warn("Failed to get current user", e)
            null
        }
    }

    private fun com.autamedica.android.data.remote.AuthUser.toDomainUser(): User {
        return User(
            id = id,
            email = email,
            role = parseRole(role ?: securePrefs.getString(SecurePreferences.KEY_USER_ROLE)),
        )
    }

    private fun parseRole(role: String?): UserRole {
        if (role == null) return UserRole.PATIENT
        return try {
            UserRole.entries.first { it.name.equals(role, ignoreCase = true) }
        } catch (_: NoSuchElementException) {
            Timber.w("Unknown role: $role, defaulting to PATIENT")
            UserRole.PATIENT
        }
    }
}
