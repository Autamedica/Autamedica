package com.autamedica.android.domain.model

data class PatientProfileSnapshot(
    val dni: String? = null,
    val birthDate: String? = null,
    val gender: String? = null,
    val bloodType: String? = null,
    val heightCm: Double? = null,
    val weightKg: Double? = null,
    val emergencyContactName: String? = null,
    val emergencyContactRelationship: String? = null,
    val emergencyContactPhone: String? = null,
    val emergencyContactEmail: String? = null,
    val careCountry: String? = null,
    val address: String? = null,
    /** Patient attestation of RENAPER-sourced data; NOT biometric verification. */
    val renaperConfirmedAt: String? = null,
)
