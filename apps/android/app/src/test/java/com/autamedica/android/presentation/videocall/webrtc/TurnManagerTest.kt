package com.autamedica.android.presentation.videocall.webrtc

import com.autamedica.android.domain.repository.IceServerInfo
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TurnManagerTest {

    private val testDispatcher = StandardTestDispatcher()
    private val testScope = TestScope(testDispatcher)

    @Test
    fun `startTurnCredentialRefresh fetches and invokes callback when TURN servers are present`() = testScope.runTest {
        val mockServers = listOf(
            IceServerInfo(
                urls = listOf("turn:turn.cloudflare.com:3478?transport=udp"),
                username = "test-user",
                credential = "test-credential",
            )
        )
        var fetchCount = 0
        val turnManager = TurnManager(
            fetchTurnServers = {
                fetchCount++
                mockServers
            }
        )

        var refreshedServers: List<IceServerInfo>? = null
        turnManager.startTurnCredentialRefresh(
            scope = this,
            intervalMs = 1_000L,
            onRefreshed = { refreshedServers = it },
        )

        advanceTimeBy(1_050L)
        assertThat(fetchCount).isEqualTo(1)
        assertThat(refreshedServers).isEqualTo(mockServers)

        advanceTimeBy(1_000L)
        assertThat(fetchCount).isEqualTo(2)

        turnManager.stopTurnCredentialRefresh()
        advanceTimeBy(2_000L)
        assertThat(fetchCount).isEqualTo(2)
    }

    @Test
    fun `startTurnCredentialRefresh ignores servers without TURN urls`() = testScope.runTest {
        val stunOnlyServers = listOf(
            IceServerInfo(urls = listOf("stun:stun.l.google.com:19302"))
        )
        val turnManager = TurnManager(
            fetchTurnServers = { stunOnlyServers }
        )

        var callbackInvoked = false
        turnManager.startTurnCredentialRefresh(
            scope = this,
            intervalMs = 500L,
            onRefreshed = { callbackInvoked = true },
        )

        advanceTimeBy(600L)
        assertThat(callbackInvoked).isFalse()
        turnManager.stopTurnCredentialRefresh()
    }
}
