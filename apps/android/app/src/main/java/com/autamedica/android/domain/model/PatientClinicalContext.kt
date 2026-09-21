package com.autamedica.android.domain.model

data class PatientClinicalContext(
    val hasAnamnesis: Boolean = false,
    val chiefComplaint: String? = null,
    val allergies: List<String> = emptyList(),
    val medications: String? = null,
    val chronicDiseases: List<String> = emptyList(),
    val ageYears: Int? = null,
    val gender: String? = null,
    val presentIllness: String? = null,
    val physiologicalHistory: List<String> = emptyList(),
    val pathologicalHistory: List<String> = emptyList(),
    val familyHistory: List<String> = emptyList(),
    val anamnesisCompletion: Int? = null,
)