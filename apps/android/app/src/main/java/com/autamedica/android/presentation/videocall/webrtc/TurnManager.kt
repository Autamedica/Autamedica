package com.autamedica.android.presentation.videocall.webrtc

import com.autamedica.android.domain.repository.IceServerInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * TurnManager — Periodically refreshes TURN credentials mid-call.
 * Ported from packages/telemedicine/src/turn-manager.ts.
 */
class TurnManager(
    private val fetchTurnServers: suspend () -> List<IceServerInfo>,
) {
    private var refreshJob: Job? = null

    fun startTurnCredentialRefresh(
        scope: CoroutineScope,
        intervalMs: Long = REFRESH_INTERVAL_MS,
        onRefreshed: (List<IceServerInfo>) -> Unit,
    ) {
        if (refreshJob != null) return

        refreshJob = scope.launch {
            while (isActive) {
                delay(intervalMs)
                try {
                    val freshServers = fetchTurnServers()
                    val hasTurn = freshServers.any { server ->
                        server.urls.any { it.startsWith("turn:", ignoreCase = true) || it.startsWith("turns:", ignoreCase = true) }
                    }
                    if (hasTurn) {
                        onRefreshed(freshServers)
                        Timber.i("[TurnManager] TURN credentials refreshed successfully")
                    }
                } catch (e: Exception) {
                    Timber.w(e, "[TurnManager] Failed to refresh TURN credentials")
                }
            }
        }
    }

    fun stopTurnCredentialRefresh() {
        refreshJob?.cancel()
        refreshJob = null
    }

    companion object {
        const val REFRESH_INTERVAL_MS = 6L * 60 * 60 * 1000 // 6 hours
    }
}
