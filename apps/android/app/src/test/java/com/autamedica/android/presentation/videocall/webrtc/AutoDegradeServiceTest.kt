package com.autamedica.android.presentation.videocall.webrtc

import com.autamedica.android.domain.model.StreamQualityLevel
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AutoDegradeServiceTest {

    @Test
    fun `update degrades when poor quality threshold is reached`() {
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
