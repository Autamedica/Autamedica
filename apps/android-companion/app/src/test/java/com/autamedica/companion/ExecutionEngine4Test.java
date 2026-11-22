package com.autamedica.companion;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;

/**
 * Unit tests for Companion Execution Engine 4.0 core primitives:
 * - Transactional SnapshotRegistry (snapshot_id + ref + expected_package + fingerprint drift)
 * - Reactive CompanionEventBus (instant condition wake-up + debounce + monotonic generation)
 */
public class ExecutionEngine4Test {

    @Test
    public void snapshotResolvesValidRefAndRejectsWrongPackage() {
        SnapshotRegistry reg = new SnapshotRegistry(30_000L);
        SnapshotRegistry.NodeEntry btn = new SnapshotRegistry.NodeEntry(
            "e1", "0.1.2", "Button", "com.autamedica.android:id/btn_confirm",
            "Confirmar", "", "", new int[]{100, 200, 400, 300}, true, false, false
        );
        SnapshotRegistry.Snapshot snap = reg.recordAt("com.autamedica.android", 10L, Collections.singletonList(btn), 1000L);

        SnapshotRegistry.Resolution ok = reg.resolveAt(snap.snapshotId, "e1", "com.autamedica.android", "com.autamedica.android", 10L, true, 1500L);
        assertTrue(ok.ok);
        assertEquals("0.1.2", ok.entry.path);

        // User switched to LinkedIn -> MUST reject with package_mismatch (0 wrong taps)
        SnapshotRegistry.Resolution wrongPkg = reg.resolveAt(snap.snapshotId, "e1", "com.autamedica.android", "com.linkedin.android", 11L, false, 1600L);
        assertFalse(wrongPkg.ok);
        assertEquals("package_mismatch", wrongPkg.reason);
        assertEquals("com.linkedin.android", wrongPkg.actualPackage);

        // Even without explicit expected_package, snapshot's own package guard blocks wrong foreground app
        SnapshotRegistry.Resolution implicitGuard = reg.resolveAt(snap.snapshotId, "e1", null, "com.termux", 11L, false, 1600L);
        assertFalse(implicitGuard.ok);
        assertEquals("package_mismatch", implicitGuard.reason);
    }

    @Test
    public void snapshotRejectsStaleGenerationExpiredAndMissingRef() {
        SnapshotRegistry reg = new SnapshotRegistry(5_000L);
        SnapshotRegistry.NodeEntry btn = new SnapshotRegistry.NodeEntry(
            "e1", "0.2", "Button", "", "Guardar", "", "", new int[]{0, 0, 100, 50}, true, false, false
        );
        SnapshotRegistry.Snapshot snap = reg.recordAt("com.autamedica.android", 42L, Collections.singletonList(btn), 10_000L);

        // Strict generation mismatch
        SnapshotRegistry.Resolution stale = reg.resolveAt(snap.snapshotId, "e1", "com.autamedica.android", "com.autamedica.android", 43L, true, 10_500L);
        assertFalse(stale.ok);
        assertEquals("stale_snapshot", stale.reason);

        // Non-strict allows newer generation when same package (live fingerprint checked separately)
        SnapshotRegistry.Resolution relaxed = reg.resolveAt(snap.snapshotId, "e1", "com.autamedica.android", "com.autamedica.android", 43L, false, 10_500L);
        assertTrue(relaxed.ok);

        // Expired snapshot
        SnapshotRegistry.Resolution expired = reg.resolveAt(snap.snapshotId, "e1", "com.autamedica.android", "com.autamedica.android", 42L, false, 16_000L);
        assertFalse(expired.ok);
        assertEquals("snapshot_expired", expired.reason);

        // Unknown ref
        SnapshotRegistry.Resolution missingRef = reg.resolveAt(snap.snapshotId, "e99", "com.autamedica.android", "com.autamedica.android", 42L, false, 10_500L);
        assertFalse(missingRef.ok);
        assertEquals("ref_not_found", missingRef.reason);

        // Unknown snapshot id
        SnapshotRegistry.Resolution missingSnap = reg.resolveAt("snap-999-g0", "e1", "com.autamedica.android", "com.autamedica.android", 42L, false, 10_500L);
        assertFalse(missingSnap.ok);
        assertEquals("snapshot_not_found", missingSnap.reason);
    }

    @Test
    public void nodeFingerprintDetectsDriftedControl() {
        SnapshotRegistry.NodeEntry expected = new SnapshotRegistry.NodeEntry(
            "e3", "0.1.4", "Button", "com.autamedica.android:id/pay",
            "Confirmar turno", "", "", new int[]{0, 0, 200, 80}, true, false, false
        );

        assertTrue(SnapshotRegistry.matchesFingerprint(expected, "Button", "com.autamedica.android:id/pay", "Confirmar turno", ""));
        assertFalse(SnapshotRegistry.matchesFingerprint(expected, "Button", "com.autamedica.android:id/delete", "Confirmar turno", ""));
        assertFalse(SnapshotRegistry.matchesFingerprint(expected, "EditText", "com.autamedica.android:id/pay", "Confirmar turno", ""));
        assertFalse(SnapshotRegistry.matchesFingerprint(expected, "Button", "com.autamedica.android:id/pay", "Cancelar cita", ""));

        // Editable fields allow text to change freely while keeping class/viewId match
        SnapshotRegistry.NodeEntry input = new SnapshotRegistry.NodeEntry(
            "e4", "0.1.5", "EditText", "com.autamedica.android:id/search",
            "", "", "Buscar", new int[]{0, 0, 200, 80}, true, true, false
        );
        assertTrue(SnapshotRegistry.matchesFingerprint(input, "EditText", "com.autamedica.android:id/search", "Cardiologia", ""));
    }

    @Test
    public void eventBusWakesWaiterReactivelyWithoutPolling() throws Exception {
        CompanionEventBus bus = new CompanionEventBus();
        long startSeq = bus.getLatestSeq();
        long startGen = bus.getGeneration();

        AtomicReference<CompanionEventBus.Event> received = new AtomicReference<>();
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(1);

        long t0 = System.nanoTime();
        Thread waiter = new Thread(() -> {
            started.countDown();
            try {
                CompanionEventBus.Event ev = bus.awaitEvent(
                    startSeq,
                    Collections.singleton("window_state_changed"),
                    "com.autamedica.android",
                    null,
                    3000L
                );
                received.set(ev);
            } catch (InterruptedException ignored) {
            } finally {
                done.countDown();
            }
        });
        waiter.start();
        assertTrue(started.await(1, TimeUnit.SECONDS));
        Thread.sleep(25);
        bus.record("window_state_changed", "com.autamedica.android", "MainActivity", true);

        assertTrue(done.await(1, TimeUnit.SECONDS));
        long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0);
        assertNotNull(received.get());
        assertEquals("com.autamedica.android", received.get().packageName);
        assertEquals(startGen + 1, bus.getGeneration());
        assertTrue("Reactive wake-up should finish well under 500ms, got " + elapsedMs + "ms", elapsedMs < 500L);
    }

    @Test
    public void eventBusDebouncesContentChangesWhileStillBumpingGeneration() {
        CompanionEventBus bus = new CompanionEventBus();
        bus.recordContentChangedAt("com.autamedica.android", 1000L);
        bus.recordContentChangedAt("com.autamedica.android", 1005L);
        bus.recordContentChangedAt("com.autamedica.android", 1010L);
        bus.recordContentChangedAt("com.autamedica.android", 1060L);

        assertEquals(4L, bus.getGeneration());
        List<CompanionEventBus.Event> events = bus.recent(0L, 10, Collections.singleton("window_content_changed"), null);
        assertEquals(2, events.size());
    }
}
