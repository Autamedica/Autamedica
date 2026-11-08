package com.autamedica.android.presentation.main

/**
 * UI routing guard only. Server authorization and RLS remain authoritative.
 * Patient-bearing doctor tabs cannot mount until eligibility was confirmed.
 */
internal fun isDoctorTabAllowed(index: Int, approved: Boolean): Boolean =
    index in 0..4 && (approved || index == 0 || index == 4)
