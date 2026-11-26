package com.autamedica.companion;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Thread-safe durable execution state machine supporting Human-in-the-Loop (HITL)
 * pause, persistence across app restarts, and deterministic resume without losing step context.
 */
final class ExecutionStateMachine {
    static final String DEFAULT_PERSIST_KEY = "execution.active_context";

    enum State {
        IDLE,
        RUNNING,
        AWAITING_USER,
        RESUMING,
        FAILED,
        COMPLETED
    }

    static State parseState(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            throw new IllegalArgumentException("Empty state");
        }
        String norm = raw.trim().toUpperCase(Locale.ROOT);
        if ("WAITING_HUMAN_AUTH".equals(norm)) {
            return State.AWAITING_USER;
        }
        return State.valueOf(norm);
    }

    static final class RunContext {
        final String runId;
        final String flowName;
        final int stepIndex;
        final String stepAction;
        final String targetUrl;
        final State state;
        final String pauseReason;
        final String pauseGateKind;
        final String errorCode;
        final String errorMessage;
        final int attempt;
        final long createdAtMs;
        final long updatedAtMs;

        RunContext(
                String runId,
                String flowName,
                int stepIndex,
                String stepAction,
                String targetUrl,
                State state,
                String pauseReason,
                String pauseGateKind,
                String errorCode,
                String errorMessage,
                int attempt,
                long createdAtMs,
                long updatedAtMs) {
            this.runId = nn(runId);
            this.flowName = nn(flowName);
            this.stepIndex = Math.max(0, stepIndex);
            this.stepAction = nn(stepAction);
            this.targetUrl = nn(targetUrl);
            this.state = state == null ? State.IDLE : state;
            this.pauseReason = nn(pauseReason);
            this.pauseGateKind = nn(pauseGateKind);
            this.errorCode = nn(errorCode);
            this.errorMessage = nn(errorMessage);
            this.attempt = Math.max(0, attempt);
            this.createdAtMs = createdAtMs;
            this.updatedAtMs = updatedAtMs;
        }

        static RunContext idle(long nowMs) {
            return new RunContext("", "", 0, "", "", State.IDLE, "", "", "", "", 0, nowMs, nowMs);
        }

        String toJsonString() {
            StringBuilder sb = new StringBuilder(256);
            sb.append('{');
            appendJsonStringField(sb, "runId", runId, true);
            appendJsonStringField(sb, "flowName", flowName, false);
            appendJsonLongField(sb, "stepIndex", stepIndex, false);
            appendJsonStringField(sb, "stepAction", stepAction, false);
            appendJsonStringField(sb, "targetUrl", targetUrl, false);
            appendJsonStringField(sb, "state", state.name(), false);
            appendJsonStringField(sb, "pauseReason", pauseReason, false);
            appendJsonStringField(sb, "pauseGateKind", pauseGateKind, false);
            appendJsonStringField(sb, "errorCode", errorCode, false);
            appendJsonStringField(sb, "errorMessage", errorMessage, false);
            appendJsonLongField(sb, "attempt", attempt, false);
            appendJsonLongField(sb, "createdAtMs", createdAtMs, false);
            appendJsonLongField(sb, "updatedAtMs", updatedAtMs, false);
            sb.append('}');
            return sb.toString();
        }

        static RunContext fromJsonString(String raw) {
            if (raw == null || raw.trim().isEmpty()) {
                return null;
            }
            Map<String, String> parsed = parseFlatJsonObject(raw);
            if (parsed.isEmpty() || !parsed.containsKey("state")) {
                return null;
            }
            return new RunContext(
                parsed.getOrDefault("runId", ""),
                parsed.getOrDefault("flowName", ""),
                (int) parseLongSafe(parsed.get("stepIndex"), 0L),
                parsed.getOrDefault("stepAction", ""),
                parsed.getOrDefault("targetUrl", ""),
                parseState(parsed.get("state")),
                parsed.getOrDefault("pauseReason", ""),
                parsed.getOrDefault("pauseGateKind", ""),
                parsed.getOrDefault("errorCode", ""),
                parsed.getOrDefault("errorMessage", ""),
                (int) parseLongSafe(parsed.get("attempt"), 0L),
                parseLongSafe(parsed.get("createdAtMs"), 0L),
                parseLongSafe(parsed.get("updatedAtMs"), 0L)
            );
        }
    }

    static final class LogEntry {
        final long timestampMs;
        final String runId;
        final int stepIndex;
        final String stepAction;
        final State fromState;
        final State toState;
        final long durationMs;
        final String reason;
        final String error;

        LogEntry(
                long timestampMs,
                String runId,
                int stepIndex,
                String stepAction,
                State fromState,
                State toState,
                long durationMs,
                String reason,
                String error) {
            this.timestampMs = timestampMs;
            this.runId = nn(runId);
            this.stepIndex = stepIndex;
            this.stepAction = nn(stepAction);
            this.fromState = fromState;
            this.toState = toState;
            this.durationMs = Math.max(0L, durationMs);
            this.reason = nn(reason);
            this.error = nn(error);
        }

        String toJsonString() {
            StringBuilder sb = new StringBuilder(192);
            sb.append('{');
            appendJsonLongField(sb, "timestampMs", timestampMs, true);
            appendJsonStringField(sb, "runId", runId, false);
            appendJsonLongField(sb, "stepIndex", stepIndex, false);
            appendJsonStringField(sb, "stepAction", stepAction, false);
            appendJsonStringField(sb, "fromState", fromState == null ? "" : fromState.name(), false);
            appendJsonStringField(sb, "toState", toState == null ? "" : toState.name(), false);
            appendJsonLongField(sb, "durationMs", durationMs, false);
            appendJsonStringField(sb, "reason", reason, false);
            appendJsonStringField(sb, "error", error, false);
            sb.append('}');
            return sb.toString();
        }
    }

    interface ContextPersistence {
        void save(String key, String json);

        String load(String key);

        void clear(String key);
    }

    static final class InMemoryPersistence implements ContextPersistence {
        private final Map<String, String> store = new LinkedHashMap<>();

        @Override
        public synchronized void save(String key, String json) {
            store.put(key, json);
        }

        @Override
        public synchronized String load(String key) {
            return store.get(key);
        }

        @Override
        public synchronized void clear(String key) {
            store.remove(key);
        }
    }

    interface LogSink {
        void append(LogEntry entry);

        List<LogEntry> recent(int limit);
    }

    static final class RingBufferLogSink implements LogSink {
        private static final int MAX_ENTRIES = 200;
        private final Deque<LogEntry> ring = new ArrayDeque<>(MAX_ENTRIES);

        @Override
        public synchronized void append(LogEntry entry) {
            if (entry == null) return;
            ring.addLast(entry);
            while (ring.size() > MAX_ENTRIES) {
                ring.removeFirst();
            }
        }

        @Override
        public synchronized List<LogEntry> recent(int limit) {
            int cap = Math.max(1, Math.min(MAX_ENTRIES, limit));
            List<LogEntry> all = new ArrayList<>(ring);
            if (all.size() <= cap) {
                return Collections.unmodifiableList(all);
            }
            return Collections.unmodifiableList(new ArrayList<>(all.subList(all.size() - cap, all.size())));
        }
    }

    private static final ExecutionStateMachine SHARED = new ExecutionStateMachine(
        new InMemoryPersistence(),
        new RingBufferLogSink(),
        CompanionEventBus.shared(),
        CompanionFeatureFlags.shared()
    );

    private ContextPersistence persistence;
    private LogSink logSink;
    private CompanionEventBus eventBus;
    private CompanionFeatureFlags featureFlags;
    private RunContext current;

    ExecutionStateMachine(
            ContextPersistence persistence,
            LogSink logSink,
            CompanionEventBus eventBus,
            CompanionFeatureFlags featureFlags) {
        this.persistence = persistence == null ? new InMemoryPersistence() : persistence;
        this.logSink = logSink == null ? new RingBufferLogSink() : logSink;
        this.eventBus = eventBus;
        this.featureFlags = featureFlags == null ? CompanionFeatureFlags.shared() : featureFlags;
        this.current = RunContext.idle(System.currentTimeMillis());
        restoreFromPersistence();
    }

    static ExecutionStateMachine shared() {
        return SHARED;
    }

    synchronized void attachPersistence(ContextPersistence newPersistence, LogSink newLogSink, CompanionEventBus bus) {
        if (newPersistence != null) {
            this.persistence = newPersistence;
        }
        if (newLogSink != null) {
            this.logSink = newLogSink;
        }
        if (bus != null) {
            this.eventBus = bus;
        }
        restoreFromPersistence();
    }

    synchronized RunContext getContext() {
        return current;
    }

    synchronized RunContext restoreFromPersistence() {
        String raw = persistence.load(DEFAULT_PERSIST_KEY);
        RunContext restored = RunContext.fromJsonString(raw);
        if (restored != null) {
            current = restored;
        }
        return current;
    }

    synchronized RunContext startRun(
            String runId,
            String flowName,
            String targetUrl,
            int stepIndex,
            String stepAction,
            long nowMs) {
        if (runId == null || runId.trim().isEmpty()) {
            throw new IllegalArgumentException("runId must not be empty");
        }
        if (current.state == State.RUNNING || current.state == State.AWAITING_USER || current.state == State.RESUMING) {
            throw new IllegalStateException("Cannot startRun while active in state " + current.state);
        }
        State prev = current.state;
        long dur = current.updatedAtMs > 0 ? Math.max(0L, nowMs - current.updatedAtMs) : 0L;
        current = new RunContext(
            runId.trim(), flowName, stepIndex, stepAction, targetUrl,
            State.RUNNING, "", "", "", "", 1, nowMs, nowMs
        );
        commitTransition(prev, dur, "run_started", "", nowMs, "hitl_state_changed");
        return current;
    }

    synchronized RunContext advanceStep(int stepIndex, String stepAction, String targetUrl, long nowMs) {
        if (current.state != State.RUNNING) {
            throw new IllegalStateException("advanceStep requires RUNNING state, was " + current.state);
        }
        long dur = Math.max(0L, nowMs - current.updatedAtMs);
        String nextUrl = (targetUrl == null || targetUrl.isEmpty()) ? current.targetUrl : targetUrl;
        current = new RunContext(
            current.runId, current.flowName, stepIndex, stepAction, nextUrl,
            State.RUNNING, "", "", "", "", current.attempt, current.createdAtMs, nowMs
        );
        commitTransition(State.RUNNING, dur, "step_advanced", "", nowMs, "hitl_state_changed");
        return current;
    }

    synchronized RunContext pauseForUser(String reason, HumanGateDetector.GateKind gateKind, String targetUrl, long nowMs) {
        if (current.state != State.RUNNING && current.state != State.RESUMING) {
            throw new IllegalStateException("pauseForUser requires RUNNING or RESUMING, was " + current.state);
        }
        State prev = current.state;
        long dur = Math.max(0L, nowMs - current.updatedAtMs);
        String nextUrl = (targetUrl == null || targetUrl.isEmpty()) ? current.targetUrl : targetUrl;
        String gateName = gateKind == null ? HumanGateDetector.GateKind.NONE.name() : gateKind.name();
        String safeReason = (reason == null || reason.isEmpty()) ? "User action required" : reason;
        current = new RunContext(
            current.runId, current.flowName, current.stepIndex, current.stepAction, nextUrl,
            State.AWAITING_USER, safeReason, gateName, "", "", current.attempt, current.createdAtMs, nowMs
        );
        commitTransition(prev, dur, safeReason, "", nowMs, "hitl_awaiting_user");
        return current;
    }

    synchronized RunContext beginResume(long nowMs) {
        if (current.state != State.AWAITING_USER) {
            throw new IllegalStateException("beginResume requires AWAITING_USER, was " + current.state);
        }
        long dur = Math.max(0L, nowMs - current.updatedAtMs);
        current = new RunContext(
            current.runId, current.flowName, current.stepIndex, current.stepAction, current.targetUrl,
            State.RESUMING, "", current.pauseGateKind, "", "", current.attempt + 1, current.createdAtMs, nowMs
        );
        commitTransition(State.AWAITING_USER, dur, "user_resume_initiated", "", nowMs, "hitl_resumed");
        return current;
    }

    synchronized RunContext markRunningAfterResume(long nowMs) {
        if (current.state != State.RESUMING) {
            throw new IllegalStateException("markRunningAfterResume requires RESUMING, was " + current.state);
        }
        long dur = Math.max(0L, nowMs - current.updatedAtMs);
        current = new RunContext(
            current.runId, current.flowName, current.stepIndex, current.stepAction, current.targetUrl,
            State.RUNNING, "", "", "", "", current.attempt, current.createdAtMs, nowMs
        );
        commitTransition(State.RESUMING, dur, "resumed_to_running", "", nowMs, "hitl_state_changed");
        return current;
    }

    synchronized RunContext complete(long nowMs) {
        if (current.state != State.RUNNING && current.state != State.RESUMING) {
            throw new IllegalStateException("complete requires RUNNING or RESUMING, was " + current.state);
        }
        State prev = current.state;
        long dur = Math.max(0L, nowMs - current.updatedAtMs);
        current = new RunContext(
            current.runId, current.flowName, current.stepIndex, current.stepAction, current.targetUrl,
            State.COMPLETED, "", "", "", "", current.attempt, current.createdAtMs, nowMs
        );
        commitTransition(prev, dur, "run_completed", "", nowMs, "hitl_state_changed");
        return current;
    }

    synchronized RunContext fail(String errorCode, String errorMessage, long nowMs) {
        if (current.state == State.IDLE || current.state == State.COMPLETED || current.state == State.FAILED) {
            throw new IllegalStateException("fail not valid from state " + current.state);
        }
        State prev = current.state;
        long dur = Math.max(0L, nowMs - current.updatedAtMs);
        String code = (errorCode == null || errorCode.isEmpty()) ? "execution_error" : errorCode;
        current = new RunContext(
            current.runId, current.flowName, current.stepIndex, current.stepAction, current.targetUrl,
            State.FAILED, current.pauseReason, current.pauseGateKind, code, nn(errorMessage),
            current.attempt, current.createdAtMs, nowMs
        );
        commitTransition(prev, dur, code, nn(errorMessage), nowMs, "hitl_state_changed");
        return current;
    }

    synchronized RunContext resetToIdle(long nowMs) {
        State prev = current.state;
        long dur = current.updatedAtMs > 0 ? Math.max(0L, nowMs - current.updatedAtMs) : 0L;
        String prevRunId = current.runId;
        int prevStep = current.stepIndex;
        String prevAction = current.stepAction;
        current = RunContext.idle(nowMs);
        persistence.clear(DEFAULT_PERSIST_KEY);
        if (featureFlags == null || featureFlags.isEnabled(CompanionFeatureFlags.FLAG_STRUCTURED_LOGGING)) {
            logSink.append(new LogEntry(nowMs, prevRunId, prevStep, prevAction, prev, State.IDLE, dur, "reset", ""));
        }
        emitEvent("hitl_state_changed", State.IDLE, "reset", nowMs);
        return current;
    }

    synchronized List<LogEntry> recentLogs(int limit) {
        return logSink.recent(limit);
    }

    private void commitTransition(
            State fromState,
            long durationMs,
            String reason,
            String error,
            long nowMs,
            String eventType) {
        persistence.save(DEFAULT_PERSIST_KEY, current.toJsonString());
        if (featureFlags == null || featureFlags.isEnabled(CompanionFeatureFlags.FLAG_STRUCTURED_LOGGING)) {
            logSink.append(new LogEntry(
                nowMs, current.runId, current.stepIndex, current.stepAction,
                fromState, current.state, durationMs, reason, error
            ));
        }
        emitEvent(eventType, current.state, reason, nowMs);
    }

    private void emitEvent(String eventType, State state, String reason, long nowMs) {
        if (eventBus == null) return;
        String detail = "runId=" + current.runId + ";state=" + state.name()
            + ";step=" + current.stepIndex + ";reason=" + nn(reason);
        eventBus.recordAt(eventType, "com.autamedica.companion", detail, false, nowMs);
    }

    private static String nn(String value) {
        return value == null ? "" : value;
    }

    private static long parseLongSafe(String raw, long fallback) {
        if (raw == null || raw.isEmpty()) return fallback;
        try {
            return Long.parseLong(raw.trim());
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static void appendJsonStringField(StringBuilder sb, String key, String value, boolean first) {
        if (!first) sb.append(',');
        sb.append('"').append(escapeJson(key)).append("\":\"").append(escapeJson(value)).append('"');
    }

    private static void appendJsonLongField(StringBuilder sb, String key, long value, boolean first) {
        if (!first) sb.append(',');
        sb.append('"').append(escapeJson(key)).append("\":").append(value);
    }

    static String escapeJson(String s) {
        if (s == null || s.isEmpty()) return "";
        StringBuilder out = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\b': out.append("\\b"); break;
                case '\f': out.append("\\f"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        out.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
            }
        }
        return out.toString();
    }

    /** Minimal pure-Java flat JSON object parser so RunContext needs no android/org.json dependency. */
    static Map<String, String> parseFlatJsonObject(String json) {
        Map<String, String> out = new LinkedHashMap<>();
        if (json == null) return out;
        String s = json.trim();
        if (s.length() < 2 || s.charAt(0) != '{' || s.charAt(s.length() - 1) != '}') {
            return out;
        }
        int i = 1;
        int n = s.length() - 1;
        while (i < n) {
            while (i < n && (Character.isWhitespace(s.charAt(i)) || s.charAt(i) == ',')) i++;
            if (i >= n || s.charAt(i) != '"') break;
            int[] next = new int[1];
            String key = readJsonString(s, i, next);
            i = next[0];
            while (i < n && Character.isWhitespace(s.charAt(i))) i++;
            if (i >= n || s.charAt(i) != ':') break;
            i++;
            while (i < n && Character.isWhitespace(s.charAt(i))) i++;
            if (i >= n) break;
            if (s.charAt(i) == '"') {
                String val = readJsonString(s, i, next);
                i = next[0];
                out.put(key, val);
            } else {
                int start = i;
                while (i < n && s.charAt(i) != ',' && s.charAt(i) != '}') i++;
                String token = s.substring(start, i).trim();
                out.put(key, "null".equals(token) ? "" : token);
            }
        }
        return out;
    }

    private static String readJsonString(String s, int quoteIdx, int[] nextOut) {
        StringBuilder sb = new StringBuilder();
        int i = quoteIdx + 1;
        int n = s.length();
        while (i < n) {
            char c = s.charAt(i++);
            if (c == '"') {
                nextOut[0] = i;
                return sb.toString();
            }
            if (c == '\\' && i < n) {
                char esc = s.charAt(i++);
                switch (esc) {
                    case '"': sb.append('"'); break;
                    case '\\': sb.append('\\'); break;
                    case '/': sb.append('/'); break;
                    case 'b': sb.append('\b'); break;
                    case 'f': sb.append('\f'); break;
                    case 'n': sb.append('\n'); break;
                    case 'r': sb.append('\r'); break;
                    case 't': sb.append('\t'); break;
                    case 'u':
                        if (i + 4 <= n) {
                            sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                            i += 4;
                        }
                        break;
                    default: sb.append(esc); break;
                }
            } else {
                sb.append(c);
            }
        }
        nextOut[0] = i;
        return sb.toString();
    }
}
