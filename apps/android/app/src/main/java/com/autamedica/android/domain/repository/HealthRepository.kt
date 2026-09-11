package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.AnamnesisSection
import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.domain.model.PatientPreventiveProfile

interface HealthRepository {
    suspend fun getAnamnesisSummary(): Result<AnamnesisSummary?>
    suspend fun getPreventiveProfile(): Result<PatientPreventiveProfile>
    suspend fun getOrCreateAnamnesis(): Result<AnamnesisSummary>
    suspend fun getAnamnesisSections(anamnesisId: String): Result<List<AnamnesisSection>>
    suspend fun saveSection(anamnesisId: String, section: String, data: Map<String, String>): Result<Unit>
    suspend fun completeSection(anamnesisId: String, section: String): Result<Unit>
    suspend fun submitAnamnesis(anamnesisId: String): Result<Unit>
    suspend fun getAnamnesisPreload(): Result<Map<String, String>> = Result.success(emptyMap())
}
