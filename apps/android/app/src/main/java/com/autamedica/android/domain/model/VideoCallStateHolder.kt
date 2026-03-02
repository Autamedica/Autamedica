package com.autamedica.android.domain.model

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Thread-safe singleton that tracks whether a video call is active.
 * Replaces the unsafe companion object static in MainActivity.
 * Observed by MainActivity for PiP mode, and updated by VideoCallViewModel.
 */
@Singleton
class VideoCallStateHolder @Inject constructor() {

    private val _isInVideoCall = MutableStateFlow(false)
    val isInVideoCall: StateFlow<Boolean> = _isInVideoCall.asStateFlow()

    fun setInVideoCall(active: Boolean) {
        _isInVideoCall.value = active
    }
}
