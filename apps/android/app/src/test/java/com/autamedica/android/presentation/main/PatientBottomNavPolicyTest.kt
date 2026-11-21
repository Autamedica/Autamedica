package com.autamedica.android.presentation.main

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PatientBottomNavPolicyTest {
    @Test fun fourTabLayoutHasStableIndices() {
        assertThat(PatientBottomNavPolicy.TAB_HOME).isEqualTo(0)
        assertThat(PatientBottomNavPolicy.TAB_CONSULT).isEqualTo(1)
        assertThat(PatientBottomNavPolicy.TAB_PRESCRIPTIONS).isEqualTo(2)
        assertThat(PatientBottomNavPolicy.TAB_PROFILE).isEqualTo(3)
        assertThat(PatientBottomNavPolicy.TAB_COUNT).isEqualTo(4)
    }

    @Test fun hardwareBackReturnsToHomeFromAnySecondaryTab() {
        assertThat(PatientBottomNavPolicy.backTargetTab(PatientBottomNavPolicy.TAB_HOME)).isNull()
        assertThat(PatientBottomNavPolicy.backTargetTab(PatientBottomNavPolicy.TAB_CONSULT))
            .isEqualTo(PatientBottomNavPolicy.TAB_HOME)
        assertThat(PatientBottomNavPolicy.backTargetTab(PatientBottomNavPolicy.TAB_PRESCRIPTIONS))
            .isEqualTo(PatientBottomNavPolicy.TAB_HOME)
        assertThat(PatientBottomNavPolicy.backTargetTab(PatientBottomNavPolicy.TAB_PROFILE))
            .isEqualTo(PatientBottomNavPolicy.TAB_HOME)
    }

    @Test fun clampTabPreventsOutOfBoundsRestoredState() {
        assertThat(PatientBottomNavPolicy.clampTab(-1)).isEqualTo(PatientBottomNavPolicy.TAB_HOME)
        assertThat(PatientBottomNavPolicy.clampTab(4)).isEqualTo(PatientBottomNavPolicy.TAB_PROFILE)
        assertThat(PatientBottomNavPolicy.clampTab(2)).isEqualTo(PatientBottomNavPolicy.TAB_PRESCRIPTIONS)
    }
}
