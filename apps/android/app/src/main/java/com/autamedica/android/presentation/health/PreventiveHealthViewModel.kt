package com.autamedica.android.presentation.health

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.PatientPreventiveProfile
import com.autamedica.android.domain.repository.HealthRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PreventiveHealthUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val profile: PatientPreventiveProfile? = null,
    val connectedAge: Int? = null,
    val connectedGender: PreventiveGender? = null,
) {
    val isProfileReady: Boolean
        get() = connectedAge != null && connectedGender != null
}

@HiltViewModel
class PreventiveHealthViewModel @Inject constructor(
    private val healthRepository: HealthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PreventiveHealthUiState())
    val uiState: StateFlow<PreventiveHealthUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            healthRepository.getPreventiveProfile()
                .onSuccess { profile ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = null,
                            profile = profile,
                            connectedAge = profile.age,
                            connectedGender = normalizePreventiveGender(profile.gender),
                        )
                    }
                }
                .onFailure { error ->
                    SecureLog.error("[PreventiveHealth] Failed loading connected profile", error)
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = error.message ?: "No se pudo cargar el perfil preventivo",
                        )
                    }
                }
        }
    }
}
