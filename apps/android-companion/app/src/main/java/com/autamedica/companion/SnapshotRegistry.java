package com.autamedica.companion;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Transactional UI Snapshot Registry for Companion Execution Engine 4.0.
 * Maps short semantic refs (e1..eN) inside a versioned snapshotId to tree paths and node
 * fingerprints, rejecting stale or wrong-package actions with structured conflict reasons.
 */
final class SnapshotRegistry {
    static final int MAX_SNAPSHOTS = 16;
    static final long DEFAULT_TTL_MS = 30_000L;

    static final class NodeEntry {
        final String ref;
        final String path;
        final String simpleClass;
        final String viewId;
        final String text;
        final String description;
        final String hint;
        final int[] bounds;
        final boolean clickable;
        final boolean editable;
        final boolean scrollable;

        NodeEntry(
                String ref,
                String path,
                String simpleClass,
                String viewId,
                String text,
                String description,
                String hint,
                int[] bounds,
                boolean clickable,
                boolean editable,
                boolean scrollable) {
            this.ref = ref;
            this.path = path;
            this.simpleClass = simpleClass == null ? "" : simpleClass;
            this.viewId = viewId == null ? "" : viewId;
            this.text = text == null ? "" : text;
            this.description = description == null ? "" : description;
            this.hint = hint == null ? "" : hint;
            this.bounds = bounds == null ? new int[]{0, 0, 0, 0} : bounds;
            this.clickable = clickable;
            this.editable = editable;
            this.scrollable = scrollable;
        }
    }

    static final class Snapshot {
        final String snapshotId;
        final String packageName;
        final long generation;
        final long capturedAtMs;
        final Map<String, NodeEntry> byRef;

        Snapshot(String snapshotId, String packageName, long generation, long capturedAtMs, Map<String, NodeEntry> byRef) {
            this.snapshotId = snapshotId;
            this.packageName = packageName == null ? "" : packageName;
            this.generation = generation;
            this.capturedAtMs = capturedAtMs;
            this.byRef = Collections.unmodifiableMap(byRef);
        }
    }

    static final class Resolution {
        final boolean ok;
        final String reason;
        final String message;
        final Snapshot snapshot;
        final NodeEntry entry;
        final String expectedPackage;
        final String actualPackage;

        private Resolution(
                boolean ok,
                String reason,
                String message,
                Snapshot snapshot,
                NodeEntry entry,
                String expectedPackage,
                String actualPackage) {
            this.ok = ok;
            this.reason = reason;
            this.message = message;
            this.snapshot = snapshot;
            this.entry = entry;
            this.expectedPackage = expectedPackage;
            this.actualPackage = actualPackage;
        }

        static Resolution success(Snapshot snapshot, NodeEntry entry, String actualPackage) {
            return new Resolution(true, "", "", snapshot, entry, snapshot.packageName, actualPackage);
        }

        static Resolution fail(String reason, String message, String expectedPackage, String actualPackage) {
            return new Resolution(false, reason, message, null, null, expectedPackage, actualPackage);
        }
    }

    private final long ttlMs;
    private long nextSeq = 0L;
    private String latestSnapshotId = null;
    private final LinkedHashMap<String, Snapshot> snapshots = new LinkedHashMap<String, Snapshot>(MAX_SNAPSHOTS + 2, 0.75f, false) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Snapshot> eldest) {
            return size() > MAX_SNAPSHOTS;
        }
    };

    SnapshotRegistry() {
        this(DEFAULT_TTL_MS);
    }

    SnapshotRegistry(long ttlMs) {
        this.ttlMs = Math.max(1000L, ttlMs);
    }

    synchronized Snapshot record(String packageName, long generation, List<NodeEntry> entries) {
        return recordAt(packageName, generation, entries, System.currentTimeMillis());
    }

    synchronized Snapshot recordAt(String packageName, long generation, List<NodeEntry> entries, long nowMs) {
        nextSeq++;
        String id = "snap-" + nextSeq + "-g" + generation;
        Map<String, NodeEntry> map = new LinkedHashMap<>();
        if (entries != null) {
            for (NodeEntry entry : entries) {
                if (entry != null && entry.ref != null && !entry.ref.isEmpty()) {
                    map.put(entry.ref, entry);
                }
            }
        }
        Snapshot snap = new Snapshot(id, packageName, generation, nowMs, map);
        snapshots.put(id, snap);
        latestSnapshotId = id;
        return snap;
    }

    synchronized Snapshot getLatest() {
        return latestSnapshotId == null ? null : snapshots.get(latestSnapshotId);
    }

    synchronized Resolution resolve(
            String snapshotId,
            String ref,
            String expectedPackage,
            String actualPackage,
            long currentGeneration,
            boolean strictGeneration) {
        return resolveAt(snapshotId, ref, expectedPackage, actualPackage, currentGeneration, strictGeneration, System.currentTimeMillis());
    }

    synchronized Resolution resolveAt(
            String snapshotId,
            String ref,
            String expectedPackage,
            String actualPackage,
            long currentGeneration,
            boolean strictGeneration,
            long nowMs) {
        String actual = actualPackage == null ? "" : actualPackage.trim();
        String expected = expectedPackage == null ? "" : expectedPackage.trim();

        if (!expected.isEmpty() && !expected.equals(actual)) {
            return Resolution.fail(
                "package_mismatch",
                "Expected foreground package '" + expected + "' but active package is '" + actual + "'",
                expected,
                actual
            );
        }

        String targetSnapId = (snapshotId == null || snapshotId.trim().isEmpty()) ? latestSnapshotId : snapshotId.trim();
        if (targetSnapId == null || targetSnapId.isEmpty()) {
            return Resolution.fail("snapshot_not_found", "No UI snapshot recorded yet; call /v1/ui/compact first", expected, actual);
        }

        Snapshot snap = snapshots.get(targetSnapId);
        if (snap == null) {
            return Resolution.fail("snapshot_not_found", "Unknown or evicted snapshot_id: " + targetSnapId, expected, actual);
        }

        if (nowMs - snap.capturedAtMs > ttlMs) {
            return Resolution.fail("snapshot_expired", "Snapshot '" + targetSnapId + "' expired", snap.packageName, actual);
        }

        if (!snap.packageName.isEmpty() && !actual.isEmpty() && !snap.packageName.equals(actual)) {
            return Resolution.fail(
                "package_mismatch",
                "Snapshot '" + targetSnapId + "' belongs to '" + snap.packageName + "' but active package is '" + actual + "'",
                snap.packageName,
                actual
            );
        }

        if (strictGeneration && currentGeneration != snap.generation) {
            return Resolution.fail(
                "stale_snapshot",
                "Snapshot generation " + snap.generation + " is stale (current generation: " + currentGeneration + ")",
                snap.packageName,
                actual
            );
        }

        String cleanRef = ref == null ? "" : ref.trim();
        NodeEntry entry = snap.byRef.get(cleanRef);
        if (entry == null) {
            return Resolution.fail("ref_not_found", "Ref '" + cleanRef + "' not found in snapshot '" + targetSnapId + "'", snap.packageName, actual);
        }

        return Resolution.success(snap, entry, actual);
    }

    /**
     * Checks whether a live AccessibilityNodeInfo still matches the recorded NodeEntry fingerprint
     * so we never click/edit a drifted element after an asynchronous screen redraw.
     */
    static boolean matchesFingerprint(
            NodeEntry expected,
            String actualSimpleClass,
            String actualViewId,
            String actualText,
            String actualDescription) {
        if (expected == null) return false;
        String cls = actualSimpleClass == null ? "" : actualSimpleClass;
        String vid = actualViewId == null ? "" : actualViewId;
        String txt = actualText == null ? "" : actualText.trim();
        String desc = actualDescription == null ? "" : actualDescription.trim();

        if (!expected.viewId.isEmpty() && !vid.isEmpty() && !expected.viewId.equals(vid)) {
            return false;
        }
        if (!expected.simpleClass.isEmpty() && !cls.isEmpty() && !expected.simpleClass.equals(cls)) {
            return false;
        }
        if (!expected.editable) {
            if (!expected.text.isEmpty() && !txt.isEmpty()) {
                String a = expected.text.toLowerCase(Locale.ROOT);
                String b = txt.toLowerCase(Locale.ROOT);
                if (!a.equals(b) && !a.contains(b) && !b.contains(a)) {
                    return false;
                }
            } else if (!expected.description.isEmpty() && !desc.isEmpty()) {
                String a = expected.description.toLowerCase(Locale.ROOT);
                String b = desc.toLowerCase(Locale.ROOT);
                if (!a.equals(b) && !a.contains(b) && !b.contains(a)) {
                    return false;
                }
            }
        }
        return true;
    }

    synchronized void clear() {
        snapshots.clear();
        latestSnapshotId = null;
        nextSeq = 0L;
    }
}
