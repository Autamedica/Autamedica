package com.autamedica.android.presentation.chat

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.MedicalMessage
import com.autamedica.android.domain.repository.ChatRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

@HiltViewModel
class ChatConversationViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val chatRepository: ChatRepository,
    private val securePreferences: SecurePreferences,
) : ViewModel() {

    val chatId: String = savedStateHandle.get<String>("chatId") ?: ""

    private val _messages = MutableStateFlow<List<MedicalMessage>>(emptyList())
    val messages: StateFlow<List<MedicalMessage>> = _messages.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _isSending = MutableStateFlow(false)
    val isSending: StateFlow<Boolean> = _isSending.asStateFlow()

    val currentUserId: String
        get() = securePreferences.getString(SecurePreferences.KEY_USER_ID) ?: ""

    init {
        if (chatId.isNotEmpty()) {
            observeMessages()
            markAsRead()
        }
    }

    private fun observeMessages() {
        viewModelScope.launch {
            chatRepository.observeMessages(chatId)
                .catch { e ->
                    Timber.e(e, "[ChatConversation] Error observing messages")
                    _isLoading.value = false
                }
                .collect { messageList ->
                    _messages.value = messageList
                    _isLoading.value = false
                }
        }
    }

    fun sendMessage(content: String) {
        if (content.isBlank() || _isSending.value) return

        viewModelScope.launch {
            _isSending.value = true
            chatRepository.sendMessage(chatId, content.trim())
                .onFailure { Timber.e(it, "[ChatConversation] Failed to send") }
            _isSending.value = false
        }
    }

    fun markAsRead() {
        viewModelScope.launch {
            chatRepository.markAsRead(chatId)
        }
    }
}
