package com.autamedica.android.presentation.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.MedicalChat
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
class ChatListViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
) : ViewModel() {

    private val _chats = MutableStateFlow<List<MedicalChat>>(emptyList())
    val chats: StateFlow<List<MedicalChat>> = _chats.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    init {
        observeChats()
    }

    private fun observeChats() {
        viewModelScope.launch {
            chatRepository.observeChats()
                .catch { e ->
                    Timber.e(e, "[ChatList] Error observing chats")
                    _isLoading.value = false
                }
                .collect { chatList ->
                    _chats.value = chatList
                    _isLoading.value = false
                }
        }
    }
}
