package com.autamedica.android.presentation.videocall.webrtc

import com.autamedica.android.domain.model.StreamQualityLevel
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AutoDegradeServiceTest {

    @Test
    fun `update degrades when poor quality threshold is reached immediately on zero threshold`() {
        var degradeTriggered = false
        var recoverTriggered = false

        val service = AutoDegradeService(
            poorQualityThresholdMs = 0L,
            recoveryThresholdMs = 0L,
            onDegrade = { degradeTriggered = true },
            onRecover = { recoverTriggered = true },
        )

        assertThat(service.isAutoDegraded).isFalse()

        service.update(StreamQualityLevel.POOR)
        assertThat(service.isAutoDegraded).isTrue()
        assertThat(degradeTriggered).isTrue()

        service.update(StreamQualityLevel.GOOD)
        assertThat(service.isAutoDegraded).isFalse()
        assertThat(recoverTriggered).isTrue()
    }

    @Test
    fun `update degrades within 12s window despite rural 3G 4G network fluctuations`() {
        var currentTime = 1_000_000L
        var degradeCount = 0
        var recoverCount = 0

        val service = AutoDegradeService(
            poorQualityThresholdMs = 12_000L,
            recoveryThresholdMs = 10_000L,
            onDegrade = { degradeCount++ },
            onRecover = { recoverCount++ },
            timeProvider = { currentTime },
        )

        // t = 0s: first poor sample
        service.update(StreamQualityLevel.POOR)
        assertThat(service.isAutoDegraded).isFalse()

        // t = 3s: still poor
        currentTime += 3_000L
        service.update(StreamQualityLevel.POOR)
        assertThat(service.isAutoDegraded).isFalse()

        // t = 6s: transient fluctuation (FAIR/GOOD spike due to packet burst)
        currentTime += 3_000L
        service.update(StreamQualityLevel.FAIR)
        assertThat(service.isAutoDegraded).isFalse()

        // t = 9s: drops back to poor
        currentTime += 3_000L
        service.update(StreamQualityLevel.POOR)
        assertThat(service.isAutoDegraded).isFalse()

        // t = 12s: 12 seconds window reached, predominantly poor -> auto-degrades
        currentTime += 3_000L
        service.update(StreamQualityLevel.POOR)
        assertThat(service.isAutoDegraded).isTrue()
        assertThat(degradeCount).isEqualTo(1)

        // Now test recovery:
        // t = 14s: good signal starts
        currentTime += 2_000L
        service.update(StreamQualityLevel.GOOD)
        assertThat(service.isAutoDegraded).isTrue() // Not recovered yet (needs 10s sustained)

        // t = 24s: 10s of sustained good connection -> recovers
        currentTime += 10_000L
        service.update(StreamQualityLevel.GOOD)
        assertThat(service.isAutoDegraded).isFalse()
        assertThat(recoverCount).isEqualTo(1)
    }

    @Test
    fun `update does not degrade if connection heals before 12s window completes`() {
        var currentTime = 2_000_000L
        var degradeCount = 0

        val service = AutoDegradeService(
            poorQualityThresholdMs = 12_000L,
            recoveryThresholdMs = 10_000L,
            onDegrade = { degradeCount++ },
            onRecover = {},
            timeProvider = { currentTime },
        )

        // t = 0s: poor sample
        service.update(StreamQualityLevel.POOR)

        // t = 2s: poor sample
        currentTime += 2_000L
        service.update(StreamQualityLevel.POOR)

        // t = 5s..10s: sustained good quality (network recovered quickly)
        currentTime += 3_000L
        service.update(StreamQualityLevel.GOOD)
        currentTime += 3_000L
        service.update(StreamQualityLevel.GOOD)
        currentTime += 3_000L
        service.update(StreamQualityLevel.GOOD)

        // t = 13s: should NOT be degraded because network healed
        currentTime += 2_000L
        service.update(StreamQualityLevel.GOOD)
        assertThat(service.isAutoDegraded).isFalse()
        assertThat(degradeCount).isEqualTo(0)
    }

    @Test
    fun `manualOverrideReset clears degraded state immediately`() {
        var degradeTriggered = false

        val service = AutoDegradeService(
            poorQualityThresholdMs = 0L,
            recoveryThresholdMs = 0L,
            onDegrade = { degradeTriggered = true },
            onRecover = {},
        )

        service.update(StreamQualityLevel.POOR)
        assertThat(service.isAutoDegraded).isTrue()

        service.manualOverrideReset()
        assertThat(service.isAutoDegraded).isFalse()
    }
}
