package com.autamedica.android.presentation.videocall.webrtc

import com.autamedica.android.domain.model.StreamQualityLevel

/**
 * AutoDegradeService — Monitors call quality and auto-switches to audio-only
 * when quality is poor for a sustained period (30 seconds).
 * Ported from packages/telemedicine/src/quality/auto-degrade.ts.
 */
class AutoDegradeService(
    private val poorQualityThresholdMs: Long = DEFAULT_POOR_THRESHOLD_MS,
    private val recoveryThresholdMs: Long = DEFAULT_RECOVERY_THRESHOLD_MS,
    private val onDegrade: () -> Unit,
    private val onRecover: () -> Unit,
) {
    private var _isAutoDegraded = false
    val isAutoDegraded: Boolean get() = _isAutoDegraded

    private var poorSince: Long? = null
    private var goodSince: Long? = null
    private var degradedAt: Long? = null
    private var recoveredAt: Long? = null

    fun update(level: StreamQualityLevel) {
        val now = System.currentTimeMillis()

        if (level == StreamQualityLevel.POOR) {
            goodSince = null
            if (poorSince == null) {
                poorSince = now
            }

            if (!_isAutoDegraded && (now - (poorSince ?: now)) >= poorQualityThresholdMs) {
                _isAutoDegraded = true
                degradedAt = now
                onDegrade()
            }
        } else {
            poorSince = null
            val isGoodOrBetter = level == StreamQualityLevel.GOOD || level == StreamQualityLevel.EXCELLENT

            if (_isAutoDegraded && isGoodOrBetter) {
                if (goodSince == null) {
                    goodSince = now
                }

                if ((now - (goodSince ?: now)) >= recoveryThresholdMs) {
                    _isAutoDegraded = false
                    recoveredAt = now
                    goodSince = null
                    onRecover()
                }
            } else if (!isGoodOrBetter) {
                goodSince = null
            }
        }
    }

    fun manualOverrideReset() {
        _isAutoDegraded = false
        poorSince = null
        goodSince = null
        degradedAt = null
        recoveredAt = null
    }

    fun reset() {
        manualOverrideReset()
    }

    companion object {
        const val DEFAULT_POOR_THRESHOLD_MS = 30_000L
        const val DEFAULT_RECOVERY_THRESHOLD_MS = 15_000L
    }
}
