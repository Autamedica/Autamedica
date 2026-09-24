package com.autamedica.android.presentation.health

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.domain.repository.HealthRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import com.autamedica.android.presentation.common.UiErrorMapper
import javax.inject.Inject

data class HealthUiState(
    val isLoading: Boolean = true,
    val anamnesisSummary: AnamnesisSummary? = null,
    val error: String? = null,
)

@HiltViewModel
class HealthViewModel @Inject constructor(
    private val healthRepository: HealthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HealthUiState())
    val uiState: StateFlow<HealthUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            healthRepository.getAnamnesisSummary()
                .onSuccess { summary ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            anamnesisSummary = summary,
                            error = null,
                        )
                    }
                }
                .onFailure { error ->
                    SecureLog.error("[Health] Failed loading screen", error)
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = UiErrorMapper.map(error, "No se pudo cargar anamnesis"),
                        )
                    }
                }
        }
    }
}
