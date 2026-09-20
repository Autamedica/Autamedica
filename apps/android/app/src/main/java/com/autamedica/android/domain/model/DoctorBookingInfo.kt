package com.autamedica.android.domain.model

data class DoctorBookingInfo(
    val id: String,
    val userId: String,
    val name: String,
    val specialty: String,
    val licenseNumber: String,
    val consultationFee: Double? = null,
    val avatarUrl: String? = null,
    val subspecialty: String? = null,
    val availableSlots: List<String> = emptyList(),
    val availableDays: Set<Int> = emptySet(),
)
