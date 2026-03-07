package com.autamedica.android.presentation.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.PatientProfileSnapshot
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
    val patientSnapshot: PatientProfileSnapshot? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
    val isSaving: Boolean = false,
    val saveSuccess: Boolean = false,
    val firstName: String = "",
    val lastName: String = "",
    val phone: String = "",
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
        _uiState.update { it.copy(firstName = value, saveSuccess = false, error = null) }
    }

    fun onLastNameChange(value: String) {
        _uiState.update { it.copy(lastName = value, saveSuccess = false, error = null) }
    }

    fun onPhoneChange(value: String) {
        _uiState.update { it.copy(phone = value, saveSuccess = false, error = null) }
    }

    fun saveProfile() {
        val state = _uiState.value
        if (state.firstName.isBlank()) return

        _uiState.update { it.copy(isSaving = true, error = null) }

        viewModelScope.launch {
            profileRepository.updateProfile(
                firstName = state.firstName.trim(),
                lastName = state.lastName.trim(),
                phone = state.phone.trim().ifBlank { null },
            ).fold(
                onSuccess = { user ->
                    _uiState.update {
                        it.copy(
                            user = user,
                            phone = user.phone.orEmpty(),
                            isSaving = false,
                            saveSuccess = true,
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            isSaving = false,
                            error = error.message ?: "Error al guardar",
                        )
                    }
                },
            )
        }
    }

    private fun loadProfile() {
        viewModelScope.launch {
            profileRepository.getProfile().fold(
                onSuccess = { user ->
                    val patientSnapshot = if (user.role == UserRole.PATIENT) {
                        profileRepository.getPatientProfileSnapshot().getOrNull()
                    } else {
                        null
                    }

                    _uiState.update {
                        it.copy(
                            user = user,
                            patientSnapshot = patientSnapshot,
                            firstName = user.firstName,
                            lastName = user.lastName,
                            phone = user.phone.orEmpty(),
                            isLoading = false,
                            error = null,
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = error.message ?: "Error cargando perfil",
                        )
                    }
                },
            )
        }
    }
}
