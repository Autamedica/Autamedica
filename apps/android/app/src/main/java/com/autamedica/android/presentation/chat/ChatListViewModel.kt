package com.autamedica.android.presentation.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.MedicalChat
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

data class ChatListUiState(
    val chats: List<MedicalChat> = emptyList(),
    val isLoading: Boolean = true,
)

@HiltViewModel
class ChatListViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatListUiState())
    val uiState: StateFlow<ChatListUiState> = _uiState.asStateFlow()

    init {
        observeChats()
    }

    private fun observeChats() {
        viewModelScope.launch {
            chatRepository.observeChats()
                .catch { e ->
                    SecureLog.error("[ChatList] Error observing chats", e)
                    _uiState.update { it.copy(isLoading = false) }
                }
                .collect { chatList ->
                    _uiState.update { it.copy(chats = chatList, isLoading = false) }
                }
        }
    }
}
