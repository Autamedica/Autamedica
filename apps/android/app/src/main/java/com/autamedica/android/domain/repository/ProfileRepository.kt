package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.User

interface ProfileRepository {
    suspend fun getProfile(): Result<User>
    suspend fun updateProfile(firstName: String, lastName: String, phone: String?): Result<User>
}
