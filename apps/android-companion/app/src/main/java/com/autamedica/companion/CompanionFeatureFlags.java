package com.autamedica.companion;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Runtime-configurable feature flags controlling HITL state machine, passive gate detection,
 * notifications, session persistence, API-first routing, self-healing, and structured logging.
 */
final class CompanionFeatureFlags {
    static final String FLAG_HITL_STATE_MACHINE = "hitl_state_machine";
    static final String FLAG_PASSIVE_GATE_DETECTION = "passive_gate_detection";
    static final String FLAG_HITL_NOTIFICATIONS = "hitl_notifications";
    static final String FLAG_SESSION_PERSISTENCE_V2 = "session_persistence_v2";
    static final String FLAG_API_FIRST_ROUTING = "api_first_routing";
    static final String FLAG_SELF_HEALING_RESOLVER = "self_healing_resolver";
    static final String FLAG_STRUCTURED_LOGGING = "structured_run_logging";

    interface Storage {
        Map<String, Boolean> loadAll();

        void save(String key, boolean value);
    }

    static final class InMemoryStorage implements Storage {
        private final Map<String, Boolean> data = new LinkedHashMap<>();

        @Override
        public synchronized Map<String, Boolean> loadAll() {
            return new LinkedHashMap<>(data);
        }

        @Override
        public synchronized void save(String key, boolean value) {
            data.put(key, value);
        }
    }

    private static final Map<String, Boolean> DEFAULTS;
    static {
        Map<String, Boolean> m = new LinkedHashMap<>();
        m.put(FLAG_HITL_STATE_MACHINE, Boolean.TRUE);
        m.put(FLAG_PASSIVE_GATE_DETECTION, Boolean.TRUE);
        m.put(FLAG_HITL_NOTIFICATIONS, Boolean.TRUE);
        m.put(FLAG_SESSION_PERSISTENCE_V2, Boolean.TRUE);
        m.put(FLAG_API_FIRST_ROUTING, Boolean.TRUE);
        m.put(FLAG_SELF_HEALING_RESOLVER, Boolean.TRUE);
        m.put(FLAG_STRUCTURED_LOGGING, Boolean.TRUE);
        DEFAULTS = Collections.unmodifiableMap(m);
    }

    private static final CompanionFeatureFlags SHARED = new CompanionFeatureFlags(new InMemoryStorage());

    private final Map<String, Boolean> values = new LinkedHashMap<>(DEFAULTS);
    private Storage storage;

    CompanionFeatureFlags(Storage storage) {
        this.storage = storage == null ? new InMemoryStorage() : storage;
        reloadFromStorage();
    }

    static CompanionFeatureFlags shared() {
        return SHARED;
    }

    synchronized void attachStorage(Storage newStorage) {
        if (newStorage == null) {
            throw new IllegalArgumentException("storage must not be null");
        }
        this.storage = newStorage;
        reloadFromStorage();
    }

    synchronized void reloadFromStorage() {
        values.clear();
        values.putAll(DEFAULTS);
        Map<String, Boolean> persisted = storage.loadAll();
        if (persisted != null) {
            for (Map.Entry<String, Boolean> entry : persisted.entrySet()) {
                if (entry.getKey() != null && entry.getValue() != null && DEFAULTS.containsKey(entry.getKey())) {
                    values.put(entry.getKey(), entry.getValue());
                }
            }
        }
    }

    synchronized boolean isEnabled(String key) {
        if (key == null) return false;
        Boolean current = values.get(key);
        if (current != null) return current;
        Boolean def = DEFAULTS.get(key);
        return def != null && def;
    }

    synchronized boolean isKnownFlag(String key) {
        return key != null && DEFAULTS.containsKey(key);
    }

    synchronized void setEnabled(String key, boolean enabled) {
        if (!isKnownFlag(key)) {
            throw new IllegalArgumentException("Unknown feature flag: " + key);
        }
        values.put(key, enabled);
        storage.save(key, enabled);
    }

    synchronized Map<String, Boolean> snapshot() {
        return Collections.unmodifiableMap(new LinkedHashMap<>(values));
    }

    synchronized void resetToDefaults() {
        values.clear();
        values.putAll(DEFAULTS);
        for (Map.Entry<String, Boolean> entry : DEFAULTS.entrySet()) {
            storage.save(entry.getKey(), entry.getValue());
        }
    }
}
