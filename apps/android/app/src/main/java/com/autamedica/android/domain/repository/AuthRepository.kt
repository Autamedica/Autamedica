package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import kotlinx.coroutines.flow.Flow

data class UserRegistrationResult(val user: User?, val requiresEmailConfirmation: Boolean)

interface AuthRepository {
    fun observeSession(): Flow<User?>
    suspend fun login(email: String, password: String, selectedRole: UserRole? = null): Result<User>
    suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole? = null): Result<User>
    suspend fun register(email: String, password: String, selectedRole: UserRole): Result<UserRegistrationResult>
    suspend fun logout()
    suspend fun getCurrentUser(): User?
}
