package com.autamedica.android.domain.model

data class PatientClinicalContext(
    val hasAnamnesis: Boolean = false,
    val chiefComplaint: String? = null,
    val allergies: List<String> = emptyList(),
    val medications: String? = null,
    val chronicDiseases: List<String> = emptyList(),
)
