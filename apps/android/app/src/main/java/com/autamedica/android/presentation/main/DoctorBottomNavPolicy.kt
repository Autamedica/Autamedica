package com.autamedica.android.presentation.main

enum class DoctorDocumentSegment {
    PRESCRIPTIONS,
    CERTIFICATES,
    ORDERS,
}

object DoctorBottomNavPolicy {
    const val TAB_HOME = 0
    const val TAB_PRESCRIPTIONS = 1
    const val TAB_PATIENTS = 2
    const val TAB_PROFILE = 3
    const val TAB_COUNT = 4

    fun backTargetTab(currentTab: Int): Int? =
        if (currentTab == TAB_HOME) null else TAB_HOME

    fun clampTab(tab: Int): Int = tab.coerceIn(TAB_HOME, TAB_PROFILE)
}
