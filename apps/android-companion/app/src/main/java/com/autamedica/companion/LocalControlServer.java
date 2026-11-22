package com.autamedica.companion;

import android.accessibilityservice.AccessibilityService;
import android.os.SystemClock;

import org.json.JSONArray;
import org.json.JSONObject;

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
    private final AccessibilityControlService service;
    private final ExecutorService clients = new ThreadPoolExecutor(
        4, 24, 60L, TimeUnit.SECONDS, new LinkedBlockingQueue<>(64)
    );
    private volatile boolean running;
    private ServerSocket serverSocket;

    LocalControlServer(AccessibilityControlService service) {
        this.service = service;
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
        OutputStream errorOutput = null;
        try (Socket client = socket) {
            client.setSoTimeout(35000);
            InputStream input = client.getInputStream();
            OutputStream output = client.getOutputStream();
            errorOutput = output;
            String requestLine = readLine(input);
            if (requestLine == null || requestLine.isEmpty()) return;
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                respond(output, 400, "application/json", jsonError("bad request"));
                return;
            }
            String method = parts[0].toUpperCase(Locale.ROOT);
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
            int contentLength = 0;
            try { contentLength = Integer.parseInt(headers.getOrDefault("content-length", "0")); }
            catch (NumberFormatException ignored) {}
            if (contentLength < 0 || contentLength > MAX_BODY) {
                respond(output, 413, "application/json", jsonError("body too large"));
                return;
            }
            byte[] body = readBytes(input, contentLength);

            String expected = SecureVault.get(service, "control_token", "");
            String supplied = headers.getOrDefault("authorization", "");
            if (expected.isEmpty() || !constantTimeEquals("Bearer " + expected, supplied)) {
                respond(output, 401, "application/json", jsonError("unauthorized"));
                return;
            }

            if ("GET".equals(method) && "/v1/health".equals(path)) {
                JSONObject result = new JSONObject();
                result.put("ok", true);
                result.put("apiVersion", 6);
                result.put("versionName", BuildConfig.VERSION_NAME);
                result.put("engine", "Companion Execution Engine 5.0 (Multi-Display)");
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
                    .put("transactional_snapshot").put("scroll_path").put("scroll_until")
                    .put("ime_action").put("long_press").put("double_tap")
                    .put("wait_for_text").put("assert_package").put("event_bus"));
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
                JSONObject result = compact ? service.getCompactUi(displayId) : service.getUiTree(displayId);
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
            } else if ("GET".equals(method) && "/v1/screenshot".equals(path)) {
                int displayId = (int) parseLong(query.get("display_id"), 0L);
                byte[] image = android.util.Base64.decode(service.screenshotBase64(displayId), android.util.Base64.NO_WRAP);
                respond(output, 200, "image/png", image);
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
                    default:
                        respond(output, 404, "application/json", jsonError("unknown endpoint"));
                        return;
                }
            } else {
                respond(output, 404, "application/json", jsonError("unknown endpoint"));
            }
        } catch (Exception error) {
            android.util.Log.w("AutamedicaCompanion", "Local request failed: " + error.getClass().getSimpleName());
            if (errorOutput != null) {
                try {
                    JSONObject body = new JSONObject()
                        .put("ok", false)
                        .put("error", error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
                    respondJson(errorOutput, 500, body);
                } catch (Exception ignored) {}
            }
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
        String label = status == 200 ? "OK" : status == 400 ? "Bad Request" : status == 401 ? "Unauthorized" :
            status == 404 ? "Not Found" : status == 408 ? "Request Timeout" :
            status == 409 ? "Action Failed" : status == 413 ? "Payload Too Large" : "Internal Server Error";
        String headers = "HTTP/1.1 " + status + " " + label + "\r\n"
            + "Content-Type: " + type + "\r\n"
            + "Content-Length: " + body.length + "\r\n"
            + "Cache-Control: no-store\r\n"
            + "Connection: close\r\n\r\n";
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
