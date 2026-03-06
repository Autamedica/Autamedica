package com.autamedica.android.presentation.health

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.AnamnesisSection
import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.domain.repository.HealthRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AnamnesisFormUiState(
    val isLoading: Boolean = true,
    val summary: AnamnesisSummary? = null,
    val sections: List<AnamnesisSection> = emptyList(),
    val currentSectionIndex: Int = 0,
    val fieldValues: Map<String, String> = emptyMap(),
    val isSaving: Boolean = false,
    val isSubmitting: Boolean = false,
    val error: String? = null,
    val submitted: Boolean = false,
) {
    val currentSection: AnamnesisSection?
        get() = sections.getOrNull(currentSectionIndex)

    val isFirstSection: Boolean
        get() = currentSectionIndex == 0

    val isLastSection: Boolean
        get() = currentSectionIndex == sections.lastIndex

    val allSectionsCompleted: Boolean
        get() = sections.isNotEmpty() && sections.all { it.completed }
}

@HiltViewModel
class AnamnesisFormViewModel @Inject constructor(
    private val healthRepository: HealthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AnamnesisFormUiState())
    val uiState: StateFlow<AnamnesisFormUiState> = _uiState.asStateFlow()

    init {
        loadForm()
    }

    private fun loadForm() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            healthRepository.getOrCreateAnamnesis()
                .onSuccess { summary ->
                    healthRepository.getAnamnesisSections(summary.id)
                        .onSuccess { sections ->
                            val firstIncomplete = sections.indexOfFirst { !it.completed }
                                .takeIf { it >= 0 } ?: 0
                            val currentSection = sections.getOrNull(firstIncomplete)
                            _uiState.update {
                                it.copy(
                                    isLoading = false,
                                    summary = summary,
                                    sections = sections,
                                    currentSectionIndex = firstIncomplete,
                                    fieldValues = currentSection?.data ?: emptyMap(),
                                )
                            }
                        }
                        .onFailure { e ->
                            SecureLog.error("[Anamnesis] Failed loading sections", e)
                            _uiState.update {
                                it.copy(isLoading = false, error = "No se pudieron cargar las secciones")
                            }
                        }
                }
                .onFailure { e ->
                    SecureLog.error("[Anamnesis] Failed creating anamnesis", e)
                    _uiState.update {
                        it.copy(isLoading = false, error = "No se pudo iniciar la anamnesis")
                    }
                }
        }
    }

    fun updateField(key: String, value: String) {
        _uiState.update { state ->
            state.copy(fieldValues = state.fieldValues + (key to value))
        }
    }

    fun saveAndNext() {
        val state = _uiState.value
        val section = state.currentSection ?: return
        val summary = state.summary ?: return

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }

            healthRepository.saveSection(summary.id, section.section, state.fieldValues)
                .onSuccess {
                    healthRepository.completeSection(summary.id, section.section)
                        .onSuccess {
                            // Reload sections to get updated status
                            healthRepository.getAnamnesisSections(summary.id)
                                .onSuccess { updatedSections ->
                                    val nextIndex = if (state.isLastSection) {
                                        state.currentSectionIndex
                                    } else {
                                        state.currentSectionIndex + 1
                                    }
                                    val nextSection = updatedSections.getOrNull(nextIndex)
                                    _uiState.update {
                                        it.copy(
                                            isSaving = false,
                                            sections = updatedSections,
                                            currentSectionIndex = nextIndex,
                                            fieldValues = nextSection?.data ?: emptyMap(),
                                        )
                                    }
                                }
                        }
                        .onFailure { e ->
                            SecureLog.error("[Anamnesis] Failed completing section", e)
                            _uiState.update {
                                it.copy(isSaving = false, error = "No se pudo guardar la seccion")
                            }
                        }
                }
                .onFailure { e ->
                    SecureLog.error("[Anamnesis] Failed saving section", e)
                    _uiState.update {
                        it.copy(isSaving = false, error = "No se pudo guardar la seccion")
                    }
                }
        }
    }

    fun goToPrevious() {
        val state = _uiState.value
        if (state.isFirstSection) return

        val prevIndex = state.currentSectionIndex - 1
        val prevSection = state.sections.getOrNull(prevIndex)
        _uiState.update {
            it.copy(
                currentSectionIndex = prevIndex,
                fieldValues = prevSection?.data ?: emptyMap(),
                error = null,
            )
        }
    }

    fun goToSection(index: Int) {
        val section = _uiState.value.sections.getOrNull(index) ?: return
        _uiState.update {
            it.copy(
                currentSectionIndex = index,
                fieldValues = section.data,
                error = null,
            )
        }
    }

    fun submitAnamnesis() {
        val summary = _uiState.value.summary ?: return

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null) }

            healthRepository.submitAnamnesis(summary.id)
                .onSuccess {
                    _uiState.update { it.copy(isSubmitting = false, submitted = true) }
                }
                .onFailure { e ->
                    SecureLog.error("[Anamnesis] Failed submitting", e)
                    _uiState.update {
                        it.copy(isSubmitting = false, error = "No se pudo enviar la anamnesis")
                    }
                }
        }
    }
}
