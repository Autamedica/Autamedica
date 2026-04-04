/**
 * Centralized tuning constants for the telemedicine WebRTC engine.
 * All magic numbers live here so they can be found, reviewed, and overridden in one place.
 *
 * Organized by subsystem. Values are the production defaults — change with care.
 */

// ── Bitrate Adapter ──────────────────────────────────────────────────────────

/** Conservative start bitrate (bps). Ramped up progressively. */
export const INITIAL_VIDEO_BITRATE = 500_000
/** Target bitrate for 720p quality (bps). */
export const TARGET_VIDEO_BITRATE = 2_500_000
/** Duration of the progressive ramp from initial to target (ms). */
export const BITRATE_RAMP_DURATION_MS = 10_000
/** Step interval during ramp (ms). */
export const BITRATE_RAMP_INTERVAL_MS = 2_000
/** Use at most this fraction of estimated bandwidth (leaves headroom for audio). */
export const BWE_HEADROOM_FACTOR = 0.85
/** Minimum interval between BWE adjustments (ms). */
export const BWE_ADJUST_THROTTLE_MS = 3_000
/** Minimum interval between proactive quality degradation checks (ms). */
export const QUALITY_DEGRADE_THROTTLE_MS = 3_000
/** Bitrate multiplier when CPU-limited. */
export const CPU_REDUCTION_FACTOR = 0.6
/** Bitrate multiplier when bandwidth-limited. */
export const BW_REDUCTION_FACTOR = 0.75
/** Packet loss % above which aggressive adaptation kicks in. */
export const HIGH_PACKET_LOSS_THRESHOLD = 10

// ── Quality Monitor ───────���──────────────────────────────────────────────────

/** Interval between quality metric polls (ms). */
export const QUALITY_POLL_INTERVAL_MS = 5_000
/** Interval between quality summary log emissions (ms). */
export const QUALITY_LOG_INTERVAL_MS = 30_000
/** Remote audio amplitude below this is considered silent. */
export const AUDIO_SILENT_THRESHOLD = 0.01
/** Duration of silence before emitting alert (ms). */
export const AUDIO_SILENT_ALERT_MS = 10_000

/** Quality scoring thresholds — {excellent, good, fair}; below fair = poor. */
export const QUALITY_THRESHOLDS = {
  bitrate:    { excellent: 1_800, good: 1_000, fair: 450 },   // kbps
  fps:        { excellent: 24,    good: 15,    fair: 8 },
  packetLoss: { excellent: 1,     good: 3,     fair: 6 },     // %
  rtt:        { excellent: 120,   good: 220,   fair: 350 },   // ms
  jitter:     { excellent: 20,    good: 40,    fair: 70 },    // ms
} as const

// ── Peer Connection ───────���──────────────────────────────────────────────────

/** Maximum ICE restart attempts before giving up. */
export const MAX_ICE_RESTART_ATTEMPTS = 5
/** Base exponential backoff for ICE restarts (ms). */
export const ICE_RESTART_BACKOFF_BASE_MS = 2_000

// ── Auto Degrade ────────────────���────────────────────���───────────────────────

/** Sustained poor quality time before auto-switching to audio-only (ms). */
export const POOR_QUALITY_THRESHOLD_MS = 30_000
/** Sustained good quality time before notifying recovery (ms). */
export const RECOVERY_THRESHOLD_MS = 15_000

// ── Connection & Hooks ──────────────────────────────────────────��────────────

/** Warmup period before quality evaluation starts (ms). */
export const QUALITY_WARMUP_MS = 15_000
/** Timeout waiting for remote peer's video (ms). */
export const REMOTE_MEDIA_TIMEOUT_MS = 20_000
/** TURN credential refresh interval (ms). Cloudflare credentials expire in 24h. */
export const TURN_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1_000
