package com.autamedica.android.presentation.patients.community

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class CommunityPost(
    val id: String,
    val title: String,
    val content: String,
    val author: String,
    val likeCount: Int
)

data class CommunityGroup(
    val id: String,
    val name: String,
    val memberCount: Int
)

data class PatientCommunityState(
    val posts: List<CommunityPost> = emptyList(),
    val groups: List<CommunityGroup> = emptyList(),
    val showComposer: Boolean = false,
    val selectedGroupId: String? = null
)

class PatientCommunityViewModel : ViewModel() {
    private val _state = MutableStateFlow(PatientCommunityState())
    val state: StateFlow<PatientCommunityState> = _state.asStateFlow()

    init {
        // Mock data
        _state.value = _state.value.copy(
            groups = listOf(
                CommunityGroup("1", "Salud Reproductiva", 120),
                CommunityGroup("2", "Nutrición", 85),
                CommunityGroup("3", "Salud Mental", 200)
            ),
            posts = listOf(
                CommunityPost("1", "Mi experiencia", "Quería compartir cómo me fue en la última consulta...", "Anónimo", 15),
                CommunityPost("2", "Dudas sobre medicamentos", "¿Alguien sabe si el nuevo medicamento da sueño?", "María", 8)
            )
        )
    }

    fun setShowComposer(show: Boolean) {
        _state.value = _state.value.copy(showComposer = show)
    }

    fun selectGroup(groupId: String?) {
        _state.value = _state.value.copy(selectedGroupId = groupId)
    }

    fun addPost(title: String, content: String) {
        val newPost = CommunityPost(
            id = System.currentTimeMillis().toString(),
            title = title,
            content = content,
            author = "Usuario",
            likeCount = 0
        )
        val updatedPosts = listOf(newPost) + _state.value.posts
        _state.value = _state.value.copy(
            posts = updatedPosts,
            showComposer = false
        )
    }
}
