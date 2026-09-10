package com.autamedica.android.domain.model

data class DoctorAvailabilitySlot(
    val id: String? = null,
    val dayOfWeek: Int, // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    val startTime: String, // "09:00"
    val endTime: String, // "17:00"
    val slotDuration: Int = 30,
    val location: String? = null,
    val isActive: Boolean = true,
)
