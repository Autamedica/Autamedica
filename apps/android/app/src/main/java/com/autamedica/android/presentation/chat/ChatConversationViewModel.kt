package com.autamedica.android.presentation.chat

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.MedicalMessage
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.ChatRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChatConversationUiState(
    val messages: List<MedicalMessage> = emptyList(),
    val isLoading: Boolean = true,
    val isSending: Boolean = false,
    val currentUserId: String = "",
)

@HiltViewModel
class ChatConversationViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val chatRepository: ChatRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    val chatId: String = savedStateHandle.get<String>("chatId") ?: ""

    private val _uiState = MutableStateFlow(ChatConversationUiState())
    val uiState: StateFlow<ChatConversationUiState> = _uiState.asStateFlow()

    init {
        loadCurrentUser()
        if (chatId.isNotEmpty()) {
            observeMessages()
            markAsRead()
        }
    }

    private fun loadCurrentUser() {
        viewModelScope.launch {
            val user = authRepository.getCurrentUser()
            _uiState.update { it.copy(currentUserId = user?.id.orEmpty()) }
        }
    }

    private fun observeMessages() {
        viewModelScope.launch {
            chatRepository.observeMessages(chatId)
                .catch { e ->
                    SecureLog.error("[ChatConversation] Error observing messages", e)
                    _uiState.update { it.copy(isLoading = false) }
                }
                .collect { messageList ->
                    _uiState.update { it.copy(messages = messageList, isLoading = false) }
                }
        }
    }

    fun sendMessage(content: String) {
        if (content.isBlank() || _uiState.value.isSending) return

        viewModelScope.launch {
            _uiState.update { it.copy(isSending = true) }
            chatRepository.sendMessage(chatId, content.trim())
                .onFailure { SecureLog.error("[ChatConversation] Failed to send", it) }
            _uiState.update { it.copy(isSending = false) }
        }
    }

    fun markAsRead() {
        viewModelScope.launch {
            chatRepository.markAsRead(chatId)
        }
    }
}
