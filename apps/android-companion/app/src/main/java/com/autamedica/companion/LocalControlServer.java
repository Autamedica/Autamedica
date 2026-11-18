package com.autamedica.companion;

import android.accessibilityservice.AccessibilityService;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class LocalControlServer {
    private static final int PORT = 18765;
    private static final int MAX_BODY = 16384;
    private final AccessibilityControlService service;
    private final ExecutorService clients = Executors.newCachedThreadPool();
    private volatile boolean running;
    private ServerSocket serverSocket;

    LocalControlServer(AccessibilityControlService service) {
        this.service = service;
    }

    void start() {
        if (running) return;
        running = true;
        Thread acceptThread = new Thread(() -> {
            try {
                serverSocket = new ServerSocket(PORT, 20, InetAddress.getByName("127.0.0.1"));
                while (running) {
                    Socket socket = serverSocket.accept();
                    clients.execute(() -> handle(socket));
                }
            } catch (Exception error) {
                if (running) android.util.Log.e("AutamedicaCompanion", "Local server stopped", error);
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
            client.setSoTimeout(6000);
            InputStream input = client.getInputStream();
            OutputStream output = client.getOutputStream();
            String requestLine = readLine(input);
            if (requestLine == null || requestLine.isEmpty()) return;
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                respond(output, 400, "application/json", jsonError("bad request"));
                return;
            }
            String method = parts[0].toUpperCase(Locale.ROOT);
            String path = parts[1].split("\\?", 2)[0];
            java.util.Map<String, String> headers = new java.util.HashMap<>();
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

            String expected = service.getSharedPreferences("companion_private", android.content.Context.MODE_PRIVATE)
                .getString("control_token", "");
            String supplied = headers.getOrDefault("authorization", "");
            if (expected.isEmpty() || !constantTimeEquals("Bearer " + expected, supplied)) {
                respond(output, 401, "application/json", jsonError("unauthorized"));
                return;
            }

            if ("GET".equals(method) && "/v1/health".equals(path)) {
                JSONObject result = new JSONObject();
                result.put("ok", true);
                result.put("accessibility", true);
                result.put("bind", "127.0.0.1");
                result.put("port", PORT);
                result.put("cdpBind", "127.0.0.1");
                result.put("cdpPort", LocalCdpProxy.PORT);
                result.put("browserEngine", "Android System WebView / Chromium");
                result.put("internetPermission", true);
                respond(output, 200, "application/json; charset=utf-8", result.toString().getBytes(StandardCharsets.UTF_8));
            } else if ("GET".equals(method) && "/v1/ui".equals(path)) {
                JSONObject result = service.getUiTree();
                respond(output, 200, "application/json; charset=utf-8", result.toString().getBytes(StandardCharsets.UTF_8));
            } else if ("GET".equals(method) && "/v1/screenshot".equals(path)) {
                byte[] image = android.util.Base64.decode(service.screenshotBase64(), android.util.Base64.NO_WRAP);
                respond(output, 200, "image/png", image);
            } else if ("POST".equals(method)) {
                JSONObject args = new JSONObject(new String(body, StandardCharsets.UTF_8));
                boolean ok;
                switch (path) {
                    case "/v1/click":
                        ok = service.clickPath(args.getString("path"));
                        break;
                    case "/v1/tap":
                        ok = service.tap((float) args.getDouble("x"), (float) args.getDouble("y"));
                        break;
                    case "/v1/type":
                        String text = args.optString("text", "");
                        if (text.length() > 2000) throw new IllegalArgumentException("text too long");
                        ok = service.typeText(text);
                        break;
                    case "/v1/swipe":
                        ok = service.swipe((float) args.getDouble("x1"), (float) args.getDouble("y1"),
                            (float) args.getDouble("x2"), (float) args.getDouble("y2"),
                            Math.max(50, Math.min(5000, args.optLong("duration_ms", 350))));
                        break;
                    case "/v1/back":
                        ok = service.globalAction(AccessibilityService.GLOBAL_ACTION_BACK);
                        break;
                    case "/v1/home":
                        ok = service.globalAction(AccessibilityService.GLOBAL_ACTION_HOME);
                        break;
                    case "/v1/open":
                        String packageName = args.getString("package");
                        if (!packageName.matches("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+"))
                            throw new IllegalArgumentException("invalid package name");
                        ok = service.openApp(packageName);
                        break;
                    case "/v1/url":
                        String url = args.getString("url");
                        if (url.length() > 2048) throw new IllegalArgumentException("URL too long");
                        ok = service.openUrl(url);
                        break;
                    case "/v1/browser/navigate":
                        String browserUrl = args.getString("url");
                        if (!(browserUrl.startsWith("https://") || browserUrl.startsWith("http://")))
                            throw new IllegalArgumentException("Only http and https URLs are supported");
                        ok = service.openBrowser(browserUrl);
                        break;
                    case "/v1/browser/evaluate":
                        String script = args.getString("script");
                        if (script.length() > 12000) throw new IllegalArgumentException("Script too long");
                        JSONObject evaluation = new JSONObject();
                        evaluation.put("value", BrowserActivity.evaluate(script));
                        respond(output, 200, "application/json; charset=utf-8", evaluation.toString().getBytes(StandardCharsets.UTF_8));
                        return;
                    case "/v1/browser/click":
                        String clickSelector = args.getString("selector");
                        if (clickSelector.length() > 1000) throw new IllegalArgumentException("Selector too long");
                        String clickScript = "(function(){const e=document.querySelector(" + JSONObject.quote(clickSelector) + ");if(!e)return false;e.click();return true})()";
                        JSONObject clickResult = new JSONObject();
                        clickResult.put("ok", "true".equals(BrowserActivity.evaluate(clickScript)));
                        respond(output, 200, "application/json; charset=utf-8", clickResult.toString().getBytes(StandardCharsets.UTF_8));
                        return;
                    case "/v1/browser/fill":
                        String fillSelector = args.getString("selector");
                        String fillValue = args.getString("value");
                        if (fillSelector.length() > 1000 || fillValue.length() > 10000) throw new IllegalArgumentException("Input too long");
                        String fillScript = "(function(){const e=document.querySelector(" + JSONObject.quote(fillSelector) + ");if(!e)return false;const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const d=Object.getOwnPropertyDescriptor(p,'value');if(d&&d.set)d.set.call(e," + JSONObject.quote(fillValue) + ");else e.value=" + JSONObject.quote(fillValue) + ";e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()";
                        JSONObject fillResult = new JSONObject();
                        fillResult.put("ok", "true".equals(BrowserActivity.evaluate(fillScript)));
                        respond(output, 200, "application/json; charset=utf-8", fillResult.toString().getBytes(StandardCharsets.UTF_8));
                        return;
                    default:
                        respond(output, 404, "application/json", jsonError("unknown endpoint"));
                        return;
                }
                JSONObject result = new JSONObject();
                result.put("ok", ok);
                respond(output, ok ? 200 : 409, "application/json; charset=utf-8", result.toString().getBytes(StandardCharsets.UTF_8));
            } else {
                respond(output, 404, "application/json", jsonError("unknown endpoint"));
            }
        } catch (Exception error) {
            android.util.Log.w("AutamedicaCompanion", "Local request failed: " + error.getClass().getSimpleName());
        }
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
        String label = status == 200 ? "OK" : status == 401 ? "Unauthorized" : status == 404 ? "Not Found" :
            status == 413 ? "Payload Too Large" : status == 409 ? "Action Failed" : "Bad Request";
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
