package com.autamedica.android.presentation.patients.community

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PatientCommunityViewModelTest {
    @Test
    fun selectedGroupFiltersPostsFromOtherGroups() {
        val reproductive = CommunityPost("post-1", "group-a", "Título", "Contenido", "Anónimo", 2)
        val nutrition = CommunityPost("post-2", "group-b", "Título 2", "Contenido 2", "Anónimo", 0)

        assertThat(filterCommunityPostsForGroup(listOf(reproductive, nutrition), "group-a"))
            .containsExactly(reproductive)
    }

    @Test
    fun nullGroupShowsAllPosts() {
        val first = CommunityPost("post-1", "group-a", "Título", "Contenido", "Anónimo", 2)
        val second = CommunityPost("post-2", "group-b", "Título 2", "Contenido 2", "Anónimo", 0)

        assertThat(filterCommunityPostsForGroup(listOf(first, second), null))
            .containsExactly(first, second).inOrder()
    }
}
