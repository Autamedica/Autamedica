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

/** UI role resolution fails closed if the database profile is unavailable. */
internal fun authoritativeUiRole(profileRole: String?): String =
    profileRole?.trim()?.takeIf { it.isNotEmpty() } ?: "patient"

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val authDataSource: SupabaseAuthDataSource,
    private val securePrefs: SecurePreferences,
) : AuthRepository {

    override fun observeSession(): Flow<User?> {
        return authDataSource.observeAuthUser().map { authUser ->
            authUser?.let {
                val role = authoritativeUiRole(authDataSource.fetchUserRole(it.id))
                securePrefs.putString(SecurePreferences.KEY_USER_ID, it.id)
                securePrefs.putString(SecurePreferences.KEY_USER_ROLE, role)
                it.toDomainUser(role)
            }
        }
    }

    override suspend fun login(email: String, password: String, selectedRole: UserRole?): Result<User> {
        return try {
            val authUser = authDataSource.signIn(email, password)

            // The selected role is a login preference, never an authorization source.
            val effectiveRole = authoritativeUiRole(authDataSource.fetchUserRole(authUser.id))

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
            val effectiveRole = authoritativeUiRole(authDataSource.fetchUserRole(authUser.id))

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

    override suspend fun register(email: String, password: String, selectedRole: UserRole): Result<com.autamedica.android.domain.repository.UserRegistrationResult> {
        return try {
            val authUser = authDataSource.signUp(email, password, selectedRole.wireName)
            if (authUser != null) {
                val requiresEmailConfirmation = authDataSource.getCurrentUser() == null
                if (!requiresEmailConfirmation) {
                    securePrefs.putString(SecurePreferences.KEY_USER_ID, authUser.id)
                    securePrefs.putString(SecurePreferences.KEY_USER_ROLE, selectedRole.wireName)
                }
                val user = User(
                    id = authUser.id,
                    email = authUser.email,
                    role = parseRole(authUser.role ?: selectedRole.wireName)
                )
                Result.success(com.autamedica.android.domain.repository.UserRegistrationResult(user, requiresEmailConfirmation))
            } else {
                Result.failure(Exception("Failed to register user"))
            }
        } catch (e: Exception) {
            val errorMsg = e.message ?: ""
            if (errorMsg.contains("User already registered", ignoreCase = true)) {
                SecureLog.error("Registration failed: email already registered", e)
                Result.failure(Exception("Este correo ya está registrado"))
            } else {
                SecureLog.error("Registration failed", e)
                Result.failure(e)
            }
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
            val role = authoritativeUiRole(authDataSource.fetchUserRole(authUser.id))
            securePrefs.putString(SecurePreferences.KEY_USER_ROLE, role)

            authUser.toDomainUser(role)
        } catch (e: Exception) {
            SecureLog.warn("Failed to get current user", e)
            null
        }
    }

    private fun com.autamedica.android.data.remote.AuthUser.toDomainUser(authoritativeRole: String): User {
        return User(
            id = id,
            email = email,
            role = parseRole(authoritativeRole),
            firstName = displayName ?: "",
            phone = phone,
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
