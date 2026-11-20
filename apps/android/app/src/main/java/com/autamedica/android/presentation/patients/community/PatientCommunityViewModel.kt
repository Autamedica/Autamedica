package com.autamedica.android.presentation.patients.community

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject

data class CommunityPost(
    val id: String,
    val groupId: String,
    val title: String,
    val content: String,
    val author: String,
    val likeCount: Int,
)

data class CommunityGroup(val id: String, val name: String, val memberCount: Int)

data class PatientCommunityState(
    val posts: List<CommunityPost> = emptyList(),
    val groups: List<CommunityGroup> = emptyList(),
    val showComposer: Boolean = false,
    val selectedGroupId: String? = null,
    val isLoading: Boolean = true,
    val isSubmitting: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class PatientCommunityViewModel @Inject constructor(
    private val supabaseClient: SupabaseClient,
) : ViewModel() {
    private val _state = MutableStateFlow(PatientCommunityState())
    val state = _state.asStateFlow()
    private var allPosts: List<CommunityPost> = emptyList()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            runCatching {
                val groups = supabaseClient.postgrest["community_groups"]
                    .select(Columns.list("id", "name", "member_count")) {
                        order("name", Order.ASCENDING)
                    }
                    .decodeList<CommunityGroupDto>()
                    .map { CommunityGroup(it.id, it.name, it.memberCount) }
                val posts = loadPostsFromSupabase()
                groups to posts
            }.onSuccess { (groups, posts) ->
                allPosts = posts
                _state.update {
                    it.copy(
                        groups = groups,
                        posts = filterCommunityPostsForGroup(posts, it.selectedGroupId),
                        isLoading = false,
                        error = null,
                    )
                }
            }.onFailure { error ->
                SecureLog.warn("[PatientCommunity] load stage=groups_posts code=" + communityErrorCode(error))
                _state.update { it.copy(isLoading = false, error = "No se pudo cargar la comunidad. Reintentá.") }
            }
        }
    }

    private suspend fun loadPostsFromSupabase(): List<CommunityPost> =
        supabaseClient.postgrest["community_posts"]
            .select(Columns.list("id", "group_id", "title", "content", "author_display_name", "is_anonymous", "reaction_count")) {
                order("created_at", Order.DESCENDING)
            }
            .decodeList<CommunityPostDto>()
            .map { row ->
                CommunityPost(
                    id = row.id,
                    groupId = row.groupId,
                    title = row.title?.takeIf(String::isNotBlank) ?: row.content.take(72),
                    content = row.content,
                    author = if (row.isAnonymous) "Anónimo" else row.authorDisplayName?.takeIf(String::isNotBlank) ?: "Paciente",
                    likeCount = row.reactionCount,
                )
            }

    fun selectGroup(groupId: String?) {
        _state.update {
            it.copy(
                selectedGroupId = groupId,
                posts = filterCommunityPostsForGroup(allPosts, groupId),
                error = null,
            )
        }
    }

    fun setShowComposer(show: Boolean) {
        _state.update { current ->
            val selected = current.selectedGroupId ?: current.groups.firstOrNull()?.id
            current.copy(
                showComposer = show,
                selectedGroupId = if (show) selected else current.selectedGroupId,
                error = if (show && selected == null) "No hay grupos disponibles para publicar." else null,
            )
        }
    }

    fun addPost(title: String, content: String) {
        val current = _state.value
        val groupId = current.selectedGroupId ?: current.groups.firstOrNull()?.id
        if (groupId.isNullOrBlank()) {
            _state.update { it.copy(error = "Elegí un grupo antes de publicar.") }
            return
        }
        if (content.isBlank() || current.isSubmitting) return

        viewModelScope.launch {
            _state.update { it.copy(isSubmitting = true, error = null) }
            runCatching {
                val userId = supabaseClient.auth.currentSessionOrNull()?.user?.id
                    ?: error("Authentication required")
                val patientId = supabaseClient.postgrest["patients"]
                    .select(Columns.list("id")) {
                        filter {
                            eq("user_id", userId)
                            eq("active", true)
                        }
                    }
                    .decodeSingle<CommunityPatientDto>().id

                val membership = supabaseClient.postgrest["group_memberships"]
                    .select(Columns.list("id", "status")) {
                        filter {
                            eq("group_id", groupId)
                            eq("patient_id", patientId)
                        }
                    }
                    .decodeSingleOrNull<CommunityMembershipDto>()
                if (membership == null) {
                    val inserted = supabaseClient.postgrest["group_memberships"].insert(
                        CommunityMembershipInsertDto(groupId = groupId, patientId = patientId)
                    ) {
                        select(Columns.list("id"))
                    }.decodeSingleOrNull<CommunityMembershipIdDto>()
                    check(inserted?.id?.isNotBlank() == true) { "Group membership was not confirmed" }
                } else {
                    check(membership.status == "active") { "Group membership is not active" }
                }

                val saved = supabaseClient.postgrest["community_posts"].insert(
                    CommunityPostInsertDto(
                        groupId = groupId,
                        authorId = patientId,
                        authorDisplayName = "Anónimo",
                        isAnonymous = true,
                        title = title.trim().takeIf(String::isNotBlank),
                        content = content.trim(),
                        moderationStatus = "approved",
                        reactionCount = 0,
                        commentCount = 0,
                        viewCount = 0,
                    )
                ) {
                    select(Columns.list("id", "group_id", "title", "content", "author_display_name", "is_anonymous", "reaction_count"))
                }.decodeSingle<CommunityPostDto>()
                CommunityPost(
                    id = saved.id,
                    groupId = saved.groupId,
                    title = saved.title?.takeIf(String::isNotBlank) ?: saved.content.take(72),
                    content = saved.content,
                    author = if (saved.isAnonymous) "Anónimo" else saved.authorDisplayName ?: "Paciente",
                    likeCount = saved.reactionCount,
                )
            }.onSuccess { saved ->
                allPosts = listOf(saved) + allPosts.filterNot { it.id == saved.id }
                _state.update {
                    it.copy(
                        posts = filterCommunityPostsForGroup(allPosts, groupId),
                        selectedGroupId = groupId,
                        isSubmitting = false,
                        showComposer = false,
                        error = null,
                    )
                }
            }.onFailure { error ->
                SecureLog.warn("[PatientCommunity] publish stage=community_posts_insert code=" + communityErrorCode(error))
                _state.update {
                    it.copy(
                        isSubmitting = false,
                        error = "No se pudo publicar. Revisá tu conexión e intentá nuevamente.",
                    )
                }
            }
        }
    }

    fun clearError() { _state.update { it.copy(error = null) } }
}

internal fun filterCommunityPostsForGroup(
    posts: List<CommunityPost>,
    selectedGroupId: String?,
): List<CommunityPost> =
    if (selectedGroupId.isNullOrBlank()) posts else posts.filter { it.groupId == selectedGroupId }

@Serializable private data class CommunityPatientDto(val id: String)
@Serializable private data class CommunityGroupDto(
    val id: String,
    val name: String,
    @SerialName("member_count") val memberCount: Int,
)
@Serializable private data class CommunityPostDto(
    val id: String,
    @SerialName("group_id") val groupId: String,
    val title: String? = null,
    val content: String,
    @SerialName("author_display_name") val authorDisplayName: String? = null,
    @SerialName("is_anonymous") val isAnonymous: Boolean,
    @SerialName("reaction_count") val reactionCount: Int = 0,
)
@Serializable private data class CommunityMembershipDto(val id: String, val status: String)
@Serializable private data class CommunityMembershipInsertDto(
    @SerialName("group_id") val groupId: String,
    @SerialName("patient_id") val patientId: String,
)
@Serializable private data class CommunityMembershipIdDto(val id: String)
@Serializable private data class CommunityPostInsertDto(
    @SerialName("group_id") val groupId: String,
    @SerialName("author_id") val authorId: String,
    @SerialName("author_display_name") val authorDisplayName: String,
    @SerialName("is_anonymous") val isAnonymous: Boolean,
    val title: String?,
    val content: String,
    @SerialName("moderation_status") val moderationStatus: String,
    @SerialName("reaction_count") val reactionCount: Int,
    @SerialName("comment_count") val commentCount: Int,
    @SerialName("view_count") val viewCount: Int,
)
private fun communityErrorCode(error: Throwable): String {
    val text = generateSequence(error) { it.cause }.take(8).map { it.message.orEmpty() }.joinToString(" ")
    Regex("(?i)HTTP\\s+(\\d{3})").find(text)?.groupValues?.get(1)?.let { return "http_$it" }
    Regex("(?i)SQLSTATE\\s*[:=]?\\s*([0-9A-Z]{5})").find(text)?.groupValues?.get(1)?.let { return it.uppercase() }
    Regex("\\b(42501|23503|23505|22P02)\\b").find(text)?.groupValues?.get(1)?.let { return it }
    return error::class.simpleName?.take(48) ?: "unknown"
}
