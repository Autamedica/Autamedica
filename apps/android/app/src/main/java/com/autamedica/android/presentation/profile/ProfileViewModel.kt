package com.autamedica.android.presentation.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.ProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileUiState(
    val user: User? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
    val isSaving: Boolean = false,
    val saveSuccess: Boolean = false,
    val firstName: String = "",
    val lastName: String = "",
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val profileRepository: ProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        loadProfile()
    }

    fun onFirstNameChange(value: String) {
        _uiState.update { it.copy(firstName = value, saveSuccess = false) }
    }

    fun onLastNameChange(value: String) {
        _uiState.update { it.copy(lastName = value, saveSuccess = false) }
    }

    fun saveProfile() {
        val state = _uiState.value
        if (state.firstName.isBlank()) return

        _uiState.update { it.copy(isSaving = true, error = null) }

        viewModelScope.launch {
            profileRepository.updateProfile(
                firstName = state.firstName.trim(),
                lastName = state.lastName.trim(),
                phone = null,
            )
                .onSuccess { user ->
                    _uiState.update {
                        it.copy(
                            user = user,
                            isSaving = false,
                            saveSuccess = true,
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isSaving = false,
                            error = error.message ?: "Error al guardar",
                        )
                    }
                }
        }
    }

    private fun loadProfile() {
        viewModelScope.launch {
            profileRepository.getProfile()
                .onSuccess { user ->
                    _uiState.update {
                        it.copy(
                            user = user,
                            firstName = user.firstName,
                            lastName = user.lastName,
                            isLoading = false,
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = error.message ?: "Error cargando perfil",
                        )
                    }
                }
        }
    }
}
