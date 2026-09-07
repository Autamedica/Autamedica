package com.autamedica.android.presentation.patients.continuity

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class Medication(
    val name: String,
    val dose: String,
    val daysRemaining: Int?
)

data class ContinuityRequest(
    val id: String,
    val triageStatus: String,
    val medication: Medication?,
    val createdAt: String,
    val acknowledgedAt: String?,
    val resolvedAt: String?,
    val resolutionDeadline: String?
)

data class ContinuityStatusUiState(
    val isLoading: Boolean = true,
    val request: ContinuityRequest? = null,
    val status: String = "none",
    val error: String? = null
)

class ContinuityStatusViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(ContinuityStatusUiState())
    val uiState = _uiState.asStateFlow()

    init {
        fetchStatus()
    }

    private fun fetchStatus() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                // Simulate network delay
                delay(1000)
                // Mocked response for now
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        status = "active",
                        request = ContinuityRequest(
                            id = "123",
                            triageStatus = "acknowledged",
                            medication = Medication("Sertralina", "50mg", 5),
                            createdAt = "2026-09-01T10:00:00Z",
                            acknowledgedAt = "2026-09-02T10:00:00Z",
                            resolvedAt = null,
                            resolutionDeadline = "2026-09-05T10:00:00Z"
                        )
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}
