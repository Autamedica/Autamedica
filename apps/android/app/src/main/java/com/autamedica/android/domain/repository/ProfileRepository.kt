package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.PatientProfileSnapshot
import com.autamedica.android.domain.model.User

interface ProfileRepository {
    suspend fun getProfile(): Result<User>
    suspend fun getPatientProfileSnapshot(): Result<PatientProfileSnapshot?>
    suspend fun updateProfile(firstName: String, lastName: String, phone: String?): Result<User>
    /** Only mutable official-profile field after AR identity confirmation. */
    suspend fun updatePatientAddress(address: String): Result<PatientProfileSnapshot?>
}
