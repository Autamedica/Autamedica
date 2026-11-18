package com.autamedica.companion;

import android.content.Context;
import android.net.LocalSocket;
import android.net.LocalSocketAddress;
import android.os.Process;

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

/** Authenticated TCP-to-abstract-socket relay for this app's Chromium WebView CDP endpoint. */
final class LocalCdpProxy {
    static final int PORT = 18766;
    private static final int MAX_HEADER = 64 * 1024;
    private final Context context;
    private final String socketName = "webview_devtools_remote_" + Process.myPid();
    private final ExecutorService clients = Executors.newCachedThreadPool();
    private volatile boolean running;
    private ServerSocket listener;

    LocalCdpProxy(Context context) {
        this.context = context.getApplicationContext();
    }

    void start() {
        if (running) return;
        running = true;
        Thread thread = new Thread(() -> {
            while (running) {
                try {
                    ServerSocket candidate = new ServerSocket(PORT, 32, InetAddress.getByName("127.0.0.1"));
                    listener = candidate;
                    while (running) {
                        Socket socket = candidate.accept();
                        clients.execute(() -> handle(socket));
                    }
                } catch (Exception error) {
                    if (running) {
                        android.util.Log.e("AutamedicaCDP", "CDP proxy listener failed; retrying", error);
                        try { Thread.sleep(1500); }
                        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); break; }
                    }
                } finally {
                    ServerSocket current = listener;
                    listener = null;
                    if (current != null) try { current.close(); } catch (Exception ignored) {}
                }
            }
        }, "autamedica-cdp-listener");
        thread.setDaemon(true);
        thread.start();
    }

    void stop() {
        running = false;
        try { if (listener != null) listener.close(); } catch (Exception ignored) {}
        clients.shutdownNow();
    }

    boolean isListening() {
        ServerSocket current = listener;
        return running && current != null && !current.isClosed();
    }

    boolean isWebViewSocketAvailable() {
        LocalSocket probe = new LocalSocket();
        try {
            probe.connect(new LocalSocketAddress(socketName, LocalSocketAddress.Namespace.ABSTRACT));
            return true;
        } catch (Exception unavailable) {
            return false;
        } finally {
            try { probe.close(); } catch (Exception ignored) {}
        }
    }

    private void handle(Socket client) {
        LocalSocket upstream = new LocalSocket();
        boolean handedOff = false;
        try {
            client.setSoTimeout(15000);
            InputStream clientIn = client.getInputStream();
            OutputStream clientOut = client.getOutputStream();
            byte[] requestHeader = readHeader(clientIn);
            String requestText = new String(requestHeader, StandardCharsets.ISO_8859_1);
            if (requestHeader.length == 0 || !authorized(requestText)) {
                writeError(clientOut, 401, "Unauthorized");
                return;
            }

            boolean websocket = requestText.toLowerCase(Locale.ROOT).contains("upgrade: websocket");
            String safeRequest = sanitizeRequest(requestText, websocket);
            upstream.connect(new LocalSocketAddress(socketName, LocalSocketAddress.Namespace.ABSTRACT));
            upstream.setSoTimeout(30000);
            OutputStream upstreamOut = upstream.getOutputStream();
            InputStream upstreamIn = upstream.getInputStream();
            upstreamOut.write(safeRequest.getBytes(StandardCharsets.ISO_8859_1));
            upstreamOut.flush();

            byte[] responseHeader = readHeader(upstreamIn);
            if (responseHeader.length == 0) {
                writeError(clientOut, 502, "Bad Gateway");
                return;
            }

            String responseText = new String(responseHeader, StandardCharsets.ISO_8859_1);
            if (websocket && responseText.startsWith("HTTP/1.1 101")) {
                client.setSoTimeout(0);
                upstream.setSoTimeout(0);
                clientOut.write(responseHeader);
                clientOut.flush();
                handedOff = true;
                relay(client, upstream, clientIn, clientOut, upstreamIn, upstreamOut);
                return;
            }

            int length = contentLength(responseText);
            byte[] responseBody;
            if (length >= 0) {
                responseBody = readExact(upstreamIn, length);
            } else if (responseText.toLowerCase(Locale.ROOT).contains("transfer-encoding: chunked")) {
                responseBody = readChunked(upstreamIn);
            } else {
                responseBody = new byte[0];
            }

            if (responseText.toLowerCase(Locale.ROOT).contains("content-type: application/json")) {
                String json = new String(responseBody, StandardCharsets.UTF_8);
                json = json.replaceAll("ws://(?:localhost|127\\.0\\.0\\.1)(?::[0-9]+)?/",
                    "ws://127.0.0.1:" + PORT + "/");
                responseBody = json.getBytes(StandardCharsets.UTF_8);
                responseText = replaceHeader(responseText, "Content-Length", String.valueOf(responseBody.length));
                responseText = removeHeader(responseText, "Transfer-Encoding");
                responseHeader = responseText.getBytes(StandardCharsets.ISO_8859_1);
            }

            clientOut.write(responseHeader);
            clientOut.write(responseBody);
            clientOut.flush();
        } catch (Exception error) {
            android.util.Log.w("AutamedicaCDP", "CDP relay request failed: " + error.getClass().getSimpleName());
            try { if (!handedOff) writeError(client.getOutputStream(), 503, "Service Unavailable"); }
            catch (Exception ignored) {}
        } finally {
            if (!handedOff) {
                try { upstream.close(); } catch (Exception ignored) {}
                try { client.close(); } catch (Exception ignored) {}
            }
        }
    }

    private boolean authorized(String headers) throws Exception {
        String supplied = "";
        for (String line : headers.split("\\r\\n")) {
            int colon = line.indexOf(':');
            if (colon > 0 && "authorization".equals(line.substring(0, colon).trim().toLowerCase(Locale.ROOT))) {
                supplied = line.substring(colon + 1).trim();
                break;
            }
        }
        String token = SecureVault.get(context, "control_token", "");
        return token.length() >= 64 && MessageDigest.isEqual(
            ("Bearer " + token).getBytes(StandardCharsets.UTF_8),
            supplied.getBytes(StandardCharsets.UTF_8));
    }

    private static String sanitizeRequest(String header, boolean websocket) {
        String[] lines = header.split("\\r\\n");
        StringBuilder out = new StringBuilder();
        for (String line : lines) {
            if (line.isEmpty()) continue;
            String lower = line.toLowerCase(Locale.ROOT);
            if (lower.startsWith("authorization:")) continue;
            if (!websocket && lower.startsWith("connection:")) continue;
            if (lower.startsWith("accept-encoding:")) continue;
            out.append(line).append("\r\n");
        }
        if (!websocket) {
            out.append("Accept-Encoding: identity\r\n");
            out.append("Connection: close\r\n");
        }
        out.append("\r\n");
        return out.toString();
    }

    private static byte[] readHeader(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int state = 0;
        while (out.size() < MAX_HEADER) {
            int value = in.read();
            if (value < 0) break;
            out.write(value);
            if ((state == 0 || state == 2) && value == 13) state++;
            else if ((state == 1 || state == 3) && value == 10) state++;
            else state = value == 13 ? 1 : 0;
            if (state == 4) return out.toByteArray();
        }
        if (out.size() >= MAX_HEADER) throw new IllegalArgumentException("HTTP header too large");
        return out.toByteArray();
    }

    private static int contentLength(String headers) {
        for (String line : headers.split("\\r\\n")) {
            if (line.toLowerCase(Locale.ROOT).startsWith("content-length:")) {
                try { return Integer.parseInt(line.substring(line.indexOf(':') + 1).trim()); }
                catch (NumberFormatException ignored) { return -1; }
            }
        }
        return -1;
    }

    private static String replaceHeader(String headers, String name, String value) {
        return setHeader(removeHeader(headers, name), name, value);
    }

    private static String setHeader(String headers, String name, String value) {
        int end = headers.indexOf("\r\n\r\n");
        if (end < 0) return headers;
        return headers.substring(0, end) + "\r\n" + name + ": " + value + "\r\n\r\n";
    }

    private static String removeHeader(String headers, String name) {
        StringBuilder result = new StringBuilder();
        for (String line : headers.split("\\r\\n")) {
            if (line.toLowerCase(Locale.ROOT).startsWith(name.toLowerCase(Locale.ROOT) + ":")) continue;
            if (!line.isEmpty()) result.append(line).append("\r\n");
        }
        return result.append("\r\n").toString();
    }

    private static byte[] readExact(InputStream in, int count) throws Exception {
        if (count < 0 || count > 8 * 1024 * 1024) throw new IllegalArgumentException("Invalid CDP response size");
        byte[] data = new byte[count];
        int offset = 0;
        while (offset < count) {
            int read = in.read(data, offset, count - offset);
            if (read < 0) throw new IllegalStateException("Unexpected end of CDP response");
            offset += read;
        }
        return data;
    }

    private static byte[] readChunked(InputStream in) throws Exception {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        while (body.size() < 8 * 1024 * 1024) {
            String sizeLine = readAsciiLine(in);
            int semicolon = sizeLine.indexOf(';');
            String hex = (semicolon >= 0 ? sizeLine.substring(0, semicolon) : sizeLine).trim();
            int size = Integer.parseInt(hex, 16);
            if (size == 0) {
                while (!readAsciiLine(in).isEmpty()) { /* consume trailers */ }
                break;
            }
            body.write(readExact(in, size));
            readExact(in, 2);
        }
        return body.toByteArray();
    }

    private static String readAsciiLine(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int previous = -1;
        while (out.size() < 8192) {
            int b = in.read();
            if (b < 0) break;
            if (previous == 13 && b == 10) {
                byte[] bytes = out.toByteArray();
                return new String(bytes, 0, Math.max(0, bytes.length - 1), StandardCharsets.US_ASCII);
            }
            out.write(b);
            previous = b;
        }
        return out.toString(StandardCharsets.US_ASCII.name());
    }

    private static void writeError(OutputStream out, int status, String reason) throws Exception {
        byte[] body = ("{\"error\":\"" + reason + "\"}").getBytes(StandardCharsets.UTF_8);
        out.write(("HTTP/1.1 " + status + " " + reason + "\r\nContent-Type: application/json\r\nContent-Length: "
            + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
        out.write(body);
        out.flush();
    }

    private static void relay(Socket client, LocalSocket upstream, InputStream clientIn, OutputStream clientOut,
                              InputStream upstreamIn, OutputStream upstreamOut) throws Exception {
        Thread clientToUpstream = new Thread(() -> {
            try { copy(clientIn, upstreamOut); }
            catch (Exception ignored) {}
            close(client, upstream);
        }, "autamedica-cdp-upload");
        clientToUpstream.setDaemon(true);
        clientToUpstream.start();
        try { copy(upstreamIn, clientOut); }
        finally { close(client, upstream); }
    }

    private static void copy(InputStream input, OutputStream output) throws Exception {
        byte[] buffer = new byte[16 * 1024];
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
            output.flush();
        }
    }

    private static void close(Socket client, LocalSocket upstream) {
        try { client.close(); } catch (Exception ignored) {}
        try { upstream.close(); } catch (Exception ignored) {}
    }
}
