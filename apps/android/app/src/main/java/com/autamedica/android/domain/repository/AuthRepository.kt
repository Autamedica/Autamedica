package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.User
import kotlinx.coroutines.flow.Flow

interface AuthRepository {
    fun observeSession(): Flow<User?>
    suspend fun login(email: String, password: String, selectedRole: com.autamedica.android.domain.model.UserRole? = null): Result<User>
    suspend fun loginWithGoogle(idToken: String, selectedRole: com.autamedica.android.domain.model.UserRole? = null): Result<User>
    suspend fun logout()
    suspend fun getCurrentUser(): User?
}
