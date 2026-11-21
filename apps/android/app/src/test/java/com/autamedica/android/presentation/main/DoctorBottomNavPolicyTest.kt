package com.autamedica.android.presentation.main

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DoctorBottomNavPolicyTest {
    @Test fun fourTabDoctorLayoutMatchesPatientSymmetry() {
        assertThat(DoctorBottomNavPolicy.TAB_HOME).isEqualTo(0)
        assertThat(DoctorBottomNavPolicy.TAB_PRESCRIPTIONS).isEqualTo(1)
        assertThat(DoctorBottomNavPolicy.TAB_PATIENTS).isEqualTo(2)
        assertThat(DoctorBottomNavPolicy.TAB_PROFILE).isEqualTo(3)
        assertThat(DoctorBottomNavPolicy.TAB_COUNT).isEqualTo(4)
    }

    @Test fun backFromAnySecondaryDoctorTabReturnsToHome() {
        assertThat(DoctorBottomNavPolicy.backTargetTab(DoctorBottomNavPolicy.TAB_HOME)).isNull()
        assertThat(DoctorBottomNavPolicy.backTargetTab(DoctorBottomNavPolicy.TAB_PRESCRIPTIONS))
            .isEqualTo(DoctorBottomNavPolicy.TAB_HOME)
        assertThat(DoctorBottomNavPolicy.backTargetTab(DoctorBottomNavPolicy.TAB_PATIENTS))
            .isEqualTo(DoctorBottomNavPolicy.TAB_HOME)
        assertThat(DoctorBottomNavPolicy.backTargetTab(DoctorBottomNavPolicy.TAB_PROFILE))
            .isEqualTo(DoctorBottomNavPolicy.TAB_HOME)
    }

    @Test fun clampTabPreventsOutOfBoundsIndex() {
        assertThat(DoctorBottomNavPolicy.clampTab(-1)).isEqualTo(DoctorBottomNavPolicy.TAB_HOME)
        assertThat(DoctorBottomNavPolicy.clampTab(4)).isEqualTo(DoctorBottomNavPolicy.TAB_PROFILE)
    }
}
