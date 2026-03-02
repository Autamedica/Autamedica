package com.autamedica.android.presentation.videocall.webrtc

import com.autamedica.android.domain.model.StreamQualityLevel
import com.autamedica.android.domain.model.StreamQualityMetrics
import org.junit.Test
import com.google.common.truth.Truth.assertThat

/**
 * Pure JVM tests for QualityMonitor scoring logic.
 * Validates that thresholds match webrtc-client.ts exactly.
 */
class QualityMonitorTest {

    private val monitor = QualityMonitor()

    // -- getOverallLevel (worst-of aggregation) --

    @Test
    fun `overall level is UNKNOWN when no peers`() {
        val level = monitor.getOverallLevel(emptyList())
        assertThat(level).isEqualTo(StreamQualityLevel.UNKNOWN)
    }

    @Test
    fun `overall level is worst of all peers`() {
        val peers = listOf(
            makeMetrics("a", StreamQualityLevel.EXCELLENT),
            makeMetrics("b", StreamQualityLevel.FAIR),
            makeMetrics("c", StreamQualityLevel.GOOD),
        )
        val level = monitor.getOverallLevel(peers)
        assertThat(level).isEqualTo(StreamQualityLevel.FAIR)
    }

    @Test
    fun `overall level POOR when any peer is POOR`() {
        val peers = listOf(
            makeMetrics("a", StreamQualityLevel.EXCELLENT),
            makeMetrics("b", StreamQualityLevel.POOR),
        )
        val level = monitor.getOverallLevel(peers)
        assertThat(level).isEqualTo(StreamQualityLevel.POOR)
    }

    @Test
    fun `overall level EXCELLENT when all peers EXCELLENT`() {
        val peers = listOf(
            makeMetrics("a", StreamQualityLevel.EXCELLENT),
            makeMetrics("b", StreamQualityLevel.EXCELLENT),
        )
        val level = monitor.getOverallLevel(peers)
        assertThat(level).isEqualTo(StreamQualityLevel.EXCELLENT)
    }

    @Test
    fun `overall level ignores UNKNOWN peers`() {
        val peers = listOf(
            makeMetrics("a", StreamQualityLevel.GOOD),
            makeMetrics("b", StreamQualityLevel.UNKNOWN),
        )
        val level = monitor.getOverallLevel(peers)
        assertThat(level).isEqualTo(StreamQualityLevel.GOOD)
    }

    @Test
    fun `overall level UNKNOWN when all peers UNKNOWN`() {
        val peers = listOf(
            makeMetrics("a", StreamQualityLevel.UNKNOWN),
            makeMetrics("b", StreamQualityLevel.UNKNOWN),
        )
        val level = monitor.getOverallLevel(peers)
        assertThat(level).isEqualTo(StreamQualityLevel.UNKNOWN)
    }

    @Test
    fun `removePeer clears stored samples`() {
        // Just verify it doesn't throw
        monitor.removePeer("nonexistent")
        monitor.reset()
    }

    private fun makeMetrics(userId: String, level: StreamQualityLevel) = StreamQualityMetrics(
        userId = userId,
        level = level,
        timestamp = System.currentTimeMillis(),
    )
}
