package com.autamedica.android.presentation.profile

import com.autamedica.android.domain.model.DoctorProfile
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DoctorProfileCompletionTest {
    private val user = User("user-1", "doctor@example.com", UserRole.DOCTOR)
    private fun completion(doctor: DoctorProfile) = calculateProfileCompletion(
        user, "Ada", "Lovelace", "+541155555555", null, doctor,
    )

    @Test fun missingLicenseAndSpecialtyCannotShowComplete() {
        val doctor = DoctorProfile(
            id = "doctor-1", userId = "user-1", licenseNumber = "", specialty = "",
            licenseType = "MN", active = true, isLicenseValidated = true, hasSignature = true, hasStamp = true,
        )
        assertThat(completion(doctor)).isLessThan(100)
    }

    @Test fun doctorProfileReachesOneHundredOnlyWithProfessionalReadiness() {
        val doctor = DoctorProfile(
            id = "doctor-1", userId = "user-1", licenseNumber = "123456", specialty = "Cardiología",
            licenseType = "CRM", ufBrazil = "RS", active = true, isLicenseValidated = true,
            hasSignature = true, hasStamp = true,
        )
        assertThat(completion(doctor)).isEqualTo(100)
    }

    @Test fun missingAuthorizationOrSigningAssetsCannotShowComplete() {
        val doctor = DoctorProfile(
            id = "doctor-1", userId = "user-1", licenseNumber = "123456", specialty = "Clínica médica",
            licenseType = "MN", active = true, isLicenseValidated = false, hasSignature = true, hasStamp = false,
        )
        assertThat(completion(doctor)).isLessThan(100)
    }
}
