package com.autamedica.android.presentation.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.ChatRepository
import com.autamedica.android.domain.repository.NotificationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class MainUiState(
    val isLoggedOut: Boolean = false,
    val userRole: UserRole = UserRole.PATIENT,
)

@HiltViewModel
class MainViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val chatRepository: ChatRepository,
    private val notificationRepository: NotificationRepository,
    private val appointmentRepository: AppointmentRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    init {
        observeSession()
    }

    private fun observeSession() {
        viewModelScope.launch {
            authRepository.observeSession().collect { user ->
                if (user != null) {
                    _uiState.update { it.copy(isLoggedOut = false, userRole = user.role) }
                } else {
                    Timber.d("[Auth] No session — navigating to login")
                    _uiState.update { it.copy(isLoggedOut = true) }
                }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            chatRepository.cleanup()
            notificationRepository.clearFcmToken()
            appointmentRepository.clearCachedAppointmentsForCurrentUser()
            authRepository.logout()
        }
    }
}
