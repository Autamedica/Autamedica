package com.autamedica.companion;

import android.accessibilityservice.AccessibilityService;
import android.os.SystemClock;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

final class LocalControlServer {
    private static final int PORT = BuildConfig.CONTROL_PORT;
    private static final int MAX_BODY = 1024 * 1024;
    private static final int MAX_KEEPALIVE_REQUESTS = 64;
    private static final ThreadLocal<Boolean> CURRENT_KEEP_ALIVE = new ThreadLocal<>();
    private final AccessibilityControlService service;
    private final ExecutorService clients = new ThreadPoolExecutor(
        4, 24, 60L, TimeUnit.SECONDS, new LinkedBlockingQueue<>(64)
    );
    private volatile boolean running;
    private ServerSocket serverSocket;

    LocalControlServer(AccessibilityControlService service) {
        this.service = service;
        initRuntimeSubsystems(service);
    }

    private static void initRuntimeSubsystems(AccessibilityControlService service) {
        if (service == null) return;
        final android.content.Context ctx = service.getApplicationContext();
        CompanionFeatureFlags.shared().attachStorage(new CompanionFeatureFlags.Storage() {
            private static final String PREFS = "companion_feature_flags";

            @Override public Map<String, Boolean> loadAll() {
                android.content.SharedPreferences sp = ctx.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
                Map<String, Boolean> out = new HashMap<>();
                for (Map.Entry<String, ?> entry : sp.getAll().entrySet()) {
                    if (entry.getValue() instanceof Boolean) {
                        out.put(entry.getKey(), (Boolean) entry.getValue());
                    }
                }
                return out;
            }

            @Override public void save(String key, boolean value) {
                ctx.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(key, value)
                    .apply();
            }
        });
        SqliteExecutionStore store = SqliteExecutionStore.getInstance(ctx);
        ExecutionStateMachine.shared().attachPersistence(store, store, service.getEventBus());
    }

    void start() {
        if (running) return;
        running = true;
        Thread acceptThread = new Thread(() -> {
            while (running) {
                try {
                    ServerSocket candidate = new ServerSocket();
                    candidate.setReuseAddress(true);
                    candidate.bind(new java.net.InetSocketAddress(InetAddress.getByName("127.0.0.1"), PORT), 32);
                    serverSocket = candidate;
                    while (running) {
                        Socket socket = candidate.accept();
                        clients.execute(() -> handle(socket));
                    }
                } catch (Exception error) {
                    if (running) {
                        android.util.Log.e("AutamedicaCompanion", "Local server listener failed; retrying", error);
                        try { Thread.sleep(1500); }
                        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); break; }
                    }
                } finally {
                    ServerSocket current = serverSocket;
                    serverSocket = null;
                    if (current != null) try { current.close(); } catch (Exception ignored) {}
                }
            }
        }, "autamedica-local-accept");
        acceptThread.setDaemon(true);
        acceptThread.start();
    }

    void stop() {
        running = false;
        try { if (serverSocket != null) serverSocket.close(); } catch (Exception ignored) {}
        clients.shutdownNow();
    }

    private void handle(Socket socket) {
        try (Socket client = socket) {
            client.setTcpNoDelay(true);
            client.setSoTimeout(30000);
            InputStream input = new BufferedInputStream(client.getInputStream(), 8192);
            OutputStream output = client.getOutputStream();
            for (int reqCount = 0; reqCount < MAX_KEEPALIVE_REQUESTS && running; reqCount++) {
                boolean keepAlive = handleSingleRequest(input, output, reqCount < MAX_KEEPALIVE_REQUESTS - 1);
                if (!keepAlive) break;
            }
        } catch (java.net.SocketTimeoutException ignored) {
            // Normal idle keep-alive close.
        } catch (Exception error) {
            android.util.Log.w("AutamedicaCompanion", "Local connection closed: " + error.getClass().getSimpleName());
        } finally {
            CURRENT_KEEP_ALIVE.remove();
        }
    }

    private boolean handleSingleRequest(InputStream input, OutputStream output, boolean allowKeepAlive) {
        boolean keepAlive = false;
        try {
            String requestLine = readLine(input);
            if (requestLine == null || requestLine.isEmpty()) return false;
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                CURRENT_KEEP_ALIVE.set(Boolean.FALSE);
                respond(output, 400, "application/json", jsonError("bad request"));
                return false;
            }
            String method = parts[0].toUpperCase(Locale.ROOT);
            String httpVersion = parts.length >= 3 ? parts[2].toUpperCase(Locale.ROOT) : "HTTP/1.1";
            String[] pathAndQuery = parts[1].split("\\?", 2);
            String path = pathAndQuery[0];
            Map<String, String> query = parseQuery(pathAndQuery.length > 1 ? pathAndQuery[1] : "");
            Map<String, String> headers = new HashMap<>();
            String line;
            while ((line = readLine(input)) != null && !line.isEmpty()) {
                int separator = line.indexOf(':');
                if (separator > 0) headers.put(line.substring(0, separator).trim().toLowerCase(Locale.ROOT),
                    line.substring(separator + 1).trim());
            }
            String connHeader = headers.getOrDefault("connection", "").toLowerCase(Locale.ROOT);
            keepAlive = allowKeepAlive && shouldKeepAlive(httpVersion, connHeader);
            CURRENT_KEEP_ALIVE.set(keepAlive);

            int contentLength = 0;
            try { contentLength = Integer.parseInt(headers.getOrDefault("content-length", "0")); }
            catch (NumberFormatException ignored) {}
            if (contentLength < 0 || contentLength > MAX_BODY) {
                CURRENT_KEEP_ALIVE.set(Boolean.FALSE);
                respond(output, 413, "application/json", jsonError("body too large"));
                return false;
            }
            byte[] body = readBytes(input, contentLength);

            String expected = SecureVault.get(service, "control_token", "");
            String supplied = headers.getOrDefault("authorization", "");
            if (expected.isEmpty() || !constantTimeEquals("Bearer " + expected, supplied)) {
                respond(output, 401, "application/json", jsonError("unauthorized"));
                return keepAlive;
            }

            dispatchRequest(method, path, query, body, output);
            return keepAlive;
        } catch (java.net.SocketTimeoutException timeout) {
            return false;
        } catch (Exception error) {
            android.util.Log.w("AutamedicaCompanion", "Local request failed: " + error.getClass().getSimpleName());
            try {
                CURRENT_KEEP_ALIVE.set(Boolean.FALSE);
                JSONObject errBody = new JSONObject()
                    .put("ok", false)
                    .put("error", error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
                respondJson(output, 500, errBody);
            } catch (Exception ignored) {}
            return false;
        }
    }

    static boolean shouldKeepAlive(String httpVersion, String connectionHeaderLower) {
        if (connectionHeaderLower != null && connectionHeaderLower.contains("close")) return false;
        if (connectionHeaderLower != null && connectionHeaderLower.contains("keep-alive")) return true;
        return httpVersion != null && httpVersion.contains("1.1");
    }

    private void dispatchRequest(
            String method,
            String path,
            Map<String, String> query,
            byte[] body,
            OutputStream output) throws Exception {
            if ("GET".equals(method) && "/v1/health".equals(path)) {
                JSONObject result = new JSONObject();
                result.put("ok", true);
                result.put("apiVersion", 8);
                result.put("versionName", BuildConfig.VERSION_NAME);
                result.put("engine", "Companion Execution Engine 6.0 (Low-Latency)");
                result.put("accessibility", true);
                result.put("bind", "127.0.0.1");
                result.put("port", PORT);
                result.put("cdpBind", "127.0.0.1");
                result.put("cdpPort", LocalCdpProxy.PORT);
                result.put("browserEngine", "Android System WebView / Chromium");
                result.put("internetPermission", true);
                result.put("browserActivityReady", BrowserActivity.isReady());
                result.put("cdpProxyListening", service.isCdpListening());
                result.put("webViewDevToolsSocketAvailable", service.isWebViewSocketAvailable());
                result.put("notificationListenerConnected", CompanionNotificationListener.isConnected());
                result.put("screenInteractive", service.isScreenInteractive());
                result.put("deviceLocked", service.isDeviceLocked());
                result.put("ignoringBatteryOptimizations", service.isIgnoringBatteryOptimizations());
                result.put("runtimeServiceRunning", CompanionRuntimeService.isRunning());
                result.put("eventBusSeq", service.getEventBus().getLatestSeq());
                result.put("uiGeneration", service.getEventBus().getGeneration());
                result.put("capabilities", new JSONArray()
                    .put("ui_deep").put("ui_compact").put("set_text").put("click_text")
                    .put("paste").put("batch").put("batch_v4").put("browser_snapshot")
                    .put("browser_state").put("browser_wait").put("browser_nav")
                    .put("runtime_control").put("screen_telemetry").put("guarded_global_actions")
                    .put("multi_display")
                    .put("http_keepalive").put("vault_memory_cache")
                    .put("fast_screenshot_webp").put("screenshot_cache")
                    .put("compose_deep_walk").put("viewport_filter")
                    .put("transactional_snapshot").put("scroll_path").put("scroll_until")
                    .put("ime_action").put("long_press").put("double_tap")
                    .put("wait_for_text").put("assert_package").put("event_bus")
                    .put("hitl_state_machine").put("sqlite_checkpoints")
                    .put("passive_gate_detection").put("session_persistence_v2")
                    .put("feature_flags").put("structured_run_logging"));
                respondJson(output, 200, result);
            } else if ("GET".equals(method) && "/v1/displays".equals(path)) {
                JSONObject result = new JSONObject();
                result.put("ok", true);
                result.put("displays", service.listDisplays());
                respondJson(output, 200, result);
            } else if ("GET".equals(method) && ("/v1/ui".equals(path) || "/v1/ui/compact".equals(path))) {
                boolean compact = "/v1/ui/compact".equals(path)
                    || "1".equals(query.get("compact"))
                    || "true".equalsIgnoreCase(query.get("compact"));
                int displayId = (int) parseLong(query.get("display_id"), 0L);
                boolean viewportOnly = "1".equals(query.get("viewport_only"))
                    || "true".equalsIgnoreCase(query.get("viewport_only"));
                JSONObject result = compact ? service.getCompactUi(displayId, viewportOnly) : service.getUiTree(displayId);
                respondJson(output, 200, result);
            } else if ("GET".equals(method) && "/v1/events/recent".equals(path)) {
                long sinceSeq = parseLong(query.get("since_seq"), 0L);
                int limit = (int) parseLong(query.get("limit"), 50L);
                Set<String> types = CompanionEventBus.parseTypes(query.get("types"));
                String pkg = query.getOrDefault("package", "");
                respondJson(output, 200, service.getRecentEvents(sinceSeq, limit, types, pkg));
            } else if ("GET".equals(method) && "/v1/browser/state".equals(path)) {
                respondJson(output, 200, BrowserActivity.getState());
            } else if ("GET".equals(method) && "/v1/browser/snapshot".equals(path)) {
                boolean includeHidden = "1".equals(query.get("all")) || "true".equalsIgnoreCase(query.get("all"));
                String snapScript = "(function(){"
                    + "const includeHidden=" + (includeHidden ? "true" : "false") + ";"
                    + "function uniqSel(e){"
                    + "if(e.id)return '#'+CSS.escape(e.id);"
                    + "const tid=e.getAttribute('data-testid')||e.getAttribute('data-test');"
                    + "if(tid)return '[data-testid=\"'+tid.replace(/\"/g,'\\\\\"')+'\"]';"
                    + "if(e.name&&document.querySelectorAll(e.tagName.toLowerCase()+'[name=\"'+e.name.replace(/\"/g,'\\\\\"')+'\"]').length===1)"
                    + "return e.tagName.toLowerCase()+'[name=\"'+e.name.replace(/\"/g,'\\\\\"')+'\"]';"
                    + "const parts=[];let cur=e;"
                    + "while(cur&&cur.nodeType===1&&parts.length<5){"
                    + "if(cur.id){parts.unshift('#'+CSS.escape(cur.id));break;}"
                    + "const tag=cur.tagName.toLowerCase();"
                    + "let idx=1,sib=cur;while((sib=sib.previousElementSibling)){if(sib.tagName===cur.tagName)idx++;}"
                    + "parts.unshift(tag+':nth-of-type('+idx+')');cur=cur.parentElement;"
                    + "}return parts.join(' > ');}"
                    + "const raw=[...document.querySelectorAll('input,textarea,select,button,a,[contenteditable=\"true\"],[role=button],[role=checkbox],[role=radio],[role=textbox],[role=combobox],[role=tab],[role=menuitem],[role=switch]')];"
                    + "const out=[];"
                    + "for(let i=0;i<raw.length&&out.length<250;i++){"
                    + "const e=raw[i];const r=e.getBoundingClientRect();"
                    + "const st=window.getComputedStyle(e);"
                    + "const vis=r.width>0&&r.height>0&&st.visibility!=='hidden'&&st.display!=='none';"
                    + "if(!includeHidden&&!vis)continue;"
                    + "const lbl=(e.labels&&e.labels[0]?e.labels[0].innerText:'')||e.getAttribute('aria-label')||e.placeholder||e.innerText||'';"
                    + "out.push({ref:'w'+(out.length+1),tag:e.tagName.toLowerCase(),type:e.type||e.getAttribute('role')||'',selector:uniqSel(e),label:lbl.trim().slice(0,120),value:(e.type==='password'?'[redacted]':(e.value||e.textContent||'')).trim().slice(0,120),checked:Boolean(e.checked||e.getAttribute('aria-checked')==='true'),disabled:Boolean(e.disabled||e.getAttribute('aria-disabled')==='true'),visible:vis});"
                    + "}return JSON.stringify(out);})()";
                JSONObject state = BrowserActivity.getState();
                JSONObject snapshot = new JSONObject();
                snapshot.put("ok", true);
                snapshot.put("url", state.optString("url", ""));
                snapshot.put("title", state.optString("title", ""));
                snapshot.put("value", BrowserActivity.evaluate(snapScript));
                respondJson(output, 200, snapshot);
            } else if ("GET".equals(method) && "/v1/packages".equals(path)) {
                JSONObject result = new JSONObject();
                result.put("ok", true);
                result.put("packages", service.listPackages());
                respondJson(output, 200, result);
            } else if ("GET".equals(method) && "/v1/device".equals(path)) {
                JSONObject result = service.getDeviceInfo();
                result.put("ok", true);
                respondJson(output, 200, result);
            } else if ("GET".equals(method) && "/v1/clipboard".equals(path)) {
                JSONObject result = new JSONObject();
                result.put("ok", true);
                result.put("text", service.getClipboard());
                respondJson(output, 200, result);
            } else if ("GET".equals(method) && "/v1/notifications/recent".equals(path)) {
                JSONObject result = new JSONObject();
                result.put("ok", true);
                result.put("connected", CompanionNotificationListener.isConnected());
                result.put("notifications", CompanionNotificationListener.getRecent(50));
                respondJson(output, 200, result);
            } else if ("GET".equals(method) && "/v1/vault/names".equals(path)) {
                JSONArray names = new JSONArray();
                for (String name : SecureVault.names(service)) {
                    if (!"control_token".equals(name)) names.put(name);
                }
                JSONObject result = new JSONObject();
                result.put("names", names);
                respondJson(output, 200, result);
            } else if ("GET".equals(method) && "/v1/execution/state".equals(path)) {
                int logLimit = (int) parseLong(query.get("logs"), 25L);
                respondJson(output, 200, buildExecutionStateJson(logLimit));
            } else if ("GET".equals(method) && "/v1/browser/gate_check".equals(path)) {
                HumanGateDetector.PageObservation obs = BrowserActivity.capturePassiveObservation();
                HumanGateDetector.GateSignal signal = HumanGateDetector.inspect(obs);
                JSONObject out = new JSONObject();
                out.put("ok", true);
                out.put("detected", signal.detected);
                out.put("kind", signal.kind.name());
                out.put("matchedRule", signal.matchedRule);
                out.put("url", signal.url);
                out.put("summary", signal.summary);
                respondJson(output, 200, out);
            } else if ("GET".equals(method) && "/v1/session/status".equals(path)) {
                WebSessionManager.SessionSnapshot snap = BrowserActivity.getSessionManager(service).getStatus();
                JSONObject out = new JSONObject();
                out.put("ok", true);
                out.put("lastUrl", snap.lastUrl);
                out.put("lastOrigin", snap.lastOrigin);
                out.put("lastFlushedAtMs", snap.lastFlushedAtMs);
                out.put("hasRestorableSession", snap.hasRestorableSession);
                out.put("trackedOriginsCount", snap.trackedOriginsCount);
                respondJson(output, 200, out);
            } else if ("GET".equals(method) && "/v1/config/flags".equals(path)) {
                JSONObject flagsJson = new JSONObject();
                for (Map.Entry<String, Boolean> entry : CompanionFeatureFlags.shared().snapshot().entrySet()) {
                    flagsJson.put(entry.getKey(), entry.getValue());
                }
                respondJson(output, 200, new JSONObject().put("ok", true).put("flags", flagsJson));
            } else if ("GET".equals(method) && "/v1/screenshot".equals(path)) {
                int displayId = (int) parseLong(query.get("display_id"), 0L);
                float scale = parseFloat(query.get("scale"), 1.0f);
                String format = query.getOrDefault("format", "png");
                int quality = (int) parseLong(query.get("quality"), 75L);
                boolean fresh = "1".equals(query.get("fresh")) || "true".equalsIgnoreCase(query.get("fresh"));
                AccessibilityControlService.ScreenshotPayload shot =
                    service.captureScreenshot(displayId, scale, format, quality, fresh);
                String extraHeaders = "X-Screenshot-Cached: " + (shot.cached ? "1" : "0") + "\r\n"
                    + "X-Screenshot-Width: " + shot.width + "\r\n"
                    + "X-Screenshot-Height: " + shot.height + "\r\n"
                    + "X-Ui-Generation: " + shot.generation + "\r\n";
                respondWithHeaders(output, 200, shot.contentType, extraHeaders, shot.bytes);
            } else if ("POST".equals(method)) {
                String bodyStr = body.length == 0 ? "{}" : new String(body, StandardCharsets.UTF_8);
                JSONObject args = new JSONObject(bodyStr);
                switch (path) {
                    case "/v1/vault/put": {
                        String vaultName = args.getString("name");
                        String vaultValue = args.getString("value");
                        if ("control_token".equals(vaultName) || vaultValue.length() > 32768)
                            throw new IllegalArgumentException("Invalid or protected vault entry");
                        SecureVault.put(service, vaultName, vaultValue);
                        respondJson(output, 200, new JSONObject().put("ok", true));
                        return;
                    }
                    case "/v1/vault/get": {
                        String getName = args.getString("name");
                        JSONObject secret = new JSONObject();
                        secret.put("name", getName);
                        secret.put("value", SecureVault.get(service, getName, null));
                        respondJson(output, 200, secret);
                        return;
                    }
                    case "/v1/vault/delete": {
                        String deleteName = args.getString("name");
                        if ("control_token".equals(deleteName)) throw new IllegalArgumentException("Protected vault entry");
                        SecureVault.delete(service, deleteName);
                        respondJson(output, 200, new JSONObject().put("ok", true));
                        return;
                    }
                    case "/v1/click": {
                        int clickDisplayId = args.optInt("display_id", 0);
                        AccessibilityControlService.ActionResult r = clickDisplayId > 0
                            ? service.clickOnDisplay(clickDisplayId, optStr(args, "path"))
                            : service.clickTarget(
                                optStr(args, "path"),
                                optStr(args, "ref"),
                                optStr(args, "snapshot_id"),
                                optStr(args, "expected_package"),
                                args.optBoolean("strict_generation", false)
                            );
                        respondAction(output, r);
                        return;
                    }
                    case "/v1/click_text": {
                        AccessibilityControlService.ActionResult r = service.clickText(
                            args.optString("text", ""),
                            args.optString("view_id", ""),
                            args.optLong("timeout_ms", 3000),
                            optStr(args, "expected_package")
                        );
                        respondAction(output, r);
                        return;
                    }
                    case "/v1/wait_for_text": {
                        AccessibilityControlService.ActionResult r = service.waitForText(
                            args.optString("text", ""),
                            args.optString("view_id", ""),
                            optStr(args, "expected_package"),
                            args.optLong("timeout_ms", 5000)
                        );
                        respondAction(output, r);
                        return;
                    }
                    case "/v1/assert_package": {
                        AccessibilityControlService.ActionResult r = service.assertPackage(
                            args.optString("package", args.optString("expected_package", "")),
                            args.optLong("timeout_ms", 0)
                        );
                        respondAction(output, r);
                        return;
                    }
                    case "/v1/scroll": {
                        AccessibilityControlService.ActionResult r = service.scroll(
                            args.optString("direction", "forward"),
                            optStr(args, "path"),
                            optStr(args, "ref"),
                            optStr(args, "snapshot_id"),
                            optStr(args, "expected_package"),
                            args.optBoolean("strict_generation", false)
                        );
                        respondAction(output, r);
                        return;
                    }
                    case "/v1/scroll_until": {
                        AccessibilityControlService.ActionResult r = service.scrollUntil(
                            args.optString("text", ""),
                            args.optString("view_id", ""),
                            optStr(args, "path"),
                            optStr(args, "ref"),
                            optStr(args, "snapshot_id"),
                            args.optString("direction", "forward"),
                            args.optInt("max_scrolls", 8),
                            args.optLong("delay_ms", 220),
                            args.optBoolean("click", false),
                            optStr(args, "expected_package")
                        );
                        respondAction(output, r);
                        return;
                    }
                    case "/v1/ime_action": {
                        AccessibilityControlService.ActionResult r = service.imeAction(
                            optStr(args, "path"),
                            optStr(args, "ref"),
                            optStr(args, "snapshot_id"),
                            optStr(args, "expected_package"),
                            args.optBoolean("strict_generation", false)
                        );
                        respondAction(output, r);
                        return;
                    }
                    case "/v1/long_press": {
                        Double x = args.has("x") ? args.getDouble("x") : null;
                        Double y = args.has("y") ? args.getDouble("y") : null;
                        AccessibilityControlService.ActionResult r = service.longPress(
                            optStr(args, "path"),
                            optStr(args, "ref"),
                            optStr(args, "snapshot_id"),
                            x, y,
                            args.optLong("duration_ms", 650),
                            optStr(args, "expected_package"),
                            args.optBoolean("strict_generation", false)
                        );
                        respondAction(output, r);
                        return;
                    }
                    case "/v1/double_tap": {
                        Double x = args.has("x") ? args.getDouble("x") : null;
                        Double y = args.has("y") ? args.getDouble("y") : null;
                        AccessibilityControlService.ActionResult r = service.doubleTap(
                            optStr(args, "path"),
                            optStr(args, "ref"),
                            optStr(args, "snapshot_id"),
                            x, y,
                            args.optLong("interval_ms", 90),
                            optStr(args, "expected_package"),
                            args.optBoolean("strict_generation", false)
                        );
                        respondAction(output, r);
                        return;
                    }
                    case "/v1/events/wait": {
                        long sinceSeq = args.optLong("since_seq", service.getEventBus().getLatestSeq());
                        Set<String> types = parseTypeSet(args);
                        String pkg = args.optString("package", "");
                        String text = args.optString("text", "");
                        long timeoutMs = args.optLong("timeout_ms", 5000);
                        JSONObject waitRes = service.waitForEvent(sinceSeq, types, pkg, text, timeoutMs);
                        respondJson(output, waitRes.optBoolean("ok") ? 200 : 408, waitRes);
                        return;
                    }
                    case "/v1/clipboard": {
                        String clipText = args.optString("text", "");
                        if (clipText.length() > 32768) throw new IllegalArgumentException("clipboard text too long");
                        boolean ok = service.setClipboard(clipText);
                        respondJson(output, ok ? 200 : 409, new JSONObject().put("ok", ok));
                        return;
                    }
                    case "/v1/paste": {
                        String pasteText = args.has("text") ? args.optString("text", "") : null;
                        if (pasteText != null && pasteText.length() > 32768) throw new IllegalArgumentException("text too long");
                        respondAction(output, service.pasteText(pasteText, optStr(args, "expected_package")));
                        return;
                    }
                    case "/v1/tap": {
                        respondAction(output, service.tapGuarded(
                            (float) args.getDouble("x"),
                            (float) args.getDouble("y"),
                            optStr(args, "expected_package")
                        ));
                        return;
                    }
                    case "/v1/type": {
                        String text = args.optString("text", "");
                        if (text.length() > 32768) throw new IllegalArgumentException("text too long");
                        respondAction(output, service.typeTextGuarded(text, optStr(args, "expected_package")));
                        return;
                    }
                    case "/v1/set_text": {
                        String setTextVal = args.optString("text", "");
                        if (setTextVal.length() > 32768) throw new IllegalArgumentException("text too long");
                        int setTextDisplayId = args.optInt("display_id", 0);
                        AccessibilityControlService.ActionResult r = setTextDisplayId > 0
                            ? service.setTextOnDisplay(setTextDisplayId, optStr(args, "path"), setTextVal)
                            : service.setTextTarget(
                                optStr(args, "path"),
                                optStr(args, "ref"),
                                optStr(args, "snapshot_id"),
                                setTextVal,
                                optStr(args, "expected_package"),
                                args.optBoolean("strict_generation", false)
                            );
                        respondAction(output, r);
                        return;
                    }
                    case "/v1/swipe": {
                        respondAction(output, service.swipeGuarded(
                            (float) args.getDouble("x1"), (float) args.getDouble("y1"),
                            (float) args.getDouble("x2"), (float) args.getDouble("y2"),
                            Math.max(50, Math.min(5000, args.optLong("duration_ms", 350))),
                            optStr(args, "expected_package")
                        ));
                        return;
                    }
                    case "/v1/back": {
                        respondAction(output, service.globalActionGuarded(
                            AccessibilityService.GLOBAL_ACTION_BACK, optStr(args, "expected_package")));
                        return;
                    }
                    case "/v1/home": {
                        respondAction(output, service.globalActionGuarded(
                            AccessibilityService.GLOBAL_ACTION_HOME, optStr(args, "expected_package")));
                        return;
                    }
                    case "/v1/recents": {
                        respondAction(output, service.globalActionGuarded(
                            AccessibilityService.GLOBAL_ACTION_RECENTS, optStr(args, "expected_package")));
                        return;
                    }
                    case "/v1/notifications": {
                        boolean ok = service.globalAction(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS);
                        respondJson(output, ok ? 200 : 409, new JSONObject().put("ok", ok));
                        return;
                    }
                    case "/v1/runtime/start": {
                        boolean ok = CompanionRuntimeService.start(service);
                        respondJson(output, ok ? 200 : 409, new JSONObject()
                            .put("ok", ok)
                            .put("runtimeServiceRunning", CompanionRuntimeService.isRunning() || ok));
                        return;
                    }
                    case "/v1/runtime/stop": {
                        boolean ok = CompanionRuntimeService.stop(service);
                        respondJson(output, ok ? 200 : 409, new JSONObject()
                            .put("ok", ok)
                            .put("runtimeServiceRunning", false));
                        return;
                    }
                    case "/v1/batch": {
                        handleBatch(output, args);
                        return;
                    }
                    case "/v1/open": {
                        String packageName = args.getString("package");
                        if (!packageName.matches("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+"))
                            throw new IllegalArgumentException("invalid package name");
                        boolean ok = service.openApp(packageName);
                        respondJson(output, ok ? 200 : 409, new JSONObject().put("ok", ok));
                        return;
                    }
                    case "/v1/url": {
                        String url = args.getString("url");
                        if (url.length() > 2048) throw new IllegalArgumentException("URL too long");
                        boolean ok = service.openUrl(url);
                        respondJson(output, ok ? 200 : 409, new JSONObject().put("ok", ok));
                        return;
                    }
                    case "/v1/browser/navigate": {
                        String browserUrl = args.getString("url");
                        if (!(browserUrl.startsWith("https://") || browserUrl.startsWith("http://")))
                            throw new IllegalArgumentException("Only http and https URLs are supported");
                        boolean ok = service.openBrowser(browserUrl);
                        respondJson(output, ok ? 200 : 409, new JSONObject().put("ok", ok));
                        return;
                    }
                    case "/v1/browser/evaluate": {
                        String script = args.getString("script");
                        if (script.length() > 1024 * 1024) throw new IllegalArgumentException("Script too long");
                        JSONObject evaluation = new JSONObject();
                        evaluation.put("value", BrowserActivity.evaluate(script));
                        respondJson(output, 200, evaluation);
                        return;
                    }
                    case "/v1/browser/click": {
                        String clickSelector = args.getString("selector");
                        if (clickSelector.length() > 1000) throw new IllegalArgumentException("Selector too long");
                        String clickScript = "(function(){const e=document.querySelector(" + JSONObject.quote(clickSelector) + ");if(!e)return false;e.click();return true})()";
                        JSONObject clickResult = new JSONObject();
                        clickResult.put("ok", "true".equals(BrowserActivity.evaluate(clickScript)));
                        respondJson(output, 200, clickResult);
                        return;
                    }
                    case "/v1/browser/fill": {
                        String fillSelector = args.getString("selector");
                        String fillValue = args.getString("value");
                        if (fillSelector.length() > 1000 || fillValue.length() > 10000) throw new IllegalArgumentException("Input too long");
                        String fillScript = "(function(){const e=document.querySelector(" + JSONObject.quote(fillSelector) + ");if(!e)return false;const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const d=Object.getOwnPropertyDescriptor(p,'value');if(d&&d.set)d.set.call(e," + JSONObject.quote(fillValue) + ");else e.value=" + JSONObject.quote(fillValue) + ";e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()";
                        JSONObject fillResult = new JSONObject();
                        fillResult.put("ok", "true".equals(BrowserActivity.evaluate(fillScript)));
                        respondJson(output, 200, fillResult);
                        return;
                    }
                    case "/v1/browser/back": {
                        boolean ok = BrowserActivity.goBack();
                        respondJson(output, ok ? 200 : 409, new JSONObject().put("ok", ok));
                        return;
                    }
                    case "/v1/browser/forward": {
                        boolean ok = BrowserActivity.goForward();
                        respondJson(output, ok ? 200 : 409, new JSONObject().put("ok", ok));
                        return;
                    }
                    case "/v1/browser/reload": {
                        boolean ok = BrowserActivity.reloadPage();
                        respondJson(output, ok ? 200 : 409, new JSONObject().put("ok", ok));
                        return;
                    }
                    case "/v1/browser/wait": {
                        String waitSelector = args.optString("selector", "").trim();
                        String waitText = args.optString("text", "").trim();
                        long timeoutMs = Math.max(200L, Math.min(20000L, args.optLong("timeout_ms", 8000L)));
                        long waitStart = SystemClock.uptimeMillis();
                        long deadline = waitStart + timeoutMs;
                        boolean matched = false;
                        while (SystemClock.uptimeMillis() <= deadline) {
                            if (BrowserActivity.isReady()) {
                                String checkScript;
                                if (!waitSelector.isEmpty()) {
                                    checkScript = "(function(){const e=document.querySelector(" + JSONObject.quote(waitSelector) + ");if(!e)return false;const r=e.getBoundingClientRect();const st=window.getComputedStyle(e);return r.width>0&&r.height>0&&st.visibility!=='hidden'&&st.display!=='none';})()";
                                } else if (!waitText.isEmpty()) {
                                    checkScript = "(function(){const b=document.body?document.body.innerText:'';return b.toLowerCase().includes(" + JSONObject.quote(waitText.toLowerCase(Locale.ROOT)) + ");})()";
                                } else {
                                    checkScript = "(function(){return document.readyState==='complete';})()";
                                }
                                if ("true".equals(BrowserActivity.evaluate(checkScript))) {
                                    matched = true;
                                    break;
                                }
                            }
                            Thread.sleep(150L);
                        }
                        JSONObject state = BrowserActivity.getState();
                        state.put("ok", matched);
                        state.put("matched", matched);
                        state.put("elapsedMs", SystemClock.uptimeMillis() - waitStart);
                        if (!matched) state.put("reason", "timeout");
                        respondJson(output, matched ? 200 : 408, state);
                        return;
                    }
                    case "/v1/execution/transition": {
                        handleExecutionTransition(output, args);
                        return;
                    }
                    case "/v1/session/flush": {
                        WebSessionManager mgr = BrowserActivity.getSessionManager(service);
                        mgr.flushNow(System.currentTimeMillis());
                        WebSessionManager.SessionSnapshot snap = mgr.getStatus();
                        respondJson(output, 200, new JSONObject()
                            .put("ok", true)
                            .put("lastUrl", snap.lastUrl)
                            .put("lastFlushedAtMs", snap.lastFlushedAtMs));
                        return;
                    }
                    case "/v1/config/flags": {
                        JSONObject incoming = args.has("flags") ? args.getJSONObject("flags") : args;
                        java.util.Iterator<String> keys = incoming.keys();
                        while (keys.hasNext()) {
                            String k = keys.next();
                            if (CompanionFeatureFlags.shared().isKnownFlag(k)) {
                                CompanionFeatureFlags.shared().setEnabled(k, incoming.getBoolean(k));
                            }
                        }
                        JSONObject updated = new JSONObject();
                        for (Map.Entry<String, Boolean> entry : CompanionFeatureFlags.shared().snapshot().entrySet()) {
                            updated.put(entry.getKey(), entry.getValue());
                        }
                        respondJson(output, 200, new JSONObject().put("ok", true).put("flags", updated));
                        return;
                    }
                    default:
                        respond(output, 404, "application/json", jsonError("unknown endpoint"));
                        return;
                }
            } else {
                respond(output, 404, "application/json", jsonError("unknown endpoint"));
            }
    }

    private void handleBatch(OutputStream output, JSONObject args) throws Exception {
        long batchStart = SystemClock.uptimeMillis();
        JSONArray steps = args.getJSONArray("steps");
        if (steps.length() > 60) throw new IllegalArgumentException("batch max 60 steps");

        String batchExpectedPkg = optStr(args, "expected_package");
        String activeSnapshotId = optStr(args, "snapshot_id");
        boolean batchStrictGen = args.optBoolean("strict_generation", false);

        if (batchExpectedPkg != null) {
            AccessibilityControlService.ActionResult preGuard = service.checkPackageGuard(batchExpectedPkg);
            if (preGuard != null) {
                JSONObject out = preGuard.toJson(service.getEventBus().getGeneration());
                out.put("results", new JSONArray());
                out.put("executedSteps", 0);
                out.put("totalElapsedMs", SystemClock.uptimeMillis() - batchStart);
                respondJson(output, 409, out);
                return;
            }
        }

        JSONArray results = new JSONArray();
        boolean allOk = true;
        String failReason = "";

        for (int i = 0; i < steps.length(); i++) {
            JSONObject step = steps.getJSONObject(i);
            String action = step.getString("action");
            String stepPkg = step.has("expected_package") ? optStr(step, "expected_package") : batchExpectedPkg;
            String stepSnap = step.has("snapshot_id") ? optStr(step, "snapshot_id") : activeSnapshotId;
            boolean stepStrict = step.has("strict_generation") ? step.optBoolean("strict_generation", false) : batchStrictGen;

            long stepStart = SystemClock.uptimeMillis();
            JSONObject stepRes = new JSONObject().put("action", action);
            AccessibilityControlService.ActionResult actionResult = null;
            boolean stepOk = false;

            switch (action) {
                case "open": {
                    String pkg = step.getString("package");
                    if (!pkg.matches("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+"))
                        throw new IllegalArgumentException("invalid package name");
                    stepOk = service.openApp(pkg);
                    // Update batch guard if caller intentionally switched apps
                    if (stepOk && step.optBoolean("update_expected_package", false)) {
                        batchExpectedPkg = pkg;
                    }
                    break;
                }
                case "assert_package": {
                    actionResult = service.assertPackage(
                        step.optString("package", stepPkg == null ? "" : stepPkg),
                        step.optLong("timeout_ms", 0)
                    );
                    break;
                }
                case "wait_for_text": {
                    actionResult = service.waitForText(
                        step.optString("text", ""),
                        step.optString("view_id", ""),
                        stepPkg,
                        step.optLong("timeout_ms", 5000)
                    );
                    break;
                }
                case "tap": {
                    actionResult = service.tapGuarded(
                        (float) step.getDouble("x"), (float) step.getDouble("y"), stepPkg
                    );
                    break;
                }
                case "click": {
                    actionResult = service.clickTarget(
                        optStr(step, "path"), optStr(step, "ref"), stepSnap, stepPkg, stepStrict
                    );
                    break;
                }
                case "click_text": {
                    actionResult = service.clickText(
                        step.optString("text", ""),
                        step.optString("view_id", ""),
                        step.optLong("timeout_ms", 3000),
                        stepPkg
                    );
                    break;
                }
                case "scroll": {
                    actionResult = service.scroll(
                        step.optString("direction", "forward"),
                        optStr(step, "path"), optStr(step, "ref"), stepSnap, stepPkg, stepStrict
                    );
                    break;
                }
                case "scroll_until": {
                    actionResult = service.scrollUntil(
                        step.optString("text", ""),
                        step.optString("view_id", ""),
                        optStr(step, "path"),
                        optStr(step, "ref"),
                        stepSnap,
                        step.optString("direction", "forward"),
                        step.optInt("max_scrolls", 8),
                        step.optLong("delay_ms", 220),
                        step.optBoolean("click", false),
                        stepPkg
                    );
                    break;
                }
                case "ime_action": {
                    actionResult = service.imeAction(
                        optStr(step, "path"), optStr(step, "ref"), stepSnap, stepPkg, stepStrict
                    );
                    break;
                }
                case "long_press": {
                    Double x = step.has("x") ? step.getDouble("x") : null;
                    Double y = step.has("y") ? step.getDouble("y") : null;
                    actionResult = service.longPress(
                        optStr(step, "path"), optStr(step, "ref"), stepSnap, x, y,
                        step.optLong("duration_ms", 650), stepPkg, stepStrict
                    );
                    break;
                }
                case "double_tap": {
                    Double x = step.has("x") ? step.getDouble("x") : null;
                    Double y = step.has("y") ? step.getDouble("y") : null;
                    actionResult = service.doubleTap(
                        optStr(step, "path"), optStr(step, "ref"), stepSnap, x, y,
                        step.optLong("interval_ms", 90), stepPkg, stepStrict
                    );
                    break;
                }
                case "paste": {
                    actionResult = service.pasteText(step.has("text") ? step.optString("text", "") : null, stepPkg);
                    break;
                }
                case "type": {
                    String t = step.optString("text", "");
                    if (t.length() > 32768) throw new IllegalArgumentException("text too long");
                    actionResult = service.typeTextGuarded(t, stepPkg);
                    break;
                }
                case "set_text": {
                    String t = step.optString("text", "");
                    if (t.length() > 32768) throw new IllegalArgumentException("text too long");
                    actionResult = service.setTextTarget(
                        optStr(step, "path"), optStr(step, "ref"), stepSnap, t, stepPkg, stepStrict
                    );
                    break;
                }
                case "swipe": {
                    actionResult = service.swipeGuarded(
                        (float) step.getDouble("x1"), (float) step.getDouble("y1"),
                        (float) step.getDouble("x2"), (float) step.getDouble("y2"),
                        Math.max(50, Math.min(5000, step.optLong("duration_ms", 350))),
                        stepPkg
                    );
                    break;
                }
                case "back":
                    actionResult = service.globalActionGuarded(AccessibilityService.GLOBAL_ACTION_BACK, stepPkg);
                    break;
                case "home":
                    actionResult = service.globalActionGuarded(AccessibilityService.GLOBAL_ACTION_HOME, stepPkg);
                    break;
                case "recents":
                    actionResult = service.globalActionGuarded(AccessibilityService.GLOBAL_ACTION_RECENTS, stepPkg);
                    break;
                case "sleep": {
                    long ms = Math.max(50, Math.min(5000, step.optLong("ms", 500)));
                    Thread.sleep(ms);
                    stepOk = true;
                    break;
                }
                case "ui": {
                    AccessibilityControlService.ActionResult guard = service.checkPackageGuard(stepPkg);
                    if (guard != null) {
                        actionResult = guard;
                    } else {
                        stepRes.put("ui", service.getUiTree());
                        stepOk = true;
                    }
                    break;
                }
                case "ui_compact": {
                    AccessibilityControlService.ActionResult guard = service.checkPackageGuard(stepPkg);
                    if (guard != null) {
                        actionResult = guard;
                    } else {
                        JSONObject compact = service.getCompactUi();
                        stepRes.put("ui", compact);
                        String newSnap = compact.optString("snapshotId", "");
                        if (!newSnap.isEmpty()) {
                            activeSnapshotId = newSnap;
                            stepRes.put("snapshotId", newSnap);
                        }
                        stepOk = compact.optBoolean("available", false);
                    }
                    break;
                }
                default:
                    throw new IllegalArgumentException("unknown batch action: " + action);
            }

            if (actionResult != null) {
                stepOk = actionResult.ok;
                if (actionResult.data != null) {
                    java.util.Iterator<String> keys = actionResult.data.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        stepRes.put(k, actionResult.data.get(k));
                    }
                }
                if (!actionResult.ok) {
                    if (!actionResult.reason.isEmpty()) stepRes.put("reason", actionResult.reason);
                    if (!actionResult.message.isEmpty()) stepRes.put("error", actionResult.message);
                    if (failReason.isEmpty()) failReason = actionResult.reason;
                }
            }

            stepRes.put("ok", stepOk);
            stepRes.put("elapsedMs", SystemClock.uptimeMillis() - stepStart);
            results.put(stepRes);

            if (!stepOk) {
                allOk = false;
                if (step.optBoolean("stop_on_error", true)) break;
            }
        }

        JSONObject batchOut = new JSONObject()
            .put("ok", allOk)
            .put("apiVersion", 4)
            .put("executedSteps", results.length())
            .put("totalElapsedMs", SystemClock.uptimeMillis() - batchStart)
            .put("currentGeneration", service.getEventBus().getGeneration())
            .put("results", results);
        if (activeSnapshotId != null && !activeSnapshotId.isEmpty()) {
            batchOut.put("snapshotId", activeSnapshotId);
        }
        if (!allOk && !failReason.isEmpty()) {
            batchOut.put("reason", failReason);
        }
        respondJson(output, allOk ? 200 : 409, batchOut);
    }

    private void handleExecutionTransition(OutputStream output, JSONObject args) throws Exception {
        if (!CompanionFeatureFlags.shared().isEnabled(CompanionFeatureFlags.FLAG_HITL_STATE_MACHINE)) {
            respondJson(output, 409, new JSONObject().put("ok", false).put("reason", "flag_disabled"));
            return;
        }
        String action = args.getString("action").trim().toLowerCase(Locale.ROOT);
        long nowMs = System.currentTimeMillis();
        ExecutionStateMachine sm = ExecutionStateMachine.shared();
        ExecutionStateMachine.RunContext ctx;
        try {
            switch (action) {
                case "start":
                    ctx = sm.startRun(
                        args.getString("run_id"),
                        args.optString("flow_name", "default"),
                        args.optString("target_url", ""),
                        args.optInt("step_index", 0),
                        args.optString("step_action", "init"),
                        nowMs
                    );
                    CompanionRuntimeService.clearUserActionNotification(service);
                    break;
                case "step":
                    ctx = sm.advanceStep(
                        args.getInt("step_index"),
                        args.optString("step_action", ""),
                        args.optString("target_url", ""),
                        nowMs
                    );
                    break;
                case "pause_user": {
                    String gateRaw = args.optString("gate_kind", "HUMAN_VERIFICATION").trim().toUpperCase(Locale.ROOT);
                    HumanGateDetector.GateKind gateKind;
                    try { gateKind = HumanGateDetector.GateKind.valueOf(gateRaw); }
                    catch (IllegalArgumentException ignored) { gateKind = HumanGateDetector.GateKind.HUMAN_VERIFICATION; }
                    String targetUrl = args.optString("target_url", "");
                    String reason = args.optString("reason", "Acción manual requerida");
                    ctx = sm.pauseForUser(reason, gateKind, targetUrl, nowMs);
                    CompanionRuntimeService.notifyUserActionRequired(service, ctx.runId, reason, ctx.targetUrl);
                    if (args.optBoolean("focus_browser", false) && WebSessionManager.isWebUrl(ctx.targetUrl)) {
                        service.openBrowser(ctx.targetUrl);
                    }
                    break;
                }
                case "resume":
                    ctx = sm.beginResume(nowMs);
                    CompanionRuntimeService.clearUserActionNotification(service);
                    break;
                case "running":
                    ctx = sm.markRunningAfterResume(nowMs);
                    break;
                case "complete":
                    ctx = sm.complete(nowMs);
                    CompanionRuntimeService.clearUserActionNotification(service);
                    break;
                case "fail":
                    ctx = sm.fail(args.optString("error_code", "error"), args.optString("error_message", ""), nowMs);
                    CompanionRuntimeService.clearUserActionNotification(service);
                    break;
                case "reset":
                    ctx = sm.resetToIdle(nowMs);
                    CompanionRuntimeService.clearUserActionNotification(service);
                    break;
                default:
                    respondJson(output, 400, new JSONObject().put("ok", false).put("error", "unknown transition action: " + action));
                    return;
            }
        } catch (IllegalStateException badState) {
            respondJson(output, 409, new JSONObject().put("ok", false).put("reason", "invalid_transition").put("error", badState.getMessage()));
            return;
        }
        respondJson(output, 200, buildExecutionStateJson(15).put("context", contextToJson(ctx)));
    }

    private JSONObject buildExecutionStateJson(int logLimit) throws Exception {
        ExecutionStateMachine sm = ExecutionStateMachine.shared();
        ExecutionStateMachine.RunContext ctx = sm.getContext();
        JSONArray logs = new JSONArray();
        for (ExecutionStateMachine.LogEntry entry : sm.recentLogs(logLimit)) {
            logs.put(new JSONObject(entry.toJsonString()));
        }
        return new JSONObject()
            .put("ok", true)
            .put("context", contextToJson(ctx))
            .put("recentLogs", logs);
    }

    private static JSONObject contextToJson(ExecutionStateMachine.RunContext ctx) throws Exception {
        return new JSONObject(ctx.toJsonString());
    }

    private void respondAction(OutputStream output, AccessibilityControlService.ActionResult result) throws Exception {
        JSONObject json = result.toJson(service.getEventBus().getGeneration());
        respondJson(output, result.ok ? 200 : 409, json);
    }

    private void respondJson(OutputStream output, int status, JSONObject json) throws Exception {
        respond(output, status, "application/json; charset=utf-8", json.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static String optStr(JSONObject obj, String key) {
        if (!obj.has(key) || obj.isNull(key)) return null;
        String val = obj.optString(key, "");
        return val.isEmpty() ? null : val;
    }

    private static Set<String> parseTypeSet(JSONObject args) {
        Set<String> types = new HashSet<>();
        if (args.has("types")) {
            Object raw = args.opt("types");
            if (raw instanceof JSONArray) {
                JSONArray arr = (JSONArray) raw;
                for (int i = 0; i < arr.length(); i++) {
                    String s = arr.optString(i, "").trim();
                    if (!s.isEmpty()) types.add(s);
                }
            } else if (raw instanceof String) {
                types.addAll(CompanionEventBus.parseTypes((String) raw));
            }
        }
        return types;
    }

    private static Map<String, String> parseQuery(String qs) {
        Map<String, String> out = new HashMap<>();
        if (qs == null || qs.isEmpty()) return out;
        for (String pair : qs.split("&")) {
            int eq = pair.indexOf('=');
            try {
                if (eq > 0) {
                    out.put(
                        URLDecoder.decode(pair.substring(0, eq), "UTF-8"),
                        URLDecoder.decode(pair.substring(eq + 1), "UTF-8")
                    );
                } else if (!pair.isEmpty()) {
                    out.put(URLDecoder.decode(pair, "UTF-8"), "1");
                }
            } catch (Exception ignored) {}
        }
        return out;
    }

    private static long parseLong(String value, long fallback) {
        if (value == null || value.isEmpty()) return fallback;
        try { return Long.parseLong(value); }
        catch (NumberFormatException ignored) { return fallback; }
    }

    private static float parseFloat(String value, float fallback) {
        if (value == null || value.isEmpty()) return fallback;
        try { return Float.parseFloat(value); }
        catch (NumberFormatException ignored) { return fallback; }
    }

    private static String readLine(InputStream input) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        int previous = -1;
        while (bytes.size() < 8192) {
            int value = input.read();
            if (value < 0) break;
            if (previous == 13 && value == 10) {
                byte[] data = bytes.toByteArray();
                return new String(data, 0, Math.max(0, data.length - 1), StandardCharsets.US_ASCII);
            }
            bytes.write(value);
            previous = value;
        }
        return bytes.size() == 0 ? null : bytes.toString(StandardCharsets.US_ASCII.name());
    }

    private static byte[] readBytes(InputStream input, int count) throws Exception {
        byte[] data = new byte[count];
        int offset = 0;
        while (offset < count) {
            int read = input.read(data, offset, count - offset);
            if (read < 0) throw new IllegalStateException("incomplete HTTP body");
            offset += read;
        }
        return data;
    }

    private static void respond(OutputStream output, int status, String type, byte[] body) throws Exception {
        respondWithHeaders(output, status, type, "", body);
    }

    private static void respondWithHeaders(OutputStream output, int status, String type, String extraHeaders, byte[] body) throws Exception {
        String label = status == 200 ? "OK" : status == 400 ? "Bad Request" : status == 401 ? "Unauthorized" :
            status == 404 ? "Not Found" : status == 408 ? "Request Timeout" :
            status == 409 ? "Action Failed" : status == 413 ? "Payload Too Large" : "Internal Server Error";
        boolean keepAlive = Boolean.TRUE.equals(CURRENT_KEEP_ALIVE.get());
        String conn = keepAlive ? "Connection: keep-alive\r\nKeep-Alive: timeout=30, max=" + MAX_KEEPALIVE_REQUESTS + "\r\n"
            : "Connection: close\r\n";
        String headers = "HTTP/1.1 " + status + " " + label + "\r\n"
            + "Content-Type: " + type + "\r\n"
            + "Content-Length: " + body.length + "\r\n"
            + "Cache-Control: no-store\r\n"
            + (extraHeaders == null ? "" : extraHeaders)
            + conn + "\r\n";
        output.write(headers.getBytes(StandardCharsets.US_ASCII));
        output.write(body);
        output.flush();
    }

    private static byte[] jsonError(String message) {
        try { return new JSONObject().put("ok", false).put("error", message).toString().getBytes(StandardCharsets.UTF_8); }
        catch (Exception ignored) { return "{\"ok\":false}".getBytes(StandardCharsets.UTF_8); }
    }

    private static boolean constantTimeEquals(String a, String b) throws Exception {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
