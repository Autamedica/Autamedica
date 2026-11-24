package com.autamedica.android.presentation.patients.community

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import com.autamedica.android.R
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class CommunityPost(
    val id: String,
    val title: String,
    val content: String,
    val author: String,
    val likeCount: Int,
    @StringRes val titleRes: Int? = null,
    @StringRes val contentRes: Int? = null,
    @StringRes val authorRes: Int? = null,
)

data class CommunityGroup(
    val id: String,
    val name: String,
    val memberCount: Int,
    @StringRes val nameRes: Int? = null,
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
        // Mock data localized via string resources
        _state.value = _state.value.copy(
            groups = listOf(
                CommunityGroup("1", "Salud Reproductiva", 120, R.string.community_group_reproductive),
                CommunityGroup("2", "Nutrición", 85, R.string.community_group_nutrition),
                CommunityGroup("3", "Salud Mental", 200, R.string.community_group_mental_health),
            ),
            posts = listOf(
                CommunityPost(
                    id = "1",
                    title = "Mi experiencia",
                    content = "Quería compartir cómo me fue en la última consulta...",
                    author = "Anónimo",
                    likeCount = 15,
                    titleRes = R.string.community_post_1_title,
                    contentRes = R.string.community_post_1_content,
                    authorRes = R.string.community_post_1_author,
                ),
                CommunityPost(
                    id = "2",
                    title = "Dudas sobre medicamentos",
                    content = "¿Alguien sabe si el nuevo medicamento da sueño?",
                    author = "María",
                    likeCount = 8,
                    titleRes = R.string.community_post_2_title,
                    contentRes = R.string.community_post_2_content,
                    authorRes = R.string.community_post_2_author,
                ),
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
            likeCount = 0,
            authorRes = R.string.community_author_user,
        )
        val updatedPosts = listOf(newPost) + _state.value.posts
        _state.value = _state.value.copy(
            posts = updatedPosts,
            showComposer = false
        )
    }
}
