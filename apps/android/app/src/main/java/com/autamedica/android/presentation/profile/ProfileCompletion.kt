package com.autamedica.android.presentation.profile

import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.PatientProfileSnapshot
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole

internal fun calculateProfileCompletion(
    user: User?,
    firstName: String,
    lastName: String,
    phone: String,
    patientSnapshot: PatientProfileSnapshot?,
    doctorProfile: DoctorProfile? = null,
): Int {
    if (user == null) return 0
    val checks = mutableListOf(firstName.isNotBlank(), lastName.isNotBlank(), user.email.isNotBlank(), phone.isNotBlank())

    when (user.role) {
        UserRole.PATIENT -> checks += listOf(
            !patientSnapshot?.birthDate.isNullOrBlank(),
            !patientSnapshot?.gender.isNullOrBlank(),
            !patientSnapshot?.bloodType.isNullOrBlank(),
            !patientSnapshot?.emergencyContactPhone.isNullOrBlank(),
        )
        UserRole.DOCTOR -> {
            val doctor = doctorProfile
            val type = doctor?.licenseType.orEmpty()
            val identityComplete = !doctor?.licenseNumber.isNullOrBlank() && type.isNotBlank() &&
                (!type.equals("CRM", ignoreCase = true) || doctor?.ufBrazil?.matches(Regex("^[A-Za-z]{2}$")) == true)
            checks += listOf(
                identityComplete,
                !doctor?.specialty.isNullOrBlank(),
                doctor?.active == true && doctor.isLicenseValidated,
                doctor?.hasSignature == true,
                doctor?.hasStamp == true,
            )
        }
        else -> Unit
    }
    return (checks.count { it } * 100f / checks.size.toFloat()).toInt()
}
