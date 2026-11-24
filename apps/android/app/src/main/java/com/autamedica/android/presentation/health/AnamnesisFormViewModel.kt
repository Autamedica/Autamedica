package com.autamedica.android.presentation.health

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.presentation.common.UiErrorMapper
import com.autamedica.android.domain.model.AnamnesisSection
import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.domain.repository.HealthRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class AnamnesisDisplayMode {
    WIZARD,
    OVERVIEW,
}

data class AnamnesisFormUiState(
    val isLoading: Boolean = true,
    val summary: AnamnesisSummary? = null,
    val sections: List<AnamnesisSection> = emptyList(),
    val currentSectionIndex: Int = 0,
    val fieldValues: Map<String, String> = emptyMap(),
    val fieldErrors: Map<String, String> = emptyMap(),
    val isSaving: Boolean = false,
    val isSubmitting: Boolean = false,
    val error: String? = null,
    val saveSuccessMessage: String? = null,
    val submitted: Boolean = false,
    val displayMode: AnamnesisDisplayMode = AnamnesisDisplayMode.WIZARD,
) {
    val currentSection: AnamnesisSection?
        get() = sections.getOrNull(currentSectionIndex)

    val isFirstSection: Boolean
        get() = currentSectionIndex == 0

    val isLastSection: Boolean
        get() = currentSectionIndex == sections.lastIndex

    val allSectionsCompleted: Boolean
        get() = sections.isNotEmpty() && sections.all { it.completed }

    val completedSectionsCount: Int
        get() = sections.count { it.completed }

    val completionPercentage: Int
        get() {
            val total = sections.size.coerceAtLeast(1)
            return ((completedSectionsCount.toFloat() / total) * 100).toInt()
        }

    val hasUnsavedChanges: Boolean
        get() = currentSection?.data.orEmpty() != fieldValues

    val isReadOnly: Boolean
        get() = isAnamnesisReadOnly(summary)

    val readOnlyMessage: String?
        get() = anamnesisReadOnlyMessage(summary, isPortugueseRuntime())
}

@HiltViewModel
class AnamnesisFormViewModel @Inject constructor(
    private val healthRepository: HealthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AnamnesisFormUiState())
    val uiState: StateFlow<AnamnesisFormUiState> = _uiState.asStateFlow()

    private var autoSaveJob: Job? = null

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
                            val preload = healthRepository.getAnamnesisPreload().getOrDefault(emptyMap())

                            val selectedIndex = sections.indexOfFirst { !it.completed }
                                .takeIf { it >= 0 }
                                ?: sections.lastIndex.coerceAtLeast(0)
                            val currentSection = sections.getOrNull(selectedIndex)

                            // Initial field values with auto-preload for edad/filiación if empty
                            val initialFields = (currentSection?.data ?: emptyMap()).toMutableMap()
                            if (currentSection?.section == "edad" && initialFields.isEmpty()) {
                                val birthDate = (preload["birthDate"] ?: preload["fecha_nacimiento"])?.takeIf { it.isNotBlank() }
                                val age = (preload["age"] ?: preload["edad"])?.takeIf { it.isNotBlank() }
                                val gender = (preload["gender"] ?: preload["genero"])?.takeIf { it.isNotBlank() }
                                val phone = (preload["phone"] ?: preload["telefono"])?.takeIf { it.isNotBlank() }

                                birthDate?.let { initialFields["fecha_nacimiento"] = it }
                                age?.let { initialFields["edad"] = it }
                                gender?.let { initialFields["genero"] = it }
                                phone?.let { initialFields["telefono"] = it }
                            }

                            _uiState.update {
                                it.copy(
                                    isLoading = false,
                                    summary = summary,
                                    sections = sections,
                                    currentSectionIndex = selectedIndex,
                                    fieldValues = initialFields,
                                    fieldErrors = emptyMap(),
                                )
                            }
                        }
                        .onFailure { e ->
                            SecureLog.error("[Anamnesis] Failed loading sections", e)
                            _uiState.update {
                                it.copy(
                                    isLoading = false,
                                    error = localizedCopy(
                                        es = "No se pudieron cargar las secciones",
                                        pt = "Não foi possível carregar as seções",
                                        isPortuguese = isPortugueseRuntime(),
                                    ),
                                )
                            }
                        }
                }
                .onFailure { e ->
                    SecureLog.error("[Anamnesis] Failed creating anamnesis", e)
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = localizedCopy(
                                es = "No se pudo iniciar la anamnesis",
                                pt = "Não foi possível iniciar a anamnese",
                                isPortuguese = isPortugueseRuntime(),
                            ),
                        )
                    }
                }
        }
    }

    fun updateField(key: String, value: String) {
        if (_uiState.value.isReadOnly) return
        _uiState.update { state ->
            state.copy(
                fieldValues = state.fieldValues + (key to value),
                fieldErrors = state.fieldErrors - key,
                error = null,
                saveSuccessMessage = null,
            )
        }
        triggerDebouncedAutoSave()
    }

    private fun triggerDebouncedAutoSave() {
        autoSaveJob?.cancel()
        autoSaveJob = viewModelScope.launch {
            delay(1000) // 1s debounce
            val state = _uiState.value
            val currentSection = state.currentSection ?: return@launch
            val summary = state.summary ?: return@launch
            if (state.isReadOnly || state.isSaving) return@launch
            healthRepository.saveSection(summary.id, currentSection.section, state.fieldValues)
        }
    }

    fun dismissSaveSuccess() {
        _uiState.update { it.copy(saveSuccessMessage = null) }
    }

    fun switchMode(mode: AnamnesisDisplayMode) {
        _uiState.update { it.copy(displayMode = mode, error = null) }
    }

    fun saveAndNext() {
        val state = _uiState.value
        val section = state.currentSection ?: return
        val summary = state.summary ?: return
        val pt = isPortugueseRuntime()
        if (state.isReadOnly) {
            _uiState.update {
                it.copy(
                    error = state.readOnlyMessage ?: localizedCopy(
                        es = "La anamnesis se encuentra en solo lectura",
                        pt = "A anamnese está em modo somente leitura",
                        isPortuguese = pt,
                    ),
                    fieldErrors = emptyMap(),
                )
            }
            return
        }

        val validation = validateSection(section.section, state.fieldValues, isPortuguese = pt)
        if (!validation.isValid) {
            _uiState.update {
                it.copy(
                    error = validation.message,
                    fieldErrors = validation.fieldErrors,
                )
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null, fieldErrors = emptyMap(), saveSuccessMessage = null) }

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
                                    val sectionDisplayName = AnamnesisSection.displayName(section.section, isPortuguese = pt)
                                    _uiState.update {
                                        it.copy(
                                            isSaving = false,
                                            sections = updatedSections,
                                            currentSectionIndex = nextIndex,
                                            fieldValues = nextSection?.data ?: emptyMap(),
                                            fieldErrors = emptyMap(),
                                            saveSuccessMessage = localizedCopy(
                                                es = "Sección $sectionDisplayName guardada correctamente.",
                                                pt = "Seção $sectionDisplayName salva com sucesso.",
                                                isPortuguese = pt,
                                            ),
                                        )
                                    }
                                }
                                .onFailure { e ->
                                    SecureLog.error("[Anamnesis] Failed reloading sections", e)
                                    _uiState.update {
                                        it.copy(
                                            isSaving = false,
                                            error = localizedCopy(
                                                es = "La seccion se guardo, pero no se pudo refrescar el formulario",
                                                pt = "A seção foi salva, mas não foi possível atualizar o formulário",
                                                isPortuguese = pt,
                                            ),
                                        )
                                    }
                                }
                        }
                        .onFailure { e ->
                            SecureLog.error("[Anamnesis] Failed completing section", e)
                            _uiState.update {
                                it.copy(
                                    isSaving = false,
                                    error = UiErrorMapper.map(
                                        e,
                                        localizedCopy(
                                            es = "No se pudo guardar la seccion",
                                            pt = "Não foi possível salvar a seção",
                                            isPortuguese = pt,
                                        ),
                                    ),
                                )
                            }
                        }
                }
                .onFailure { e ->
                    SecureLog.error("[Anamnesis] Failed saving section", e)
                    _uiState.update {
                        it.copy(
                            isSaving = false,
                            error = UiErrorMapper.map(
                                e,
                                localizedCopy(
                                    es = "No se pudo guardar la seccion",
                                    pt = "Não foi possível salvar a seção",
                                    isPortuguese = pt,
                                ),
                            ),
                        )
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
                fieldErrors = emptyMap(),
                error = null,
                saveSuccessMessage = null,
            )
        }
    }

    fun goToSection(index: Int) {
        val state = _uiState.value
        val section = state.sections.getOrNull(index) ?: return
        val currentSection = state.currentSection
        val summary = state.summary

        // If there are unsaved changes, trigger silent background save before switching
        if (currentSection != null && summary != null && !state.isReadOnly && state.hasUnsavedChanges) {
            val pendingData = state.fieldValues
            viewModelScope.launch {
                healthRepository.saveSection(summary.id, currentSection.section, pendingData)
            }
        }

        _uiState.update {
            it.copy(
                currentSectionIndex = index,
                fieldValues = section.data,
                fieldErrors = emptyMap(),
                error = null,
                saveSuccessMessage = null,
            )
        }
    }

    fun submitAnamnesis() {
        val state = _uiState.value
        val summary = state.summary ?: return
        val pt = isPortugueseRuntime()
        if (state.isReadOnly) {
            _uiState.update {
                it.copy(
                    error = state.readOnlyMessage ?: localizedCopy(
                        es = "La anamnesis se encuentra en solo lectura",
                        pt = "A anamnese está em modo somente leitura",
                        isPortuguese = pt,
                    ),
                    fieldErrors = emptyMap(),
                )
            }
            return
        }
        if (state.hasUnsavedChanges) {
            _uiState.update {
                it.copy(
                    error = localizedCopy(
                        es = "Guarde la seccion actual antes de enviar la anamnesis.",
                        pt = "Salve a seção atual antes de enviar a anamnese.",
                        isPortuguese = pt,
                    ),
                    fieldErrors = emptyMap(),
                )
            }
            return
        }

        val invalidSection = state.sections.firstOrNull { section ->
            !section.completed || !validateSection(section.section, section.data, isPortuguese = pt).isValid
        }
        if (invalidSection != null) {
            val sectionName = AnamnesisSection.displayName(invalidSection.section, isPortuguese = pt)
            _uiState.update {
                it.copy(
                    error = localizedCopy(
                        es = "No puede enviar la anamnesis hasta completar $sectionName.",
                        pt = "Não é possível enviar a anamnese sem concluir $sectionName.",
                        isPortuguese = pt,
                    ),
                    fieldErrors = emptyMap(),
                )
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null) }

            healthRepository.submitAnamnesis(summary.id)
                .onSuccess {
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            submitted = true,
                            summary = it.summary?.copy(
                                status = "under_review",
                                locked = true,
                                completionPercentage = 100,
                            ),
                            fieldErrors = emptyMap(),
                        )
                    }
                }
                .onFailure { e ->
                    SecureLog.error("[Anamnesis] Failed submitting", e)
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            error = UiErrorMapper.map(
                                e,
                                localizedCopy(
                                    es = "No se pudo enviar la anamnesis",
                                    pt = "Não foi possível enviar a anamnese",
                                    isPortuguese = pt,
                                ),
                            ),
                        )
                    }
                }
        }
    }
}
