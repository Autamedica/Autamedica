package com.autamedica.companion;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Bitmap;
import android.graphics.ColorSpace;
import android.graphics.Path;
import android.hardware.HardwareBuffer;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

public final class AccessibilityControlService extends AccessibilityService {
    private static volatile AccessibilityControlService instance;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private LocalControlServer server;
    private LocalCdpProxy cdpProxy;

    public static boolean isConnected() {
        return instance != null;
    }

    boolean isCdpListening() {
        return cdpProxy != null && cdpProxy.isListening();
    }

    boolean isWebViewSocketAvailable() {
        return cdpProxy != null && cdpProxy.isWebViewSocketAvailable();
    }

    @Override public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        server = new LocalControlServer(this);
        server.start();
        cdpProxy = new LocalCdpProxy(this);
        cdpProxy.start();
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        // Event data is deliberately not persisted or logged.
    }

    @Override public void onInterrupt() {
        // Android controls the service lifecycle.
    }

    @Override public void onDestroy() {
        if (server != null) server.stop();
        server = null;
        if (cdpProxy != null) cdpProxy.stop();
        cdpProxy = null;
        if (instance == this) instance = null;
        super.onDestroy();
    }

    <T> T onMain(Callable<T> work) throws Exception {
        if (Looper.myLooper() == Looper.getMainLooper()) return work.call();
        CompletableFuture<T> future = new CompletableFuture<>();
        mainHandler.post(() -> {
            try { future.complete(work.call()); }
            catch (Throwable error) { future.completeExceptionally(error); }
        });
        return future.get(8, TimeUnit.SECONDS);
    }

    JSONObject getUiTree() throws Exception {
        return onMain(() -> {
            JSONObject result = new JSONObject();
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) {
                result.put("available", false);
                result.put("nodes", new JSONArray());
                return result;
            }
            Counter counter = new Counter();
            result.put("available", true);
            result.put("package", String.valueOf(root.getPackageName()));
            result.put("root", serializeNode(root, "0", 0, counter));
            result.put("nodeCount", counter.value);
            root.recycle();
            return result;
        });
    }

    private JSONObject serializeNode(AccessibilityNodeInfo node, String path, int depth, Counter counter) throws Exception {
        JSONObject item = new JSONObject();
        counter.value++;
        item.put("path", path);
        item.put("class", safe(node.getClassName()));
        item.put("text", node.isPassword() ? "[redacted]" : safe(node.getText()));
        item.put("description", node.isPassword() ? "" : safe(node.getContentDescription()));
        item.put("viewId", safe(node.getViewIdResourceName()));
        item.put("clickable", node.isClickable());
        item.put("editable", node.isEditable());
        item.put("enabled", node.isEnabled());
        item.put("focused", node.isFocused());
        item.put("selected", node.isSelected());
        item.put("password", node.isPassword());
        android.graphics.Rect bounds = new android.graphics.Rect();
        node.getBoundsInScreen(bounds);
        item.put("bounds", new JSONArray().put(bounds.left).put(bounds.top).put(bounds.right).put(bounds.bottom));

        JSONArray children = new JSONArray();
        if (depth < 8 && counter.value < 300) {
            for (int i = 0; i < node.getChildCount() && counter.value < 300; i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) {
                    children.put(serializeNode(child, path + "." + i, depth + 1, counter));
                    child.recycle();
                }
            }
        }
        item.put("children", children);
        return item;
    }

    private static String safe(CharSequence value) {
        return value == null ? "" : value.toString();
    }

    private static final class Counter { int value = 0; }

    boolean clickPath(String path) throws Exception {
        return onMain(() -> {
            AccessibilityNodeInfo node = nodeAtPath(path);
            if (node == null) return false;
            boolean result = node.isEnabled() && node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            node.recycle();
            return result;
        });
    }

    private AccessibilityNodeInfo nodeAtPath(String path) {
        AccessibilityNodeInfo node = getRootInActiveWindow();
        if (node == null) return null;
        String[] parts = path.split("\\.");
        if (parts.length == 0 || !"0".equals(parts[0])) return null;
        for (int i = 1; i < parts.length; i++) {
            int index;
            try { index = Integer.parseInt(parts[i]); }
            catch (NumberFormatException error) { node.recycle(); return null; }
            if (index < 0 || index >= node.getChildCount()) { node.recycle(); return null; }
            AccessibilityNodeInfo child = node.getChild(index);
            node.recycle();
            node = child;
            if (node == null) return null;
        }
        return node;
    }

    boolean tap(float x, float y) throws Exception {
        return onMain(() -> dispatchPointGesture(x, y, x, y, 80));
    }

    boolean swipe(float x1, float y1, float x2, float y2, long durationMs) throws Exception {
        return onMain(() -> dispatchPointGesture(x1, y1, x2, y2, durationMs));
    }

    private boolean dispatchPointGesture(float x1, float y1, float x2, float y2, long durationMs) {
        Path path = new Path();
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);
        GestureDescription gesture = new GestureDescription.Builder()
            .addStroke(new GestureDescription.StrokeDescription(path, 0, durationMs))
            .build();
        return dispatchGesture(gesture, null, mainHandler);
    }

    boolean typeText(String text) throws Exception {
        return onMain(() -> {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) return false;
            AccessibilityNodeInfo target = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            boolean result = false;
            if (target != null && target.isEditable() && !target.isPassword()) {
                Bundle args = new Bundle();
                args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
                result = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
                target.recycle();
            }
            root.recycle();
            return result;
        });
    }

    boolean globalAction(int action) throws Exception {
        return onMain(() -> performGlobalAction(action));
    }

    boolean openBrowser(String url) throws Exception {
        boolean requested = onMain(() -> {
            android.content.Intent intent = new android.content.Intent(this, BrowserActivity.class);
            intent.putExtra("url", url);
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(intent);
            return true;
        });
        if (!requested) return false;
        long deadline = android.os.SystemClock.uptimeMillis() + 2500;
        while (android.os.SystemClock.uptimeMillis() < deadline) {
            if (BrowserActivity.isReady()) return true;
            Thread.sleep(100);
        }
        return BrowserActivity.isReady();
    }

    boolean openApp(String packageName) throws Exception {
        return onMain(() -> {
            android.content.Intent intent = getPackageManager().getLaunchIntentForPackage(packageName);
            if (intent == null) return false;
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        });
    }

    boolean openUrl(String value) throws Exception {
        return onMain(() -> {
            android.net.Uri uri = android.net.Uri.parse(value);
            String scheme = uri.getScheme();
            if (!"https".equals(scheme) && !"http".equals(scheme) && !"whatsapp".equals(scheme)) return false;
            android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW, uri);
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        });
    }

    String screenshotBase64() throws Exception {
        if (Build.VERSION.SDK_INT < 30) throw new IllegalStateException("Screenshots require Android 11 or newer");
        CompletableFuture<String> future = new CompletableFuture<>();
        onMain(() -> {
            takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
                @Override public void onSuccess(ScreenshotResult result) {
                    HardwareBuffer buffer = result.getHardwareBuffer();
                    Bitmap hardwareBitmap = null;
                    try {
                        ColorSpace colorSpace = result.getColorSpace();
                        hardwareBitmap = Bitmap.wrapHardwareBuffer(buffer, colorSpace);
                        if (hardwareBitmap == null) throw new IllegalStateException("Screenshot bitmap unavailable");
                        Bitmap bitmap = hardwareBitmap.copy(Bitmap.Config.ARGB_8888, false);
                        ByteArrayOutputStream output = new ByteArrayOutputStream();
                        bitmap.compress(Bitmap.CompressFormat.PNG, 100, output);
                        bitmap.recycle();
                        future.complete(Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                    } catch (Throwable error) {
                        future.completeExceptionally(error);
                    } finally {
                        if (hardwareBitmap != null) hardwareBitmap.recycle();
                        buffer.close();
                    }
                }

                @Override public void onFailure(int errorCode) {
                    future.completeExceptionally(new IllegalStateException("Android screenshot failed: " + errorCode));
                }
            });
            return true;
        });
        return future.get(12, TimeUnit.SECONDS);
    }
}
