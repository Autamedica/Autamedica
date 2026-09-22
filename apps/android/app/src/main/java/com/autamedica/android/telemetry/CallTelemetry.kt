package com.autamedica.android.telemetry

import android.os.SystemClock
import android.util.Log
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Nanosecond-precision latency telemetry for AutaMedica telemedicine pipeline.
 * Measures each stage from T0 (user tap) to T5 (first decoded video frame rendered).
 * Emits uniform single-line JSON logcat with tag [LOGCAT_TAG] for automated ADB runners.
 */
object CallTelemetry {
    const val LOGCAT_TAG = "AUTAMEDICA_LATENCY"

    private data class TraceRecord(
        val traceId: String,
        val roomId: String,
        val t0Ns: Long,
        val timestampsNs: MutableMap<String, Long> = ConcurrentHashMap(),
        val meta: MutableMap<String, Any> = ConcurrentHashMap(),
    )

    private val traces = ConcurrentHashMap<String, TraceRecord>()
    @Volatile
    private var activeTraceId: String? = null

    fun startTrace(traceId: String, roomId: String, t0Ns: Long = SystemClock.elapsedRealtimeNanos()): String {
        val record = TraceRecord(traceId = traceId, roomId = roomId, t0Ns = t0Ns)
        traces[traceId] = record
        activeTraceId = traceId

        val payload = JSONObject().apply {
            put("event", "TRACE_START")
            put("trace_id", traceId)
            put("room_id", roomId)
            put("epoch_ms", System.currentTimeMillis())
            put("monotonic_ns", t0Ns)
        }
        Log.i(LOGCAT_TAG, payload.toString())
        return traceId
    }

    fun getActiveTraceId(): String? = activeTraceId

    fun recordMilestone(traceId: String? = null, milestone: String, meta: Map<String, Any> = emptyMap()) {
        val targetId = traceId ?: activeTraceId ?: return
        val trace = traces[targetId] ?: return
        val nowNs = SystemClock.elapsedRealtimeNanos()
        val existing = trace.timestampsNs.putIfAbsent(milestone, nowNs)
        if (existing != null) {
            // Milestone already recorded; ignore subsequent recompositions
            return
        }
        if (meta.isNotEmpty()) {
            trace.meta.putAll(meta)
        }
        val elapsedFromT0Ms = (nowNs - trace.t0Ns) / 1_000_000.0

        val payload = JSONObject().apply {
            put("event", "MILESTONE")
            put("trace_id", targetId)
            put("room_id", trace.roomId)
            put("milestone", milestone)
            put("elapsed_from_t0_ms", elapsedFromT0Ms)
            put("epoch_ms", System.currentTimeMillis())
            if (meta.isNotEmpty()) put("meta", JSONObject(meta))
        }
        Log.i(LOGCAT_TAG, payload.toString())
    }

    fun finalizeTrace(traceId: String? = null) {
        val targetId = traceId ?: activeTraceId ?: return
        val trace = traces.remove(targetId) ?: return
        if (activeTraceId == targetId) activeTraceId = null

        val t0 = trace.t0Ns
        val t1 = trace.timestampsNs["T1_BACKEND_CLAIM"] ?: t0
        val t2 = trace.timestampsNs["T2_COMPOSE_MOUNTED"] ?: t1
        val t3 = trace.timestampsNs["T3_CAMERA_STARTED"] ?: t2
        val t4 = trace.timestampsNs["T4_SFU_MEDIA_CONNECTED"] ?: t3
        val t5 = trace.timestampsNs["T5_FIRST_FRAME_RENDERED"] ?: trace.timestampsNs["T4_SFU_MEDIA_CONNECTED"] ?: SystemClock.elapsedRealtimeNanos()

        val totalMs = (t5 - t0) / 1_000_000.0

        val summary = JSONObject().apply {
            put("event", "TRACE_SUMMARY")
            put("trace_id", targetId)
            put("room_id", trace.roomId)
            put("total_latency_ms", totalMs)
            put("stages_ms", JSONObject().apply {
                put("t0_to_t1_claim", (t1 - t0) / 1_000_000.0)
                put("t1_to_t2_compose", (t2 - t1) / 1_000_000.0)
                put("t2_to_t3_camera", (t3 - t2) / 1_000_000.0)
                put("t3_to_t4_sfu", (t4 - t3) / 1_000_000.0)
                put("t4_to_t5_first_frame", (t5 - t4) / 1_000_000.0)
            })
        }
        Log.i(LOGCAT_TAG, summary.toString())
    }
}
