package com.autamedica.android.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class UserRole {
    @SerialName("patient") PATIENT,
    @SerialName("doctor") DOCTOR,
    @SerialName("pharmacist") PHARMACIST,
    @SerialName("company") COMPANY,
    @SerialName("company_admin") COMPANY_ADMIN,
    @SerialName("organization_admin") ORGANIZATION_ADMIN,
    @SerialName("admin") ADMIN,
    @SerialName("platform_admin") PLATFORM_ADMIN;

    val displayName: String
        get() = when (this) {
            PATIENT -> "Paciente"
            DOCTOR -> "Medico"
            PHARMACIST -> "Farmacia"
            COMPANY -> "Empresa"
            COMPANY_ADMIN -> "Admin Empresa"
            ORGANIZATION_ADMIN -> "Admin Organizacion"
            ADMIN -> "Administrador"
            PLATFORM_ADMIN -> "Admin Plataforma"
        }

    val wireName: String
        get() = when (this) {
            PATIENT -> "patient"
            DOCTOR -> "doctor"
            PHARMACIST -> "pharmacist"
            COMPANY -> "company"
            COMPANY_ADMIN -> "company_admin"
            ORGANIZATION_ADMIN -> "organization_admin"
            ADMIN -> "admin"
            PLATFORM_ADMIN -> "platform_admin"
        }
}
