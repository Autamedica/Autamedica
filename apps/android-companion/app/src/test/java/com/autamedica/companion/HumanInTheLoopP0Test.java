package com.autamedica.companion;

import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * Unit & integration tests for Autamedica Android Companion P0 upgrades:
 * - HITL state machine (RUNNING -> AWAITING_USER -> RESUMING -> COMPLETED)
 * - Checkpoint & WebSession persistence across simulated restart
 * - Passive HumanGateDetector classification
 * - Runtime feature flag toggling without recompilation
 */
public class HumanInTheLoopP0Test {

    @Test
    public void stateMachineTransitionsRunningAwaitingUserResumingCompleted() {
        ExecutionStateMachine.InMemoryPersistence store = new ExecutionStateMachine.InMemoryPersistence();
        ExecutionStateMachine.RingBufferLogSink logs = new ExecutionStateMachine.RingBufferLogSink();
        CompanionEventBus bus = new CompanionEventBus();
        CompanionFeatureFlags flags = new CompanionFeatureFlags(new CompanionFeatureFlags.InMemoryStorage());

        ExecutionStateMachine sm = new ExecutionStateMachine(store, logs, bus, flags);
        assertEquals(ExecutionStateMachine.State.IDLE, sm.getContext().state);
        assertEquals(ExecutionStateMachine.State.AWAITING_USER, ExecutionStateMachine.parseState("WAITING_HUMAN_AUTH"));

        ExecutionStateMachine.RunContext started = sm.startRun(
            "run-001", "portal_sync", "https://doctor.autamedica.com", 0, "open_portal", 1000L
        );
        assertEquals(ExecutionStateMachine.State.RUNNING, started.state);
        assertEquals(1, started.attempt);

        ExecutionStateMachine.RunContext step1 = sm.advanceStep(1, "verify_session", "https://doctor.autamedica.com/auth", 1200L);
        assertEquals(1, step1.stepIndex);

        ExecutionStateMachine.RunContext paused = sm.pauseForUser(
            "2FA requerido", HumanGateDetector.GateKind.TWO_FACTOR_AUTH, "https://doctor.autamedica.com/2fa", 1500L
        );
        assertEquals(ExecutionStateMachine.State.AWAITING_USER, paused.state);
        assertEquals(1, paused.stepIndex);
        assertEquals("TWO_FACTOR_AUTH", paused.pauseGateKind);

        // Cannot complete directly while awaiting user without resuming
        try {
            sm.complete(1600L);
            fail("Expected IllegalStateException when completing from AWAITING_USER");
        } catch (IllegalStateException expected) {
            // expected
        }

        ExecutionStateMachine.RunContext resuming = sm.beginResume(2000L);
        assertEquals(ExecutionStateMachine.State.RESUMING, resuming.state);
        assertEquals(2, resuming.attempt);
        assertEquals(1, resuming.stepIndex);

        ExecutionStateMachine.RunContext runningAgain = sm.markRunningAfterResume(2100L);
        assertEquals(ExecutionStateMachine.State.RUNNING, runningAgain.state);

        ExecutionStateMachine.RunContext completed = sm.complete(2500L);
        assertEquals(ExecutionStateMachine.State.COMPLETED, completed.state);

        List<ExecutionStateMachine.LogEntry> entries = sm.recentLogs(10);
        assertEquals(6, entries.size());
        assertTrue(entries.get(2).toJsonString().contains("\"toState\":\"AWAITING_USER\""));

        List<CompanionEventBus.Event> events = bus.recent(0L, 10, null, null);
        assertEquals(6, events.size());
        assertEquals("hitl_awaiting_user", events.get(2).type);
        assertEquals("hitl_resumed", events.get(3).type);
    }

    @Test
    public void stateMachineAndSessionPersistAcrossSimulatedRestart() throws Exception {
        ExecutionStateMachine.InMemoryPersistence sharedStore = new ExecutionStateMachine.InMemoryPersistence();
        WebSessionManager.InMemoryBackend sharedVault = new WebSessionManager.InMemoryBackend();
        CompanionFeatureFlags flags = new CompanionFeatureFlags(new CompanionFeatureFlags.InMemoryStorage());

        // First process lifetime
        ExecutionStateMachine firstSm = new ExecutionStateMachine(
            sharedStore, new ExecutionStateMachine.RingBufferLogSink(), new CompanionEventBus(), flags
        );
        firstSm.startRun("run-restart-42", "farmalink_sync", "https://www.autamedica.com", 0, "load_home", 5000L);
        firstSm.advanceStep(2, "await_otp", "https://www.autamedica.com/2fa", 5500L);
        firstSm.pauseForUser("OTP SMS requerido", HumanGateDetector.GateKind.TWO_FACTOR_AUTH, "https://www.autamedica.com/2fa", 6000L);

        WebSessionManager firstSession = new WebSessionManager(sharedVault);
        firstSession.recordNavigation("https://www.autamedica.com/2fa", 6100L);
        firstSession.storeServiceToken("autamedica_api", "tok_secret_value_123");
        assertEquals(1, sharedVault.flushCount);

        // Simulated process restart: fresh instances reading from same persistent backing stores
        ExecutionStateMachine restartedSm = new ExecutionStateMachine(
            sharedStore, new ExecutionStateMachine.RingBufferLogSink(), new CompanionEventBus(), flags
        );
        ExecutionStateMachine.RunContext restored = restartedSm.getContext();
        assertEquals("run-restart-42", restored.runId);
        assertEquals(ExecutionStateMachine.State.AWAITING_USER, restored.state);
        assertEquals(2, restored.stepIndex);
        assertEquals("await_otp", restored.stepAction);
        assertEquals("https://www.autamedica.com/2fa", restored.targetUrl);
        assertEquals("OTP SMS requerido", restored.pauseReason);

        WebSessionManager restartedSession = new WebSessionManager(sharedVault);
        assertEquals("https://www.autamedica.com/2fa", restartedSession.restoreLastUrl("https://www.google.com"));
        assertTrue(restartedSession.hasServiceToken("autamedica_api"));
        assertEquals("tok_secret_value_123", restartedSession.readServiceToken("autamedica_api"));
        WebSessionManager.SessionSnapshot snap = restartedSession.getStatus();
        assertTrue(snap.hasRestorableSession);
        assertEquals("https://www.autamedica.com", snap.lastOrigin);

        // Resume cleanly after restart
        restartedSm.beginResume(7000L);
        restartedSm.markRunningAfterResume(7100L);
        restartedSm.complete(7500L);
        assertEquals(ExecutionStateMachine.State.COMPLETED, restartedSm.getContext().state);
    }

    @Test
    public void passiveGateDetectorClassifiesLogin2faVerificationAndNormalPages() {
        HumanGateDetector.GateSignal twoFa = HumanGateDetector.inspect(
            new HumanGateDetector.PageObservation(
                "https://portal.example.com/auth/2fa",
                "Verificación",
                "Ingresá el código de verificación enviado a tu teléfono",
                false,
                true,
                200
            )
        );
        assertTrue(twoFa.detected);
        assertEquals(HumanGateDetector.GateKind.TWO_FACTOR_AUTH, twoFa.kind);

        HumanGateDetector.GateSignal human = HumanGateDetector.inspect(
            new HumanGateDetector.PageObservation(
                "https://portal.example.com/cdn-cgi/challenge-platform",
                "Just a moment...",
                "Verify you are human before continuing",
                false,
                false,
                403
            )
        );
        assertTrue(human.detected);
        assertEquals(HumanGateDetector.GateKind.HUMAN_VERIFICATION, human.kind);

        HumanGateDetector.GateSignal login = HumanGateDetector.inspect(
            new HumanGateDetector.PageObservation(
                "https://doctor.autamedica.com/auth/login",
                "Iniciar sesión",
                "Email y contraseña",
                true,
                false,
                200
            )
        );
        assertTrue(login.detected);
        assertEquals(HumanGateDetector.GateKind.LOGIN_REQUIRED, login.kind);

        HumanGateDetector.GateSignal clear = HumanGateDetector.inspect(
            new HumanGateDetector.PageObservation(
                "https://doctor.autamedica.com/dashboard",
                "Panel Médico",
                "Turnos de hoy: 8 pacientes confirmados",
                false,
                false,
                200
            )
        );
        assertFalse(clear.detected);
        assertEquals(HumanGateDetector.GateKind.NONE, clear.kind);
    }

    @Test
    public void featureFlagsToggleWithoutRecompileAndPersist() {
        final Map<String, Boolean> persisted = new LinkedHashMap<>();
        CompanionFeatureFlags.Storage storage = new CompanionFeatureFlags.Storage() {
            @Override public Map<String, Boolean> loadAll() {
                return new LinkedHashMap<>(persisted);
            }

            @Override public void save(String key, boolean value) {
                persisted.put(key, value);
            }
        };

        CompanionFeatureFlags flags = new CompanionFeatureFlags(storage);
        assertTrue(flags.isEnabled(CompanionFeatureFlags.FLAG_API_FIRST_ROUTING));
        assertTrue(flags.isEnabled(CompanionFeatureFlags.FLAG_HITL_NOTIFICATIONS));

        flags.setEnabled(CompanionFeatureFlags.FLAG_API_FIRST_ROUTING, false);
        assertFalse(flags.isEnabled(CompanionFeatureFlags.FLAG_API_FIRST_ROUTING));

        // Reload in new instance
        CompanionFeatureFlags reloaded = new CompanionFeatureFlags(storage);
        assertFalse(reloaded.isEnabled(CompanionFeatureFlags.FLAG_API_FIRST_ROUTING));
        assertTrue(reloaded.isEnabled(CompanionFeatureFlags.FLAG_HITL_NOTIFICATIONS));
    }
}
