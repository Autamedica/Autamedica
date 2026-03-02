package com.autamedica.android.presentation.videocall.webrtc

import com.autamedica.android.domain.model.StreamQualityLevel
import com.autamedica.android.domain.model.StreamQualityMetrics
import org.webrtc.PeerConnection
import org.webrtc.RTCStatsReport
import timber.log.Timber
import kotlin.math.min
import kotlin.math.round

/**
 * Quality monitoring with same thresholds as webrtc-client.ts lines 226-406.
 *
 * Scoring: worst-of aggregation across 5 metrics.
 * Each metric scored 0-3: poor=0, fair=1, good=2, excellent=3.
 * Overall level = QUALITY_SCORE_TO_LEVEL[min(all scores)].
 */
class QualityMonitor {

    private data class StatsSample(
        val timestampMs: Long,
        val outboundVideoBytes: Long,
        val outboundAudioBytes: Long,
        val inboundVideoBytes: Long,
        val inboundAudioBytes: Long,
        val packetsLost: Long,
        val packetsReceived: Long,
    )

    private val previousSamples = mutableMapOf<String, StatsSample>()

    fun collectForPeer(userId: String, pc: PeerConnection): StreamQualityMetrics? {
        return try {
            val report = getStatsSync(pc) ?: return null
            buildMetrics(userId, report)
        } catch (e: Exception) {
            Timber.w(e, "[QualityMonitor] Failed collecting stats for $userId")
            null
        }
    }

    fun removePeer(userId: String) {
        previousSamples.remove(userId)
    }

    fun reset() {
        previousSamples.clear()
    }

    fun getOverallLevel(peers: List<StreamQualityMetrics>): StreamQualityLevel {
        var worstScore = 4
        for (peer in peers) {
            val score = levelToScore(peer.level)
            if (score >= 0) worstScore = min(worstScore, score)
        }
        return if (worstScore > 3) StreamQualityLevel.UNKNOWN
        else QUALITY_SCORE_TO_LEVEL.getOrElse(worstScore) { StreamQualityLevel.UNKNOWN }
    }

    private fun getStatsSync(pc: PeerConnection): RTCStatsReport? {
        var result: RTCStatsReport? = null
        val latch = java.util.concurrent.CountDownLatch(1)

        pc.getStats { report ->
            result = report
            latch.countDown()
        }

        return if (latch.await(2, java.util.concurrent.TimeUnit.SECONDS)) result else null
    }

    private fun buildMetrics(userId: String, report: RTCStatsReport): StreamQualityMetrics {
        val now = System.currentTimeMillis()

        var outboundVideoBytes = 0L
        var outboundAudioBytes = 0L
        var inboundVideoBytes = 0L
        var inboundAudioBytes = 0L
        var packetsLost = 0L
        var packetsReceived = 0L
        var jitterMs: Double? = null
        var roundTripTimeMs: Double? = null
        var framesPerSecond: Double? = null
        var frameWidth: Int? = null
        var frameHeight: Int? = null
        var availableOutgoingBitrateKbps: Double? = null

        for ((_, stat) in report.statsMap) {
            when (stat.type) {
                "outbound-rtp" -> {
                    val kind = stat.members["kind"] as? String
                        ?: stat.members["mediaType"] as? String
                    val bytesSent = (stat.members["bytesSent"] as? Number)?.toLong()
                    if (bytesSent != null) {
                        if (kind == "video") outboundVideoBytes += bytesSent
                        else if (kind == "audio") outboundAudioBytes += bytesSent
                    }
                }

                "inbound-rtp" -> {
                    val kind = stat.members["kind"] as? String
                        ?: stat.members["mediaType"] as? String
                    val bytesReceived = (stat.members["bytesReceived"] as? Number)?.toLong()
                    if (bytesReceived != null) {
                        if (kind == "video") inboundVideoBytes += bytesReceived
                        else if (kind == "audio") inboundAudioBytes += bytesReceived
                    }
                    if (kind == "video") {
                        val pl = (stat.members["packetsLost"] as? Number)?.toLong()
                        val pr = (stat.members["packetsReceived"] as? Number)?.toLong()
                        val jitterSec = (stat.members["jitter"] as? Number)?.toDouble()
                        if (pl != null) packetsLost += pl
                        if (pr != null) packetsReceived += pr
                        if (jitterSec != null) jitterMs = jitterSec * 1000.0
                        val fps = (stat.members["framesPerSecond"] as? Number)?.toDouble()
                        if (fps != null) framesPerSecond = fps
                        val fw = (stat.members["frameWidth"] as? Number)?.toInt()
                        val fh = (stat.members["frameHeight"] as? Number)?.toInt()
                        if (fw != null) frameWidth = fw
                        if (fh != null) frameHeight = fh
                    }
                }

                "candidate-pair" -> {
                    val nominated = stat.members["nominated"] as? Boolean ?: false
                    val state = stat.members["state"] as? String
                    if (nominated && state == "succeeded") {
                        val rttSec = (stat.members["currentRoundTripTime"] as? Number)?.toDouble()
                        val aob = (stat.members["availableOutgoingBitrate"] as? Number)?.toDouble()
                        if (rttSec != null) roundTripTimeMs = rttSec * 1000.0
                        if (aob != null) availableOutgoingBitrateKbps = aob / 1000.0
                    }
                }

                else -> {}
            }
        }

        val previous = previousSamples[userId]
        val elapsedMs = if (previous != null) now - previous.timestampMs else 0L

        val outVidBitrateKbps = computeBitrateKbps(outboundVideoBytes, previous?.outboundVideoBytes, elapsedMs)
        val outAudBitrateKbps = computeBitrateKbps(outboundAudioBytes, previous?.outboundAudioBytes, elapsedMs)
        val inVidBitrateKbps = computeBitrateKbps(inboundVideoBytes, previous?.inboundVideoBytes, elapsedMs)
        val inAudBitrateKbps = computeBitrateKbps(inboundAudioBytes, previous?.inboundAudioBytes, elapsedMs)

        val packetsLostPct = if (previous != null) {
            val deltaLost = packetsLost - previous.packetsLost
            val deltaReceived = packetsReceived - previous.packetsReceived
            val deltaTotal = deltaLost + deltaReceived
            if (deltaTotal > 0 && deltaLost >= 0 && deltaReceived >= 0) {
                (deltaLost.toDouble() / deltaTotal) * 100.0
            } else null
        } else {
            val total = packetsLost + packetsReceived
            if (total > 0) (packetsLost.toDouble() / total) * 100.0 else null
        }

        previousSamples[userId] = StatsSample(
            timestampMs = now,
            outboundVideoBytes = outboundVideoBytes,
            outboundAudioBytes = outboundAudioBytes,
            inboundVideoBytes = inboundVideoBytes,
            inboundAudioBytes = inboundAudioBytes,
            packetsLost = packetsLost,
            packetsReceived = packetsReceived,
        )

        val level = classifyQualityLevel(
            inboundVideoBitrateKbps = inVidBitrateKbps,
            framesPerSecond = framesPerSecond,
            packetsLostPct = packetsLostPct,
            roundTripTimeMs = roundTripTimeMs,
            jitterMs = jitterMs,
        )

        return StreamQualityMetrics(
            userId = userId,
            level = level,
            timestamp = now,
            outboundVideoBitrateKbps = roundMetric(outVidBitrateKbps),
            outboundAudioBitrateKbps = roundMetric(outAudBitrateKbps),
            inboundVideoBitrateKbps = roundMetric(inVidBitrateKbps),
            inboundAudioBitrateKbps = roundMetric(inAudBitrateKbps),
            packetsLostPct = roundMetric(packetsLostPct, 2),
            jitterMs = roundMetric(jitterMs),
            roundTripTimeMs = roundMetric(roundTripTimeMs),
            framesPerSecond = roundMetric(framesPerSecond),
            frameWidth = frameWidth,
            frameHeight = frameHeight,
            availableOutgoingBitrateKbps = roundMetric(availableOutgoingBitrateKbps),
        )
    }

    // -- Scoring (exact match to TS thresholds) --

    private fun classifyQualityLevel(
        inboundVideoBitrateKbps: Double?,
        framesPerSecond: Double?,
        packetsLostPct: Double?,
        roundTripTimeMs: Double?,
        jitterMs: Double?,
    ): StreamQualityLevel {
        val scores = mutableListOf<Int>()

        inboundVideoBitrateKbps?.let { scores.add(scoreInboundBitrate(it)) }
        framesPerSecond?.let { scores.add(scoreFps(it)) }
        packetsLostPct?.let { scores.add(scorePacketLoss(it)) }
        roundTripTimeMs?.let { scores.add(scoreRoundTripTime(it)) }
        jitterMs?.let { scores.add(scoreJitter(it)) }

        if (scores.isEmpty()) return StreamQualityLevel.UNKNOWN

        val worstScore = scores.min()
        return QUALITY_SCORE_TO_LEVEL.getOrElse(worstScore) { StreamQualityLevel.UNKNOWN }
    }

    private fun scoreInboundBitrate(kbps: Double): Int = when {
        kbps >= 1800 -> 3
        kbps >= 1000 -> 2
        kbps >= 450 -> 1
        else -> 0
    }

    private fun scoreFps(fps: Double): Int = when {
        fps >= 24 -> 3
        fps >= 15 -> 2
        fps >= 8 -> 1
        else -> 0
    }

    private fun scorePacketLoss(pct: Double): Int = when {
        pct <= 1 -> 3
        pct <= 3 -> 2
        pct <= 6 -> 1
        else -> 0
    }

    private fun scoreRoundTripTime(ms: Double): Int = when {
        ms <= 120 -> 3
        ms <= 220 -> 2
        ms <= 350 -> 1
        else -> 0
    }

    private fun scoreJitter(ms: Double): Int = when {
        ms <= 20 -> 3
        ms <= 40 -> 2
        ms <= 70 -> 1
        else -> 0
    }

    private fun levelToScore(level: StreamQualityLevel): Int = when (level) {
        StreamQualityLevel.EXCELLENT -> 3
        StreamQualityLevel.GOOD -> 2
        StreamQualityLevel.FAIR -> 1
        StreamQualityLevel.POOR -> 0
        StreamQualityLevel.UNKNOWN -> -1
    }

    private fun computeBitrateKbps(current: Long, previous: Long?, elapsedMs: Long): Double? {
        if (previous == null || elapsedMs <= 0 || current < previous) return null
        return ((current - previous) * 8).toDouble() / elapsedMs
    }

    private fun roundMetric(value: Double?, digits: Int = 1): Double? {
        if (value == null || value.isNaN()) return null
        val factor = Math.pow(10.0, digits.toDouble())
        return round(value * factor) / factor
    }

    companion object {
        private val QUALITY_SCORE_TO_LEVEL = listOf(
            StreamQualityLevel.POOR,
            StreamQualityLevel.FAIR,
            StreamQualityLevel.GOOD,
            StreamQualityLevel.EXCELLENT,
        )
    }
}
