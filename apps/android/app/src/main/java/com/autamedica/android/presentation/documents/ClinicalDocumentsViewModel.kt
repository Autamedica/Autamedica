package com.autamedica.android.presentation.documents

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.ClinicalDocument
import com.autamedica.android.domain.repository.ClinicalDocumentRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.InputStream
import com.autamedica.android.presentation.common.UiErrorMapper
import javax.inject.Inject

data class ClinicalDocumentsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val isUploading: Boolean = false,
    val uploadProgress: Float = 0f,
    val uploadSuccessMessage: String? = null,
    val documents: List<ClinicalDocument> = emptyList(),
    val error: String? = null,
)

@HiltViewModel
class ClinicalDocumentsViewModel @Inject constructor(
    private val documentRepository: ClinicalDocumentRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ClinicalDocumentsUiState())
    val uiState: StateFlow<ClinicalDocumentsUiState> = _uiState.asStateFlow()

    init {
        loadDocuments()
    }

    fun loadDocuments() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            fetchInternal()
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, error = null) }
            fetchInternal()
        }
    }

    private suspend fun fetchInternal() {
        documentRepository.getDocuments()
            .onSuccess { list ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        documents = list,
                        error = null,
                    )
                }
            }
            .onFailure { err ->
                SecureLog.error("[ClinicalDocsVM] Failed fetching documents", err)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = UiErrorMapper.map(err, "No se pudieron cargar los documentos."),
                    )
                }
            }
    }

    fun uploadDocument(
        title: String,
        type: String,
        fileName: String,
        mimeType: String,
        inputStream: InputStream,
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isUploading = true, error = null) }
            documentRepository.uploadDocument(
                title = title,
                type = type,
                fileName = fileName,
                mimeType = mimeType,
                inputStream = inputStream,
            ).onSuccess { created ->
                _uiState.update {
                    it.copy(
                        isUploading = false,
                        uploadSuccessMessage = "Estudio subido correctamente al historial médico.",
                        documents = listOf(created) + it.documents,
                        error = null,
                    )
                }
            }.onFailure { err ->
                SecureLog.error("[ClinicalDocsVM] Upload failed", err)
                _uiState.update {
                    it.copy(
                        isUploading = false,
                        error = UiErrorMapper.map(err, "Error al subir el estudio."),
                    )
                }
            }
        }
    }

    fun dismissSuccessMessage() {
        _uiState.update { it.copy(uploadSuccessMessage = null) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
