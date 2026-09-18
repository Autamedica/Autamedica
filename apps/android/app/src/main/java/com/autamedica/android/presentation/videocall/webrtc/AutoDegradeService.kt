package com.autamedica.android.presentation.videocall.webrtc

import com.autamedica.android.domain.model.StreamQualityLevel

/**
 * AutoDegradeService — Monitors call quality and auto-switches to audio-only
 * when quality is poor over a sustained 12-second window, with resilience and
 * fluctuation tolerance for rural 3G/4G networks (e.g. Quaraí / RS).
 *
 * Automatically restores local video via [onRecover] once stable network quality
 * (GOOD or EXCELLENT) is sustained for the recovery window.
 */
class AutoDegradeService(
    private val poorQualityThresholdMs: Long = DEFAULT_POOR_THRESHOLD_MS,
    private val recoveryThresholdMs: Long = DEFAULT_RECOVERY_THRESHOLD_MS,
    private val onDegrade: () -> Unit,
    private val onRecover: () -> Unit,
    private val timeProvider: () -> Long = { System.currentTimeMillis() },
) {
    private var _isAutoDegraded = false
    val isAutoDegraded: Boolean get() = _isAutoDegraded

    private var poorSince: Long? = null
    private var goodSince: Long? = null
    private var degradedAt: Long? = null
    private var recoveredAt: Long? = null

    private data class Sample(val timestamp: Long, val level: StreamQualityLevel)
    private val windowSamples = mutableListOf<Sample>()

    fun update(level: StreamQualityLevel) {
        val now = timeProvider()

        // Prune older samples outside of analysis window
        val retentionWindow = maxOf(poorQualityThresholdMs, recoveryThresholdMs) + 6_000L
        windowSamples.removeAll { now - it.timestamp > retentionWindow }
        windowSamples.add(Sample(now, level))

        if (!_isAutoDegraded) {
            goodSince = null

            if (poorQualityThresholdMs <= 0L) {
                if (level == StreamQualityLevel.POOR) {
                    triggerDegrade(now)
                }
                return
            }

            if (level == StreamQualityLevel.POOR) {
                if (poorSince == null) {
                    poorSince = now
                }
            } else if (level == StreamQualityLevel.GOOD || level == StreamQualityLevel.EXCELLENT) {
                // If we receive sustained good quality for more than 4s, reset the poor streak
                val recentSamples = windowSamples.filter { now - it.timestamp <= 4_000L }
                if (recentSamples.isNotEmpty() && recentSamples.all { it.level == StreamQualityLevel.GOOD || it.level == StreamQualityLevel.EXCELLENT }) {
                    poorSince = null
                }
            }

            poorSince?.let { start ->
                val elapsed = now - start
                if (elapsed >= poorQualityThresholdMs) {
                    // Check ratio of poor samples in the window: tolerate transient non-poor spikes
                    val window = windowSamples.filter { it.timestamp in (now - poorQualityThresholdMs)..now }
                    val poorCount = window.count { it.level == StreamQualityLevel.POOR }
                    val totalCount = window.size

                    // If at least 60% of samples are POOR (or if alone), degrade to audio-only
                    val isPredominantlyPoor = if (totalCount > 0) {
                        (poorCount.toDouble() / totalCount.toDouble()) >= 0.60
                    } else {
                        true
                    }

                    if (isPredominantlyPoor) {
                        triggerDegrade(now)
                    }
                }
            }
        } else {
            // Currently auto-degraded, monitor for recovery
            val isGoodOrBetter = level == StreamQualityLevel.GOOD || level == StreamQualityLevel.EXCELLENT

            if (recoveryThresholdMs <= 0L) {
                if (isGoodOrBetter) {
                    triggerRecovery(now)
                }
                return
            }

            if (isGoodOrBetter) {
                if (goodSince == null) {
                    goodSince = now
                }

                if ((now - (goodSince ?: now)) >= recoveryThresholdMs) {
                    triggerRecovery(now)
                }
            } else if (level == StreamQualityLevel.POOR) {
                // If a hard POOR arrives, reset recovery counter
                goodSince = null
            }
        }
    }

    private fun triggerDegrade(now: Long) {
        _isAutoDegraded = true
        degradedAt = now
        goodSince = null
        onDegrade()
    }

    private fun triggerRecovery(now: Long) {
        _isAutoDegraded = false
        recoveredAt = now
        goodSince = null
        poorSince = null
        windowSamples.clear()
        onRecover()
    }

    fun manualOverrideReset() {
        _isAutoDegraded = false
        poorSince = null
        goodSince = null
        degradedAt = null
        recoveredAt = null
        windowSamples.clear()
    }

    fun reset() {
        manualOverrideReset()
    }

    companion object {
        const val DEFAULT_POOR_THRESHOLD_MS = 12_000L
        const val DEFAULT_RECOVERY_THRESHOLD_MS = 10_000L
    }
}
