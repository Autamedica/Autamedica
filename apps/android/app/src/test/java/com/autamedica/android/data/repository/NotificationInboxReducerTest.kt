package com.autamedica.android.data.repository

import com.autamedica.android.domain.model.PortalNotification
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationInboxReducerTest {
    private fun notification(id: String, readAt: String? = null) = PortalNotification(
        id = id,
        userId = "synthetic-patient",
        title = "Synthetic message",
        body = "Test only",
        readAt = readAt,
    )

    @Test
    fun newInsertAppearsOnceAtTop() {
        val existing = notification("previous", readAt = "2026-11-08T00:00:00Z")
        val incoming = notification("new")
        val result = addPortalNotificationIfNew(listOf(existing), incoming)

        assertThat(result.map { it.id }).containsExactly("new", "previous").inOrder()
        assertThat(result.count { !it.isRead }).isEqualTo(1)
    }

    @Test
    fun replayCannotRestoreReadNotificationOrIncreaseUnreadCount() {
        val read = notification("existing", readAt = "2026-11-08T00:00:00Z")
        val replay = notification("existing")
        val result = addPortalNotificationIfNew(listOf(read), replay)

        assertThat(result).containsExactly(read)
        assertThat(result.count { !it.isRead }).isEqualTo(0)
    }

    @Test
    fun duplicateInsertDoesNotChangeUnreadCount() {
        val unread = notification("same")
        val result = addPortalNotificationIfNew(listOf(unread), notification("same"))

        assertThat(result).containsExactly(unread)
        assertThat(result.count { !it.isRead }).isEqualTo(1)
    }

    @Test
    fun successfulEmptyServerResponseClearsStaleCache() {
        val cached = notification("old-message")
        val result = resolvePortalInbox(Result.success(emptyList()), listOf(cached))

        assertThat(result).isEmpty()
    }

    @Test
    fun failedRefreshRetainsLastKnownInbox() {
        val cached = notification("cached")
        val result = resolvePortalInbox(
            Result.failure(IllegalStateException("offline")),
            listOf(cached),
        )

        assertThat(result).containsExactly(cached)
    }
}
