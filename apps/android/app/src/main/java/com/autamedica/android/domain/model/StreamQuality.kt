package com.autamedica.android.domain.model

enum class StreamQualityLevel {
    UNKNOWN,
    POOR,
    FAIR,
    GOOD,
    EXCELLENT;
}

data class StreamQualityMetrics(
    val userId: String,
    val level: StreamQualityLevel,
    val timestamp: Long,
    val outboundVideoBitrateKbps: Double? = null,
    val outboundAudioBitrateKbps: Double? = null,
    val inboundVideoBitrateKbps: Double? = null,
    val inboundAudioBitrateKbps: Double? = null,
    val packetsLostPct: Double? = null,
    val jitterMs: Double? = null,
    val roundTripTimeMs: Double? = null,
    val framesPerSecond: Double? = null,
    val frameWidth: Int? = null,
    val frameHeight: Int? = null,
    val availableOutgoingBitrateKbps: Double? = null,
)

data class StreamQualitySummary(
    val roomId: String,
    val overallLevel: StreamQualityLevel,
    val peers: List<StreamQualityMetrics>,
)
