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
import android.view.accessibility.AccessibilityWindowInfo;

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

    private static final int MAX_TREE_DEPTH = 24;
    private static final int MAX_TREE_NODES = 1200;
    private static final int MAX_COMPACT_DEPTH = 28;
    private static final int MAX_COMPACT_SCAN = 2500;
    private static final int MAX_COMPACT_ELEMENTS = 400;

    private AccessibilityNodeInfo resolveActiveRoot() {
        AccessibilityNodeInfo active = getRootInActiveWindow();
        if (active != null && active.getChildCount() > 0 && !isImePackage(active.getPackageName())) {
            return active;
        }
        java.util.List<AccessibilityWindowInfo> windows = getWindows();
        AccessibilityNodeInfo best = null;
        int bestScore = -1;
        if (windows != null) {
            for (AccessibilityWindowInfo win : windows) {
                if (win == null || win.getType() != AccessibilityWindowInfo.TYPE_APPLICATION) continue;
                AccessibilityNodeInfo root = win.getRoot();
                if (root == null) continue;
                int score = (win.isFocused() ? 1000 : 0) + (win.isActive() ? 500 : 0) + Math.min(root.getChildCount(), 100);
                if (score > bestScore) {
                    if (best != null) best.recycle();
                    best = root;
                    bestScore = score;
                } else {
                    root.recycle();
                }
            }
        }
        if (best != null) {
            if (active != null) active.recycle();
            return best;
        }
        return active;
    }

    private static boolean isImePackage(CharSequence pkg) {
        if (pkg == null) return false;
        String s = pkg.toString().toLowerCase(java.util.Locale.ROOT);
        return s.contains("inputmethod") || s.contains("keyboard") || s.contains("gboard") || s.contains("swiftkey");
    }

    JSONObject getUiTree() throws Exception {
        return onMain(() -> {
            JSONObject result = new JSONObject();
            AccessibilityNodeInfo root = resolveActiveRoot();
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

    JSONObject getCompactUi() throws Exception {
        return onMain(() -> {
            JSONObject result = new JSONObject();
            AccessibilityNodeInfo root = resolveActiveRoot();
            if (root == null) {
                result.put("available", false);
                result.put("elements", new JSONArray());
                return result;
            }
            android.graphics.Rect rootBounds = new android.graphics.Rect();
            root.getBoundsInScreen(rootBounds);
            JSONArray elements = new JSONArray();
            Counter scanned = new Counter();
            collectCompactNodes(root, "0", 0, scanned, elements);
            result.put("available", true);
            result.put("package", String.valueOf(root.getPackageName()));
            result.put("bounds", new JSONArray().put(rootBounds.left).put(rootBounds.top).put(rootBounds.right).put(rootBounds.bottom));
            result.put("scannedCount", scanned.value);
            result.put("elementCount", elements.length());
            result.put("elements", elements);
            root.recycle();
            return result;
        });
    }

    private void collectCompactNodes(
            AccessibilityNodeInfo node,
            String path,
            int depth,
            Counter scanned,
            JSONArray out) throws Exception {
        if (node == null || depth > MAX_COMPACT_DEPTH || scanned.value >= MAX_COMPACT_SCAN || out.length() >= MAX_COMPACT_ELEMENTS) {
            return;
        }
        scanned.value++;
        boolean isPassword = node.isPassword();
        String text = isPassword ? "[redacted]" : safe(node.getText()).trim();
        String desc = isPassword ? "" : safe(node.getContentDescription()).trim();
        String hint = isPassword ? "" : safe(node.getHintText()).trim();
        String stateDesc = (Build.VERSION.SDK_INT >= 30 && !isPassword) ? safe(node.getStateDescription()).trim() : "";
        boolean clickable = node.isClickable();
        boolean editable = node.isEditable();
        boolean checkable = node.isCheckable();
        boolean scrollable = node.isScrollable();

        boolean meaningful = !text.isEmpty() || !desc.isEmpty() || !hint.isEmpty() || !stateDesc.isEmpty()
            || clickable || editable || checkable;

        if (meaningful) {
            JSONObject item = new JSONObject();
            item.put("ref", "e" + (out.length() + 1));
            item.put("path", path);
            String cls = safe(node.getClassName());
            int dot = cls.lastIndexOf('.');
            item.put("class", dot >= 0 ? cls.substring(dot + 1) : cls);
            if (!text.isEmpty()) item.put("text", text);
            if (!desc.isEmpty()) item.put("description", desc);
            if (!hint.isEmpty()) item.put("hint", hint);
            if (!stateDesc.isEmpty()) item.put("stateDescription", stateDesc);
            String viewId = safe(node.getViewIdResourceName());
            if (!viewId.isEmpty()) item.put("viewId", viewId);
            if (clickable) item.put("clickable", true);
            if (editable) item.put("editable", true);
            if (checkable) {
                item.put("checkable", true);
                item.put("checked", node.isChecked());
            }
            if (scrollable) item.put("scrollable", true);
            if (node.isFocused()) item.put("focused", true);
            if (node.isSelected()) item.put("selected", true);
            if (!node.isEnabled()) item.put("enabled", false);
            if (isPassword) item.put("password", true);
            android.graphics.Rect bounds = new android.graphics.Rect();
            node.getBoundsInScreen(bounds);
            item.put("bounds", new JSONArray().put(bounds.left).put(bounds.top).put(bounds.right).put(bounds.bottom));
            out.put(item);
        }

        if (depth < MAX_COMPACT_DEPTH) {
            int childCount = node.getChildCount();
            for (int i = 0; i < childCount && scanned.value < MAX_COMPACT_SCAN && out.length() < MAX_COMPACT_ELEMENTS; i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) {
                    collectCompactNodes(child, path + "." + i, depth + 1, scanned, out);
                    child.recycle();
                }
            }
        }
    }

    private JSONObject serializeNode(AccessibilityNodeInfo node, String path, int depth, Counter counter) throws Exception {
        JSONObject item = new JSONObject();
        counter.value++;
        boolean isPassword = node.isPassword();
        item.put("path", path);
        item.put("class", safe(node.getClassName()));
        item.put("text", isPassword ? "[redacted]" : safe(node.getText()));
        item.put("description", isPassword ? "" : safe(node.getContentDescription()));
        item.put("hint", isPassword ? "" : safe(node.getHintText()));
        item.put("stateDescription", (Build.VERSION.SDK_INT >= 30 && !isPassword) ? safe(node.getStateDescription()) : "");
        item.put("viewId", safe(node.getViewIdResourceName()));
        item.put("clickable", node.isClickable());
        item.put("editable", node.isEditable());
        item.put("checkable", node.isCheckable());
        item.put("checked", node.isChecked());
        item.put("scrollable", node.isScrollable());
        item.put("enabled", node.isEnabled());
        item.put("focused", node.isFocused());
        item.put("selected", node.isSelected());
        item.put("password", isPassword);
        android.graphics.Rect bounds = new android.graphics.Rect();
        node.getBoundsInScreen(bounds);
        item.put("bounds", new JSONArray().put(bounds.left).put(bounds.top).put(bounds.right).put(bounds.bottom));

        JSONArray children = new JSONArray();
        if (depth < MAX_TREE_DEPTH && counter.value < MAX_TREE_NODES) {
            for (int i = 0; i < node.getChildCount() && counter.value < MAX_TREE_NODES; i++) {
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
            boolean result = clickNodeOrAncestor(node);
            node.recycle();
            return result;
        });
    }

    private boolean clickNodeOrAncestor(AccessibilityNodeInfo node) {
        AccessibilityNodeInfo current = node;
        boolean result = false;
        int depth = 0;
        while (current != null && depth < 6) {
            if (current.isEnabled() && current.isClickable()) {
                result = current.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                break;
            }
            AccessibilityNodeInfo parent = current.getParent();
            if (current != node) current.recycle();
            current = parent;
            depth++;
        }
        if (current != null && current != node) current.recycle();
        if (!result && node.isEnabled()) {
            result = node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        }
        return result;
    }

    boolean setTextAtPath(String path, String text) throws Exception {
        return onMain(() -> {
            AccessibilityNodeInfo node = nodeAtPath(path);
            if (node == null) return false;
            AccessibilityNodeInfo target = node;
            try {
                if (!target.isEditable()) {
                    AccessibilityNodeInfo nested = findFirstEditableDescendant(target, 0);
                    if (nested != null) target = nested;
                }
                if (target.isPassword() || !target.isEnabled()) return false;
                Bundle args = new Bundle();
                args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text == null ? "" : text);
                boolean ok = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
                if (!ok) {
                    target.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
                    ok = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
                }
                return ok;
            } finally {
                if (target != node && target != null) target.recycle();
                node.recycle();
            }
        });
    }

    private AccessibilityNodeInfo findFirstEditableDescendant(AccessibilityNodeInfo node, int depth) {
        if (node == null || depth > 3) return null;
        if (node.isEditable()) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            AccessibilityNodeInfo found = findFirstEditableDescendant(child, depth + 1);
            if (found != null) {
                if (found != child) child.recycle();
                return found;
            }
            child.recycle();
        }
        return null;
    }

    boolean clickText(String query, String viewId, long timeoutMs) throws Exception {
        long deadline = android.os.SystemClock.uptimeMillis() + Math.max(0, Math.min(15000, timeoutMs));
        String needle = query == null ? "" : query.toLowerCase(java.util.Locale.ROOT);
        while (true) {
            boolean clicked = onMain(() -> {
                AccessibilityNodeInfo root = resolveActiveRoot();
                if (root == null) return false;
                try {
                    if (viewId != null && !viewId.isEmpty()) {
                        java.util.List<AccessibilityNodeInfo> byId = root.findAccessibilityNodeInfosByViewId(viewId);
                        if (byId != null) {
                            for (AccessibilityNodeInfo candidate : byId) {
                                boolean ok = clickNodeOrAncestor(candidate);
                                candidate.recycle();
                                if (ok) return true;
                            }
                        }
                    }
                    if (!needle.isEmpty()) {
                        AccessibilityNodeInfo match = findFirstMatchingNode(root, needle, 0);
                        if (match != null) {
                            boolean ok = clickNodeOrAncestor(match);
                            if (match != root) match.recycle();
                            return ok;
                        }
                    }
                    return false;
                } finally {
                    root.recycle();
                }
            });
            if (clicked) return true;
            if (android.os.SystemClock.uptimeMillis() >= deadline) return false;
            Thread.sleep(250);
        }
    }

    private AccessibilityNodeInfo findFirstMatchingNode(AccessibilityNodeInfo node, String needle, int depth) {
        if (node == null || depth > MAX_COMPACT_DEPTH) return null;
        String text = safe(node.getText()).toLowerCase(java.util.Locale.ROOT);
        String desc = safe(node.getContentDescription()).toLowerCase(java.util.Locale.ROOT);
        String hint = safe(node.getHintText()).toLowerCase(java.util.Locale.ROOT);
        if (text.contains(needle) || desc.contains(needle) || hint.contains(needle)) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            AccessibilityNodeInfo found = findFirstMatchingNode(child, needle, depth + 1);
            if (found != null) {
                if (found != child) child.recycle();
                return found;
            }
            child.recycle();
        }
        return null;
    }

    boolean scroll(boolean forward) throws Exception {
        return onMain(() -> {
            AccessibilityNodeInfo root = resolveActiveRoot();
            if (root == null) return false;
            try {
                AccessibilityNodeInfo scrollable = findScrollableNode(root, 0);
                if (scrollable == null) return false;
                int action = forward ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
                boolean ok = scrollable.performAction(action);
                if (scrollable != root) scrollable.recycle();
                return ok;
            } finally {
                root.recycle();
            }
        });
    }

    private AccessibilityNodeInfo findScrollableNode(AccessibilityNodeInfo node, int depth) {
        if (node == null || depth > MAX_TREE_DEPTH) return null;
        if (node.isScrollable()) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            AccessibilityNodeInfo found = findScrollableNode(child, depth + 1);
            if (found != null) {
                if (found != child) child.recycle();
                return found;
            }
            child.recycle();
        }
        return null;
    }

    String getClipboard() throws Exception {
        return onMain(() -> {
            android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return "";
            android.content.ClipData clip = cm.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return "";
            CharSequence text = clip.getItemAt(0).coerceToText(this);
            return text == null ? "" : text.toString();
        });
    }

    boolean setClipboard(String text) throws Exception {
        return onMain(() -> {
            android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (cm == null) return false;
            cm.setPrimaryClip(android.content.ClipData.newPlainText("autamedica", text == null ? "" : text));
            return true;
        });
    }

    boolean pasteText(String text) throws Exception {
        if (text != null) setClipboard(text);
        return onMain(() -> {
            AccessibilityNodeInfo root = resolveActiveRoot();
            if (root == null) return false;
            AccessibilityNodeInfo target = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            boolean result = false;
            if (target != null && target.isEditable() && !target.isPassword()) {
                result = target.performAction(AccessibilityNodeInfo.ACTION_PASTE);
                target.recycle();
            }
            root.recycle();
            return result;
        });
    }

    private AccessibilityNodeInfo nodeAtPath(String path) {
        AccessibilityNodeInfo node = resolveActiveRoot();
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
            AccessibilityNodeInfo root = resolveActiveRoot();
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

    JSONArray listPackages() throws Exception {
        return onMain(() -> {
            JSONArray packages = new JSONArray();
            android.content.pm.PackageManager pm = getPackageManager();
            java.util.List<android.content.pm.ApplicationInfo> apps = pm.getInstalledApplications(0);
            java.util.Collections.sort(apps, (a, b) -> a.packageName.compareTo(b.packageName));
            for (android.content.pm.ApplicationInfo app : apps) {
                if (pm.getLaunchIntentForPackage(app.packageName) != null) {
                    packages.put(app.packageName);
                }
            }
            return packages;
        });
    }

    JSONObject getDeviceInfo() throws Exception {
        return onMain(() -> {
            JSONObject info = new JSONObject();
            info.put("model", Build.MODEL);
            info.put("manufacturer", Build.MANUFACTURER);
            info.put("sdkInt", Build.VERSION.SDK_INT);
            info.put("release", Build.VERSION.RELEASE);

            android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
            info.put("widthPx", dm.widthPixels);
            info.put("heightPx", dm.heightPixels);
            info.put("densityDpi", dm.densityDpi);

            android.content.Intent battery = registerReceiver(null, new android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED));
            if (battery != null) {
                int level = battery.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
                int scale = battery.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, 100);
                int plugged = battery.getIntExtra(android.os.BatteryManager.EXTRA_PLUGGED, 0);
                info.put("batteryPercent", scale > 0 ? (level * 100) / scale : level);
                info.put("plugged", plugged != 0);
                info.put("pluggedType", plugged);
            }

            try {
                info.put("screenOffTimeoutMs", android.provider.Settings.System.getInt(getContentResolver(), android.provider.Settings.System.SCREEN_OFF_TIMEOUT));
            } catch (Exception ignored) {}
            try {
                info.put("stayOnWhilePluggedIn", android.provider.Settings.Global.getInt(getContentResolver(), android.provider.Settings.Global.STAY_ON_WHILE_PLUGGED_IN));
            } catch (Exception ignored) {}
            return info;
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
