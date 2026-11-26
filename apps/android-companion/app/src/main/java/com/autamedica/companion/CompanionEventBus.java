package com.autamedica.companion;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Thread-safe, lock/condition-backed reactive event bus for Accessibility & Notification events.
 * Replaces blind 250-400 ms polling loops with instant wake-up signaling and tracks monotonic
 * UI generation numbers for transactional snapshot validation.
 */
final class CompanionEventBus {
    private static final int MAX_EVENTS = 250;
    private static final long CONTENT_DEBOUNCE_MS = 35L;
    private static final CompanionEventBus SHARED = new CompanionEventBus();

    static final class Event {
        final long seq;
        final long generation;
        final long timestampMs;
        final String type;
        final String packageName;
        final String detail;

        Event(long seq, long generation, long timestampMs, String type, String packageName, String detail) {
            this.seq = seq;
            this.generation = generation;
            this.timestampMs = timestampMs;
            this.type = type;
            this.packageName = packageName;
            this.detail = detail;
        }
    }

    private final ReentrantLock lock = new ReentrantLock();
    private final Condition eventAvailable = lock.newCondition();
    private final Deque<Event> ring = new ArrayDeque<>(MAX_EVENTS);
    private long seq = 0L;
    private long generation = 0L;
    private String currentPackage = "";
    private long lastContentEventMs = 0L;

    static CompanionEventBus shared() {
        return SHARED;
    }

    long getLatestSeq() {
        lock.lock();
        try {
            return seq;
        } finally {
            lock.unlock();
        }
    }

    long getGeneration() {
        lock.lock();
        try {
            return generation;
        } finally {
            lock.unlock();
        }
    }

    String getCurrentPackage() {
        lock.lock();
        try {
            return currentPackage;
        } finally {
            lock.unlock();
        }
    }

    Event record(String type, String packageName, String detail, boolean bumpGeneration) {
        return recordAt(type, packageName, detail, bumpGeneration, System.currentTimeMillis());
    }

    Event recordAt(String type, String packageName, String detail, boolean bumpGeneration, long nowMs) {
        String safeType = type == null ? "unknown" : type;
        String safePkg = packageName == null ? "" : packageName;
        String safeDetail = detail == null ? "" : (detail.length() > 300 ? detail.substring(0, 300) : detail);

        lock.lock();
        try {
            seq++;
            if (bumpGeneration) {
                generation++;
            }
            if ("window_state_changed".equals(safeType) && !safePkg.isEmpty()) {
                currentPackage = safePkg;
            }
            Event event = new Event(seq, generation, nowMs, safeType, safePkg, safeDetail);
            ring.addLast(event);
            while (ring.size() > MAX_EVENTS) {
                ring.removeFirst();
            }
            eventAvailable.signalAll();
            return event;
        } finally {
            lock.unlock();
        }
    }

    /**
     * Records a debounced window_content_changed signal. Even when coalesced within the
     * debounce window, it still bumps generation and wakes any waiting threads.
     */
    void recordContentChanged(String packageName) {
        recordContentChangedAt(packageName, System.currentTimeMillis());
    }

    void recordContentChangedAt(String packageName, long nowMs) {
        String safePkg = packageName == null ? "" : packageName;
        lock.lock();
        try {
            generation++;
            if (nowMs - lastContentEventMs >= CONTENT_DEBOUNCE_MS) {
                lastContentEventMs = nowMs;
                seq++;
                Event event = new Event(seq, generation, nowMs, "window_content_changed", safePkg, "");
                ring.addLast(event);
                while (ring.size() > MAX_EVENTS) {
                    ring.removeFirst();
                }
            }
            eventAvailable.signalAll();
        } finally {
            lock.unlock();
        }
    }

    List<Event> recent(long sinceSeq, int limit, Set<String> types, String packageFilter) {
        int cap = Math.max(1, Math.min(MAX_EVENTS, limit));
        String pkgNeedle = packageFilter == null ? "" : packageFilter.trim();
        lock.lock();
        try {
            List<Event> matched = new ArrayList<>();
            for (Event ev : ring) {
                if (ev.seq <= sinceSeq) continue;
                if (types != null && !types.isEmpty() && !types.contains(ev.type)) continue;
                if (!pkgNeedle.isEmpty() && !pkgNeedle.equals(ev.packageName)) continue;
                matched.add(ev);
            }
            if (matched.size() > cap) {
                return new ArrayList<>(matched.subList(matched.size() - cap, matched.size()));
            }
            return matched;
        } finally {
            lock.unlock();
        }
    }

    /**
     * Blocks efficiently until a matching event with seq > sinceSeq arrives or timeoutMs expires.
     */
    Event awaitEvent(long sinceSeq, Set<String> types, String packageFilter, String textContains, long timeoutMs)
            throws InterruptedException {
        long clampedMs = Math.max(0L, Math.min(30_000L, timeoutMs));
        long remainingNanos = TimeUnit.MILLISECONDS.toNanos(clampedMs);
        String pkgNeedle = packageFilter == null ? "" : packageFilter.trim();
        String textNeedle = textContains == null ? "" : textContains.trim().toLowerCase(Locale.ROOT);

        lock.lock();
        try {
            while (true) {
                for (Event ev : ring) {
                    if (ev.seq <= sinceSeq) continue;
                    if (types != null && !types.isEmpty() && !types.contains(ev.type)) continue;
                    if (!pkgNeedle.isEmpty() && !pkgNeedle.equals(ev.packageName)) continue;
                    if (!textNeedle.isEmpty() && !ev.detail.toLowerCase(Locale.ROOT).contains(textNeedle)) continue;
                    return ev;
                }
                if (remainingNanos <= 0L) return null;
                remainingNanos = eventAvailable.awaitNanos(remainingNanos);
            }
        } finally {
            lock.unlock();
        }
    }

    /**
     * Waits for any UI generation bump (> sinceGeneration) up to timeoutMs.
     * Returns true if a UI change occurred before timeout.
     */
    boolean awaitUiGenerationChange(long sinceGeneration, long timeoutMs) throws InterruptedException {
        long clampedMs = Math.max(0L, Math.min(15_000L, timeoutMs));
        long remainingNanos = TimeUnit.MILLISECONDS.toNanos(clampedMs);
        lock.lock();
        try {
            while (generation <= sinceGeneration) {
                if (remainingNanos <= 0L) return false;
                remainingNanos = eventAvailable.awaitNanos(remainingNanos);
            }
            return true;
        } finally {
            lock.unlock();
        }
    }

    void resetForTest() {
        lock.lock();
        try {
            ring.clear();
            seq = 0L;
            generation = 0L;
            currentPackage = "";
            lastContentEventMs = 0L;
        } finally {
            lock.unlock();
        }
    }

    static Set<String> parseTypes(String csv) {
        if (csv == null || csv.trim().isEmpty()) return Collections.emptySet();
        java.util.HashSet<String> out = new java.util.HashSet<>();
        for (String part : csv.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) out.add(trimmed);
        }
        return out;
    }
}
