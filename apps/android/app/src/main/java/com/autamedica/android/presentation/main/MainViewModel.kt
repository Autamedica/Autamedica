package com.autamedica.android.presentation.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

@HiltViewModel
class MainViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val securePreferences: SecurePreferences,
) : ViewModel() {

    private val _isLoggedOut = MutableStateFlow(false)
    val isLoggedOut: StateFlow<Boolean> = _isLoggedOut.asStateFlow()

    private val _userRole = MutableStateFlow("")
    val userRole: StateFlow<String> = _userRole.asStateFlow()

    init {
        loadRole()
        observeSession()
    }

    private fun loadRole() {
        _userRole.value = securePreferences.getString(SecurePreferences.KEY_USER_ROLE) ?: ""
    }

    private fun observeSession() {
        viewModelScope.launch {
            authRepository.observeSession().collect { user ->
                if (user != null) {
                    _userRole.value = securePreferences.getString(SecurePreferences.KEY_USER_ROLE) ?: ""
                } else {
                    Timber.d("[Auth] No session — navigating to login")
                    _isLoggedOut.value = true
                }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
        }
    }
}
