package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.User
import kotlinx.coroutines.flow.Flow

interface AuthRepository {
    fun observeSession(): Flow<User?>
    suspend fun login(email: String, password: String): Result<User>
    suspend fun loginWithGoogle(idToken: String): Result<User>
    suspend fun logout()
    suspend fun getCurrentUser(): User?
}
