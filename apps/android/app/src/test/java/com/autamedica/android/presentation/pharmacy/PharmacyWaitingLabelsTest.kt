package com.autamedica.android.presentation.pharmacy

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PharmacyWaitingLabelsTest {
    @Test fun unknownQueuePositionIsNeverPresentedAsFirst() {
        assertThat(queuePositionLabel(0)).isEqualTo("Por confirmar")
        assertThat(queuePositionLabel(-1)).isEqualTo("Por confirmar")
        assertThat(queuePositionLabel(1)).isEqualTo("#1")
        assertThat(queuePositionLabel(5)).isEqualTo("#5")
    }

    @Test fun unknownWaitTimeIsNeverPresentedAsThreeMinutes() {
        assertThat(waitingTimeLabel(0)).isEqualTo("Sin estimación")
        assertThat(waitingTimeLabel(-1)).isEqualTo("Sin estimación")
        assertThat(waitingTimeLabel(3)).isEqualTo("~3 min")
        assertThat(waitingTimeLabel(12)).isEqualTo("~12 min")
    }
}
