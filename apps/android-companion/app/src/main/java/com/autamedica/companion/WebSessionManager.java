package com.autamedica.companion;

import java.net.URI;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Coordinates durable WebView cookie flushing, encrypted URL restoration, and encrypted
 * per-service token storage without ever exposing raw cookies or tokens in status outputs.
 */
final class WebSessionManager {
    static final String KEY_LAST_URL = "browser.lastUrl";
    static final String KEY_SESSION_META = "browser.session.meta";
    private static final String TOKEN_PREFIX = "session.token.";

    interface Backend {
        void flushCookies();

        void putEncrypted(String key, String value) throws Exception;

        String getEncrypted(String key, String fallback);

        void deleteEncrypted(String key) throws Exception;
    }

    static final class InMemoryBackend implements Backend {
        private final Map<String, String> vault = new java.util.LinkedHashMap<>();
        int flushCount = 0;

        @Override
        public synchronized void flushCookies() {
            flushCount++;
        }

        @Override
        public synchronized void putEncrypted(String key, String value) {
            vault.put(key, value);
        }

        @Override
        public synchronized String getEncrypted(String key, String fallback) {
            return vault.getOrDefault(key, fallback);
        }

        @Override
        public synchronized void deleteEncrypted(String key) {
            vault.remove(key);
        }
    }

    static final class SessionSnapshot {
        final String lastUrl;
        final String lastOrigin;
        final long lastFlushedAtMs;
        final boolean hasRestorableSession;
        final int trackedOriginsCount;

        SessionSnapshot(
                String lastUrl,
                String lastOrigin,
                long lastFlushedAtMs,
                boolean hasRestorableSession,
                int trackedOriginsCount) {
            this.lastUrl = lastUrl == null ? "" : lastUrl;
            this.lastOrigin = lastOrigin == null ? "" : lastOrigin;
            this.lastFlushedAtMs = lastFlushedAtMs;
            this.hasRestorableSession = hasRestorableSession;
            this.trackedOriginsCount = trackedOriginsCount;
        }
    }

    private final Backend backend;
    private final Set<String> trackedOrigins = new LinkedHashSet<>();
    private String lastUrl = "";
    private String lastOrigin = "";
    private long lastFlushedAtMs = 0L;

    WebSessionManager(Backend backend) {
        if (backend == null) {
            throw new IllegalArgumentException("backend must not be null");
        }
        this.backend = backend;
        hydrateFromBackend();
    }

    synchronized void hydrateFromBackend() {
        String storedUrl = backend.getEncrypted(KEY_LAST_URL, "");
        if (isWebUrl(storedUrl)) {
            this.lastUrl = storedUrl;
            this.lastOrigin = extractOrigin(storedUrl);
            if (!this.lastOrigin.isEmpty()) {
                trackedOrigins.add(this.lastOrigin);
            }
        }
        String rawMeta = backend.getEncrypted(KEY_SESSION_META, "");
        if (!rawMeta.isEmpty()) {
            Map<String, String> meta = ExecutionStateMachine.parseFlatJsonObject(rawMeta);
            String origin = meta.getOrDefault("lastOrigin", "");
            if (!origin.isEmpty()) {
                this.lastOrigin = origin;
                trackedOrigins.add(origin);
            }
            String flushed = meta.get("lastFlushedAtMs");
            if (flushed != null && !flushed.isEmpty()) {
                try {
                    this.lastFlushedAtMs = Long.parseLong(flushed);
                } catch (NumberFormatException ignored) {}
            }
        }
    }

    synchronized void recordNavigation(String url, long nowMs) throws Exception {
        backend.flushCookies();
        this.lastFlushedAtMs = nowMs;
        if (isWebUrl(url)) {
            this.lastUrl = url;
            String origin = extractOrigin(url);
            if (!origin.isEmpty()) {
                this.lastOrigin = origin;
                trackedOrigins.add(origin);
            }
            backend.putEncrypted(KEY_LAST_URL, url);
            persistMeta(nowMs);
        }
    }

    synchronized void flushNow(long nowMs) throws Exception {
        backend.flushCookies();
        this.lastFlushedAtMs = nowMs;
        if (isWebUrl(this.lastUrl)) {
            persistMeta(nowMs);
        }
    }

    synchronized String restoreLastUrl(String fallbackUrl) {
        String persisted = backend.getEncrypted(KEY_LAST_URL, "");
        if (isWebUrl(persisted)) {
            this.lastUrl = persisted;
            return persisted;
        }
        return isWebUrl(this.lastUrl) ? this.lastUrl : fallbackUrl;
    }

    synchronized void storeServiceToken(String service, String token) throws Exception {
        String key = tokenKey(service);
        if (token == null || token.isEmpty()) {
            throw new IllegalArgumentException("token must not be empty");
        }
        backend.putEncrypted(key, token);
    }

    synchronized String readServiceToken(String service) {
        return backend.getEncrypted(tokenKey(service), null);
    }

    synchronized boolean hasServiceToken(String service) {
        String value = backend.getEncrypted(tokenKey(service), "");
        return value != null && !value.isEmpty();
    }

    synchronized void deleteServiceToken(String service) throws Exception {
        backend.deleteEncrypted(tokenKey(service));
    }

    synchronized SessionSnapshot getStatus() {
        String url = restoreLastUrl("");
        String origin = extractOrigin(url);
        if (origin.isEmpty()) {
            origin = this.lastOrigin;
        }
        return new SessionSnapshot(
            url,
            origin,
            lastFlushedAtMs,
            isWebUrl(url),
            trackedOrigins.size()
        );
    }

    private void persistMeta(long nowMs) throws Exception {
        String metaJson = "{\"lastOrigin\":\"" + ExecutionStateMachine.escapeJson(lastOrigin)
            + "\",\"lastFlushedAtMs\":" + nowMs
            + ",\"trackedOriginsCount\":" + trackedOrigins.size() + "}";
        backend.putEncrypted(KEY_SESSION_META, metaJson);
    }

    static String tokenKey(String service) {
        if (service == null || service.trim().isEmpty()) {
            throw new IllegalArgumentException("service name must not be empty");
        }
        String sanitized = service.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9._-]+", "_");
        if (sanitized.isEmpty() || sanitized.length() > 60) {
            throw new IllegalArgumentException("invalid service name");
        }
        return TOKEN_PREFIX + sanitized;
    }

    static boolean isWebUrl(String value) {
        return value != null && (value.startsWith("https://") || value.startsWith("http://"));
    }

    static String extractOrigin(String url) {
        if (!isWebUrl(url)) return "";
        try {
            URI uri = URI.create(url);
            if (uri.getScheme() == null || uri.getHost() == null) return "";
            int port = uri.getPort();
            return uri.getScheme().toLowerCase(Locale.ROOT) + "://" + uri.getHost().toLowerCase(Locale.ROOT)
                + (port > 0 ? ":" + port : "");
        } catch (Exception ignored) {
            return "";
        }
    }
}
