package com.autamedica.companion;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Bitmap;
import android.graphics.ColorSpace;
import android.graphics.Path;
import android.graphics.Rect;
import android.hardware.HardwareBuffer;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

public final class AccessibilityControlService extends AccessibilityService {
    private static volatile AccessibilityControlService instance;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final CompanionEventBus eventBus = CompanionEventBus.shared();
    private final SnapshotRegistry snapshotRegistry = new SnapshotRegistry();
    private LocalControlServer server;
    private LocalCdpProxy cdpProxy;

    static final class ActionResult {
        final boolean ok;
        final String reason;
        final String message;
        final JSONObject data;

        private ActionResult(boolean ok, String reason, String message, JSONObject data) {
            this.ok = ok;
            this.reason = reason == null ? "" : reason;
            this.message = message == null ? "" : message;
            this.data = data;
        }

        static ActionResult success() {
            return new ActionResult(true, "", "", null);
        }

        static ActionResult success(JSONObject data) {
            return new ActionResult(true, "", "", data);
        }

        static ActionResult fail(String reason, String message) {
            return new ActionResult(false, reason, message, null);
        }

        static ActionResult fail(String reason, String message, JSONObject data) {
            return new ActionResult(false, reason, message, data);
        }

        JSONObject toJson(long currentGeneration) throws Exception {
            JSONObject out = data == null ? new JSONObject() : new JSONObject(data.toString());
            out.put("ok", ok);
            out.put("currentGeneration", currentGeneration);
            if (!ok) {
                if (!reason.isEmpty()) out.put("reason", reason);
                out.put("error", message.isEmpty() ? (reason.isEmpty() ? "action_failed" : reason) : message);
            }
            return out;
        }
    }

    public static boolean isConnected() {
        return instance != null;
    }

    CompanionEventBus getEventBus() {
        return eventBus;
    }

    SnapshotRegistry getSnapshotRegistry() {
        return snapshotRegistry;
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
        if (event == null) return;
        String pkg = safe(event.getPackageName());
        if (isImePackage(pkg)) return;
        int type = event.getEventType();
        if (type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            eventBus.record("window_state_changed", pkg, safe(event.getClassName()), true);
        } else if (type == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            eventBus.recordContentChanged(pkg);
        } else if (type == AccessibilityEvent.TYPE_VIEW_SCROLLED) {
            eventBus.record("view_scrolled", pkg, safe(event.getClassName()), true);
        } else if (type == AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED) {
            if (!event.isPassword()) {
                StringBuilder sb = new StringBuilder();
                List<CharSequence> texts = event.getText();
                if (texts != null) {
                    for (CharSequence t : texts) {
                        if (t != null && t.length() > 0) {
                            if (sb.length() > 0) sb.append(" ");
                            sb.append(t);
                        }
                    }
                }
                if (sb.length() > 0) {
                    eventBus.record("toast", pkg, sb.toString(), false);
                }
            }
        }
    }

    @Override public void onInterrupt() {
        // Android controls the service lifecycle.
    }

    @Override public void onDestroy() {
        if (server != null) server.stop();
        server = null;
        if (cdpProxy != null) cdpProxy.stop();
        cdpProxy = null;
        snapshotRegistry.clear();
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
        List<AccessibilityWindowInfo> windows = getWindows();
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
        String s = pkg.toString().toLowerCase(Locale.ROOT);
        return s.contains("inputmethod") || s.contains("keyboard") || s.contains("gboard") || s.contains("swiftkey");
    }

    private String activePackageOnMain() {
        AccessibilityNodeInfo root = resolveActiveRoot();
        if (root == null) return "";
        try {
            return safe(root.getPackageName());
        } finally {
            root.recycle();
        }
    }

    String getActivePackage() throws Exception {
        return onMain(this::activePackageOnMain);
    }

    ActionResult checkPackageGuardOnMain(String expectedPackage) throws Exception {
        if (expectedPackage == null || expectedPackage.trim().isEmpty()) return null;
        String expected = expectedPackage.trim();
        String actual = activePackageOnMain();
        if (!expected.equals(actual)) {
            JSONObject data = new JSONObject();
            data.put("expectedPackage", expected);
            data.put("actualPackage", actual);
            return ActionResult.fail(
                "package_mismatch",
                "Expected foreground package '" + expected + "' but active package is '" + actual + "'",
                data
            );
        }
        return null;
    }

    ActionResult checkPackageGuard(String expectedPackage) throws Exception {
        if (expectedPackage == null || expectedPackage.trim().isEmpty()) return null;
        return onMain(() -> checkPackageGuardOnMain(expectedPackage));
    }

    JSONObject getUiTree() throws Exception {
        return onMain(() -> {
            JSONObject result = new JSONObject();
            AccessibilityNodeInfo root = resolveActiveRoot();
            if (root == null) {
                result.put("available", false);
                result.put("generation", eventBus.getGeneration());
                result.put("nodes", new JSONArray());
                return result;
            }
            Counter counter = new Counter();
            result.put("available", true);
            result.put("package", safe(root.getPackageName()));
            result.put("generation", eventBus.getGeneration());
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
                result.put("generation", eventBus.getGeneration());
                result.put("elements", new JSONArray());
                return result;
            }
            String pkg = safe(root.getPackageName());
            long generation = eventBus.getGeneration();
            Rect rootBounds = new Rect();
            root.getBoundsInScreen(rootBounds);
            JSONArray elements = new JSONArray();
            List<SnapshotRegistry.NodeEntry> entries = new ArrayList<>();
            Counter scanned = new Counter();
            collectCompactNodes(root, "0", 0, scanned, elements, entries);
            SnapshotRegistry.Snapshot snapshot = snapshotRegistry.record(pkg, generation, entries);
            result.put("available", true);
            result.put("snapshotId", snapshot.snapshotId);
            result.put("generation", snapshot.generation);
            result.put("capturedAtMs", snapshot.capturedAtMs);
            result.put("package", pkg);
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
            JSONArray out,
            List<SnapshotRegistry.NodeEntry> entries) throws Exception {
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
            || clickable || editable || checkable || scrollable;

        if (meaningful) {
            String ref = "e" + (out.length() + 1);
            String cls = simpleClassName(node.getClassName());
            String viewId = safe(node.getViewIdResourceName());
            Rect bounds = new Rect();
            node.getBoundsInScreen(bounds);

            JSONObject item = new JSONObject();
            item.put("ref", ref);
            item.put("path", path);
            item.put("class", cls);
            if (!text.isEmpty()) item.put("text", text);
            if (!desc.isEmpty()) item.put("description", desc);
            if (!hint.isEmpty()) item.put("hint", hint);
            if (!stateDesc.isEmpty()) item.put("stateDescription", stateDesc);
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
            item.put("bounds", new JSONArray().put(bounds.left).put(bounds.top).put(bounds.right).put(bounds.bottom));
            out.put(item);

            entries.add(new SnapshotRegistry.NodeEntry(
                ref, path, cls, viewId, text, desc, hint,
                new int[]{bounds.left, bounds.top, bounds.right, bounds.bottom},
                clickable, editable, scrollable
            ));
        }

        if (depth < MAX_COMPACT_DEPTH) {
            int childCount = node.getChildCount();
            for (int i = 0; i < childCount && scanned.value < MAX_COMPACT_SCAN && out.length() < MAX_COMPACT_ELEMENTS; i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) {
                    collectCompactNodes(child, path + "." + i, depth + 1, scanned, out, entries);
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
        Rect bounds = new Rect();
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

    private static String simpleClassName(CharSequence raw) {
        String cls = safe(raw);
        int dot = cls.lastIndexOf('.');
        return dot >= 0 ? cls.substring(dot + 1) : cls;
    }

    private static String safe(CharSequence value) {
        return value == null ? "" : value.toString();
    }

    private static final class Counter { int value = 0; }

    private static final class ResolvedTarget {
        final AccessibilityNodeInfo node;
        final SnapshotRegistry.NodeEntry entry;
        final ActionResult error;

        ResolvedTarget(AccessibilityNodeInfo node, SnapshotRegistry.NodeEntry entry, ActionResult error) {
            this.node = node;
            this.entry = entry;
            this.error = error;
        }
    }

    /**
     * Resolves a node target on the main thread using either transactional (snapshotId + ref)
     * or direct tree path, always enforcing expectedPackage and fingerprint verification.
     */
    private ResolvedTarget resolveTargetOnMain(
            String path,
            String ref,
            String snapshotId,
            String expectedPackage,
            boolean strictGeneration) throws Exception {
        ActionResult pkgError = checkPackageGuardOnMain(expectedPackage);
        if (pkgError != null) return new ResolvedTarget(null, null, pkgError);

        String cleanRef = ref == null ? "" : ref.trim();
        String cleanPath = path == null ? "" : path.trim();
        String actualPkg = activePackageOnMain();

        if (!cleanRef.isEmpty()) {
            SnapshotRegistry.Resolution res = snapshotRegistry.resolve(
                snapshotId, cleanRef, expectedPackage, actualPkg, eventBus.getGeneration(), strictGeneration
            );
            if (!res.ok) {
                JSONObject data = new JSONObject();
                data.put("actualPackage", res.actualPackage);
                if (!res.expectedPackage.isEmpty()) data.put("expectedPackage", res.expectedPackage);
                if (snapshotId != null && !snapshotId.isEmpty()) data.put("snapshotId", snapshotId);
                data.put("ref", cleanRef);
                return new ResolvedTarget(null, null, ActionResult.fail(res.reason, res.message, data));
            }
            AccessibilityNodeInfo node = nodeAtPath(res.entry.path);
            if (node == null) {
                JSONObject data = new JSONObject()
                    .put("snapshotId", res.snapshot.snapshotId)
                    .put("ref", cleanRef)
                    .put("path", res.entry.path)
                    .put("actualPackage", actualPkg);
                return new ResolvedTarget(null, null, ActionResult.fail("stale_snapshot", "Node at path " + res.entry.path + " no longer exists", data));
            }
            boolean isPassword = node.isPassword();
            boolean match = SnapshotRegistry.matchesFingerprint(
                res.entry,
                simpleClassName(node.getClassName()),
                safe(node.getViewIdResourceName()),
                isPassword ? "[redacted]" : safe(node.getText()),
                isPassword ? "" : safe(node.getContentDescription())
            );
            if (!match) {
                node.recycle();
                JSONObject data = new JSONObject()
                    .put("snapshotId", res.snapshot.snapshotId)
                    .put("ref", cleanRef)
                    .put("path", res.entry.path)
                    .put("actualPackage", actualPkg);
                return new ResolvedTarget(null, null, ActionResult.fail("node_drifted", "Live node at " + res.entry.path + " changed since snapshot " + res.snapshot.snapshotId, data));
            }
            return new ResolvedTarget(node, res.entry, null);
        }

        if (cleanPath.isEmpty()) {
            return new ResolvedTarget(null, null, ActionResult.fail("missing_target", "Either 'path' or 'ref' is required"));
        }
        AccessibilityNodeInfo node = nodeAtPath(cleanPath);
        if (node == null) {
            return new ResolvedTarget(null, null, ActionResult.fail("not_found", "Node not found at path: " + cleanPath));
        }
        return new ResolvedTarget(node, null, null);
    }

    ActionResult clickTarget(String path, String ref, String snapshotId, String expectedPackage, boolean strictGeneration) throws Exception {
        return onMain(() -> {
            ResolvedTarget target = resolveTargetOnMain(path, ref, snapshotId, expectedPackage, strictGeneration);
            if (target.error != null) return target.error;
            try {
                boolean ok = clickNodeOrAncestor(target.node);
                return ok ? ActionResult.success() : ActionResult.fail("action_failed", "Click action returned false");
            } finally {
                target.node.recycle();
            }
        });
    }

    boolean clickPath(String path) throws Exception {
        return clickTarget(path, null, null, null, false).ok;
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

    private boolean longClickNodeOrAncestor(AccessibilityNodeInfo node) {
        AccessibilityNodeInfo current = node;
        boolean result = false;
        int depth = 0;
        while (current != null && depth < 6) {
            if (current.isEnabled() && current.isLongClickable()) {
                result = current.performAction(AccessibilityNodeInfo.ACTION_LONG_CLICK);
                break;
            }
            AccessibilityNodeInfo parent = current.getParent();
            if (current != node) current.recycle();
            current = parent;
            depth++;
        }
        if (current != null && current != node) current.recycle();
        if (!result && node.isEnabled()) {
            result = node.performAction(AccessibilityNodeInfo.ACTION_LONG_CLICK);
        }
        return result;
    }

    ActionResult setTextTarget(String path, String ref, String snapshotId, String text, String expectedPackage, boolean strictGeneration) throws Exception {
        return onMain(() -> {
            ResolvedTarget resolved = resolveTargetOnMain(path, ref, snapshotId, expectedPackage, strictGeneration);
            if (resolved.error != null) return resolved.error;
            AccessibilityNodeInfo node = resolved.node;
            AccessibilityNodeInfo target = node;
            try {
                if (!target.isEditable()) {
                    AccessibilityNodeInfo nested = findFirstEditableDescendant(target, 0);
                    if (nested != null) target = nested;
                }
                if (target.isPassword()) {
                    return ActionResult.fail("password_blocked", "Refusing to inject text into password field");
                }
                if (!target.isEnabled()) {
                    return ActionResult.fail("node_disabled", "Target editable node is disabled");
                }
                Bundle args = new Bundle();
                args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text == null ? "" : text);
                boolean ok = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
                if (!ok) {
                    target.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
                    ok = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
                }
                return ok ? ActionResult.success() : ActionResult.fail("action_failed", "ACTION_SET_TEXT returned false");
            } finally {
                if (target != node && target != null) target.recycle();
                node.recycle();
            }
        });
    }

    boolean setTextAtPath(String path, String text) throws Exception {
        return setTextTarget(path, null, null, text, null, false).ok;
    }

    ActionResult imeAction(String path, String ref, String snapshotId, String expectedPackage, boolean strictGeneration) throws Exception {
        if (Build.VERSION.SDK_INT < 30) {
            return ActionResult.fail("unsupported_api", "ACTION_IME_ENTER requires Android 11 (API 30+)");
        }
        return onMain(() -> {
            ActionResult pkgError = checkPackageGuardOnMain(expectedPackage);
            if (pkgError != null) return pkgError;

            AccessibilityNodeInfo target = null;
            boolean hasExplicitTarget = (path != null && !path.trim().isEmpty()) || (ref != null && !ref.trim().isEmpty());
            if (hasExplicitTarget) {
                ResolvedTarget resolved = resolveTargetOnMain(path, ref, snapshotId, expectedPackage, strictGeneration);
                if (resolved.error != null) return resolved.error;
                target = resolved.node;
            } else {
                AccessibilityNodeInfo root = resolveActiveRoot();
                if (root == null) return ActionResult.fail("no_active_window", "No active accessibility window");
                try {
                    target = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                } finally {
                    root.recycle();
                }
            }
            if (target == null) {
                return ActionResult.fail("not_found", "No focused or targeted input node for ime_action");
            }
            try {
                if (!target.isEnabled()) return ActionResult.fail("node_disabled", "Target node is disabled");
                boolean ok = target.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
                if (!ok) {
                    target.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
                    ok = target.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
                }
                return ok ? ActionResult.success() : ActionResult.fail("action_failed", "ACTION_IME_ENTER returned false");
            } finally {
                target.recycle();
            }
        });
    }

    ActionResult longPress(
            String path,
            String ref,
            String snapshotId,
            Double x,
            Double y,
            long durationMs,
            String expectedPackage,
            boolean strictGeneration) throws Exception {
        long clampedDuration = Math.max(400L, Math.min(3000L, durationMs));
        if (x != null && y != null) {
            ActionResult pkgError = checkPackageGuard(expectedPackage);
            if (pkgError != null) return pkgError;
            boolean ok = dispatchGestureBlocking(x.floatValue(), y.floatValue(), x.floatValue(), y.floatValue(), clampedDuration);
            return ok ? ActionResult.success() : ActionResult.fail("gesture_failed", "long_press gesture failed");
        }

        float[] fallbackCenter = new float[2];
        boolean[] hasFallback = new boolean[1];
        ActionResult nodeRes = onMain(() -> {
            ResolvedTarget resolved = resolveTargetOnMain(path, ref, snapshotId, expectedPackage, strictGeneration);
            if (resolved.error != null) return resolved.error;
            try {
                if (longClickNodeOrAncestor(resolved.node)) {
                    return ActionResult.success(new JSONObject().put("mode", "a11y_long_click"));
                }
                Rect bounds = new Rect();
                resolved.node.getBoundsInScreen(bounds);
                if (bounds.width() > 0 && bounds.height() > 0) {
                    fallbackCenter[0] = bounds.exactCenterX();
                    fallbackCenter[1] = bounds.exactCenterY();
                    hasFallback[0] = true;
                }
                return null;
            } finally {
                resolved.node.recycle();
            }
        });
        if (nodeRes != null) return nodeRes;
        if (!hasFallback[0]) {
            return ActionResult.fail("action_failed", "Target node does not support long_click and has empty bounds");
        }
        boolean ok = dispatchGestureBlocking(fallbackCenter[0], fallbackCenter[1], fallbackCenter[0], fallbackCenter[1], clampedDuration);
        return ok
            ? ActionResult.success(new JSONObject().put("mode", "gesture_hold").put("x", fallbackCenter[0]).put("y", fallbackCenter[1]))
            : ActionResult.fail("gesture_failed", "long_press gesture fallback failed");
    }

    ActionResult doubleTap(
            String path,
            String ref,
            String snapshotId,
            Double x,
            Double y,
            long intervalMs,
            String expectedPackage,
            boolean strictGeneration) throws Exception {
        long gapMs = Math.max(40L, Math.min(250L, intervalMs));
        float tx;
        float ty;
        if (x != null && y != null) {
            ActionResult pkgError = checkPackageGuard(expectedPackage);
            if (pkgError != null) return pkgError;
            tx = x.floatValue();
            ty = y.floatValue();
        } else {
            float[] center = new float[2];
            ActionResult resolveErr = onMain(() -> {
                ResolvedTarget resolved = resolveTargetOnMain(path, ref, snapshotId, expectedPackage, strictGeneration);
                if (resolved.error != null) return resolved.error;
                try {
                    Rect bounds = new Rect();
                    resolved.node.getBoundsInScreen(bounds);
                    if (bounds.width() <= 0 || bounds.height() <= 0) {
                        return ActionResult.fail("empty_bounds", "Target node has empty screen bounds");
                    }
                    center[0] = bounds.exactCenterX();
                    center[1] = bounds.exactCenterY();
                    return null;
                } finally {
                    resolved.node.recycle();
                }
            });
            if (resolveErr != null) return resolveErr;
            tx = center[0];
            ty = center[1];
        }

        boolean ok = dispatchDoubleTapBlocking(tx, ty, gapMs);
        return ok
            ? ActionResult.success(new JSONObject().put("x", tx).put("y", ty))
            : ActionResult.fail("gesture_failed", "double_tap gesture failed");
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

    ActionResult clickText(String query, String viewId, long timeoutMs, String expectedPackage) throws Exception {
        long clampedTimeout = Math.max(0L, Math.min(15_000L, timeoutMs));
        long deadline = SystemClock.uptimeMillis() + clampedTimeout;
        String needle = query == null ? "" : query.toLowerCase(Locale.ROOT);
        while (true) {
            long genBefore = eventBus.getGeneration();
            ActionResult attempt = onMain(() -> {
                ActionResult pkgError = checkPackageGuardOnMain(expectedPackage);
                if (pkgError != null) return pkgError;

                AccessibilityNodeInfo root = resolveActiveRoot();
                if (root == null) return null;
                try {
                    if (viewId != null && !viewId.isEmpty()) {
                        List<AccessibilityNodeInfo> byId = root.findAccessibilityNodeInfosByViewId(viewId);
                        if (byId != null) {
                            for (AccessibilityNodeInfo candidate : byId) {
                                boolean ok = clickNodeOrAncestor(candidate);
                                candidate.recycle();
                                if (ok) return ActionResult.success();
                            }
                        }
                    }
                    if (!needle.isEmpty()) {
                        AccessibilityNodeInfo match = findFirstMatchingNode(root, needle, 0);
                        if (match != null) {
                            boolean ok = clickNodeOrAncestor(match);
                            if (match != root) match.recycle();
                            if (ok) return ActionResult.success();
                        }
                    }
                    return null;
                } finally {
                    root.recycle();
                }
            });
            if (attempt != null) return attempt;
            long remaining = deadline - SystemClock.uptimeMillis();
            if (remaining <= 0L) {
                return ActionResult.fail("timeout", "Element not found within timeout: " + (query.isEmpty() ? viewId : query));
            }
            // Reactive event-driven wait instead of blind fixed sleep
            eventBus.awaitUiGenerationChange(genBefore, Math.min(remaining, 350L));
        }
    }

    boolean clickText(String query, String viewId, long timeoutMs) throws Exception {
        return clickText(query, viewId, timeoutMs, null).ok;
    }

    ActionResult waitForText(String query, String viewId, String expectedPackage, long timeoutMs) throws Exception {
        long start = SystemClock.uptimeMillis();
        long clampedTimeout = Math.max(0L, Math.min(20_000L, timeoutMs));
        long deadline = start + clampedTimeout;
        String needle = query == null ? "" : query.toLowerCase(Locale.ROOT).trim();
        String vid = viewId == null ? "" : viewId.trim();
        if (needle.isEmpty() && vid.isEmpty()) {
            return ActionResult.fail("missing_query", "wait_for_text requires 'text' or 'view_id'");
        }

        while (true) {
            long genBefore = eventBus.getGeneration();
            ActionResult check = onMain(() -> {
                ActionResult pkgError = checkPackageGuardOnMain(expectedPackage);
                if (pkgError != null) return pkgError;

                AccessibilityNodeInfo root = resolveActiveRoot();
                if (root == null) return null;
                try {
                    String pkg = safe(root.getPackageName());
                    JSONObject matched = findMatchingNodeSummary(root, needle, vid);
                    if (matched != null) {
                        JSONObject data = new JSONObject();
                        data.put("found", true);
                        data.put("package", pkg);
                        data.put("element", matched);
                        data.put("elapsedMs", SystemClock.uptimeMillis() - start);
                        return ActionResult.success(data);
                    }
                    return null;
                } finally {
                    root.recycle();
                }
            });
            if (check != null) return check;

            long remaining = deadline - SystemClock.uptimeMillis();
            if (remaining <= 0L) {
                JSONObject data = new JSONObject()
                    .put("found", false)
                    .put("elapsedMs", SystemClock.uptimeMillis() - start);
                return ActionResult.fail("timeout", "Text not found within " + clampedTimeout + "ms: " + (needle.isEmpty() ? vid : query), data);
            }
            eventBus.awaitUiGenerationChange(genBefore, Math.min(remaining, 400L));
        }
    }

    ActionResult assertPackage(String expectedPackage, long timeoutMs) throws Exception {
        if (expectedPackage == null || expectedPackage.trim().isEmpty()) {
            return ActionResult.fail("missing_package", "assert_package requires 'package'");
        }
        String expected = expectedPackage.trim();
        long start = SystemClock.uptimeMillis();
        long clampedTimeout = Math.max(0L, Math.min(15_000L, timeoutMs));
        long deadline = start + clampedTimeout;

        while (true) {
            long seqBefore = eventBus.getLatestSeq();
            String actual = getActivePackage();
            if (expected.equals(actual)) {
                JSONObject data = new JSONObject()
                    .put("package", actual)
                    .put("elapsedMs", SystemClock.uptimeMillis() - start);
                return ActionResult.success(data);
            }
            long remaining = deadline - SystemClock.uptimeMillis();
            if (remaining <= 0L) {
                JSONObject data = new JSONObject()
                    .put("expectedPackage", expected)
                    .put("actualPackage", actual)
                    .put("elapsedMs", SystemClock.uptimeMillis() - start);
                return ActionResult.fail("package_mismatch", "Expected package '" + expected + "' but found '" + actual + "'", data);
            }
            eventBus.awaitEvent(seqBefore, Collections.singleton("window_state_changed"), expected, null, Math.min(remaining, 400L));
        }
    }

    private JSONObject findMatchingNodeSummary(AccessibilityNodeInfo root, String needle, String viewId) throws Exception {
        if (viewId != null && !viewId.isEmpty()) {
            List<AccessibilityNodeInfo> byId = root.findAccessibilityNodeInfosByViewId(viewId);
            if (byId != null && !byId.isEmpty()) {
                AccessibilityNodeInfo first = byId.get(0);
                JSONObject summary = summarizeNode(first, "");
                for (AccessibilityNodeInfo item : byId) item.recycle();
                return summary;
            }
        }
        if (needle != null && !needle.isEmpty()) {
            String[] matchedPath = new String[1];
            AccessibilityNodeInfo found = findFirstMatchingNodeWithPath(root, needle, "0", 0, matchedPath);
            if (found != null) {
                JSONObject summary = summarizeNode(found, matchedPath[0]);
                if (found != root) found.recycle();
                return summary;
            }
        }
        return null;
    }

    private JSONObject summarizeNode(AccessibilityNodeInfo node, String path) throws Exception {
        JSONObject item = new JSONObject();
        boolean isPassword = node.isPassword();
        if (path != null && !path.isEmpty()) item.put("path", path);
        item.put("class", simpleClassName(node.getClassName()));
        String text = isPassword ? "[redacted]" : safe(node.getText()).trim();
        String desc = isPassword ? "" : safe(node.getContentDescription()).trim();
        String vid = safe(node.getViewIdResourceName());
        if (!text.isEmpty()) item.put("text", text);
        if (!desc.isEmpty()) item.put("description", desc);
        if (!vid.isEmpty()) item.put("viewId", vid);
        Rect b = new Rect();
        node.getBoundsInScreen(b);
        item.put("bounds", new JSONArray().put(b.left).put(b.top).put(b.right).put(b.bottom));
        return item;
    }

    private AccessibilityNodeInfo findFirstMatchingNode(AccessibilityNodeInfo node, String needle, int depth) {
        if (node == null || depth > MAX_COMPACT_DEPTH) return null;
        String text = safe(node.getText()).toLowerCase(Locale.ROOT);
        String desc = safe(node.getContentDescription()).toLowerCase(Locale.ROOT);
        String hint = safe(node.getHintText()).toLowerCase(Locale.ROOT);
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

    private AccessibilityNodeInfo findFirstMatchingNodeWithPath(
            AccessibilityNodeInfo node,
            String needle,
            String path,
            int depth,
            String[] outPath) {
        if (node == null || depth > MAX_COMPACT_DEPTH) return null;
        String text = safe(node.getText()).toLowerCase(Locale.ROOT);
        String desc = safe(node.getContentDescription()).toLowerCase(Locale.ROOT);
        String hint = safe(node.getHintText()).toLowerCase(Locale.ROOT);
        if (text.contains(needle) || desc.contains(needle) || hint.contains(needle)) {
            outPath[0] = path;
            return node;
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            AccessibilityNodeInfo found = findFirstMatchingNodeWithPath(child, needle, path + "." + i, depth + 1, outPath);
            if (found != null) {
                if (found != child) child.recycle();
                return found;
            }
            child.recycle();
        }
        return null;
    }

    ActionResult scroll(
            String direction,
            String path,
            String ref,
            String snapshotId,
            String expectedPackage,
            boolean strictGeneration) throws Exception {
        String dir = direction == null ? "forward" : direction.trim().toLowerCase(Locale.ROOT);
        return onMain(() -> {
            ActionResult pkgError = checkPackageGuardOnMain(expectedPackage);
            if (pkgError != null) return pkgError;

            AccessibilityNodeInfo target = null;
            boolean explicit = (path != null && !path.trim().isEmpty()) || (ref != null && !ref.trim().isEmpty());
            if (explicit) {
                ResolvedTarget resolved = resolveTargetOnMain(path, ref, snapshotId, expectedPackage, strictGeneration);
                if (resolved.error != null) return resolved.error;
                target = findScrollableSelfOrRelative(resolved.node);
                if (target != resolved.node) resolved.node.recycle();
            } else {
                AccessibilityNodeInfo root = resolveActiveRoot();
                if (root == null) return ActionResult.fail("no_active_window", "No active accessibility window");
                try {
                    target = findBestScrollableNode(root, 0);
                    if (target == root) {
                        // Perform action before recycling root in finally
                        boolean ok = performDirectionalScroll(target, dir);
                        return ok ? ActionResult.success() : ActionResult.fail("scroll_failed", "Scroll returned false");
                    }
                } finally {
                    root.recycle();
                }
            }

            if (target == null) {
                return ActionResult.fail("not_scrollable", "No scrollable container found");
            }
            try {
                boolean ok = performDirectionalScroll(target, dir);
                return ok ? ActionResult.success() : ActionResult.fail("scroll_failed", "Scroll action returned false (possibly end of list)");
            } finally {
                target.recycle();
            }
        });
    }

    boolean scroll(boolean forward) throws Exception {
        return scroll(forward ? "forward" : "backward", null, null, null, null, false).ok;
    }

    private boolean performDirectionalScroll(AccessibilityNodeInfo scrollable, String dir) {
        int primaryAction;
        int fallbackAction;
        switch (dir) {
            case "backward":
            case "up":
                primaryAction = AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_UP.getId();
                fallbackAction = AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
                break;
            case "left":
                primaryAction = AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_LEFT.getId();
                fallbackAction = AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
                break;
            case "right":
                primaryAction = AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_RIGHT.getId();
                fallbackAction = AccessibilityNodeInfo.ACTION_SCROLL_FORWARD;
                break;
            case "down":
            case "forward":
            default:
                primaryAction = AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_DOWN.getId();
                fallbackAction = AccessibilityNodeInfo.ACTION_SCROLL_FORWARD;
                break;
        }
        if (scrollable.performAction(primaryAction)) return true;
        return scrollable.performAction(fallbackAction);
    }

    private AccessibilityNodeInfo findScrollableSelfOrRelative(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.isScrollable()) return node;
        AccessibilityNodeInfo desc = findBestScrollableNode(node, 0);
        if (desc != null) return desc;
        AccessibilityNodeInfo current = node.getParent();
        int depth = 0;
        while (current != null && depth < 6) {
            if (current.isScrollable()) return current;
            AccessibilityNodeInfo parent = current.getParent();
            current.recycle();
            current = parent;
            depth++;
        }
        if (current != null) current.recycle();
        return null;
    }

    /**
     * Picks the largest visible scrollable container (prefers vertical feed/list over small horizontal chips).
     */
    private AccessibilityNodeInfo findBestScrollableNode(AccessibilityNodeInfo root, int depth) {
        AccessibilityNodeInfo[] best = new AccessibilityNodeInfo[1];
        long[] bestArea = new long[]{-1L};
        scanBestScrollable(root, depth, best, bestArea);
        return best[0];
    }

    private void scanBestScrollable(AccessibilityNodeInfo node, int depth, AccessibilityNodeInfo[] best, long[] bestArea) {
        if (node == null || depth > MAX_TREE_DEPTH) return;
        if (node.isScrollable()) {
            Rect r = new Rect();
            node.getBoundsInScreen(r);
            long area = (long) Math.max(0, r.width()) * (long) Math.max(0, r.height());
            if (area > bestArea[0]) {
                if (best[0] != null) best[0].recycle();
                best[0] = AccessibilityNodeInfo.obtain(node);
                bestArea[0] = area;
            }
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            scanBestScrollable(child, depth + 1, best, bestArea);
            child.recycle();
        }
    }

    /**
     * Native scroll_until loop: searches for text/viewId, scrolling up to maxScrolls times in
     * a single HTTP request with reactive Event Bus waits between scrolls.
     */
    ActionResult scrollUntil(
            String query,
            String viewId,
            String containerPath,
            String containerRef,
            String snapshotId,
            String direction,
            int maxScrolls,
            long delayMs,
            boolean clickMatch,
            String expectedPackage) throws Exception {
        long start = SystemClock.uptimeMillis();
        String needle = query == null ? "" : query.toLowerCase(Locale.ROOT).trim();
        String vid = viewId == null ? "" : viewId.trim();
        if (needle.isEmpty() && vid.isEmpty()) {
            return ActionResult.fail("missing_query", "scroll_until requires 'text' or 'view_id'");
        }
        int limit = Math.max(1, Math.min(25, maxScrolls));
        long waitAfterScroll = Math.max(50L, Math.min(2000L, delayMs));
        String dir = direction == null ? "forward" : direction.trim().toLowerCase(Locale.ROOT);

        int scrollsPerformed = 0;
        for (int step = 0; step <= limit; step++) {
            ActionResult check = onMain(() -> {
                ActionResult pkgError = checkPackageGuardOnMain(expectedPackage);
                if (pkgError != null) return pkgError;
                AccessibilityNodeInfo root = resolveActiveRoot();
                if (root == null) return ActionResult.fail("no_active_window", "No active accessibility window");
                try {
                    JSONObject matched = null;
                    boolean clicked = false;
                    if (!vid.isEmpty()) {
                        List<AccessibilityNodeInfo> byId = root.findAccessibilityNodeInfosByViewId(vid);
                        if (byId != null && !byId.isEmpty()) {
                            AccessibilityNodeInfo first = byId.get(0);
                            matched = summarizeNode(first, "");
                            if (clickMatch) clicked = clickNodeOrAncestor(first);
                            for (AccessibilityNodeInfo item : byId) item.recycle();
                        }
                    }
                    if (matched == null && !needle.isEmpty()) {
                        String[] matchedPath = new String[1];
                        AccessibilityNodeInfo found = findFirstMatchingNodeWithPath(root, needle, "0", 0, matchedPath);
                        if (found != null) {
                            matched = summarizeNode(found, matchedPath[0]);
                            if (clickMatch) clicked = clickNodeOrAncestor(found);
                            if (found != root) found.recycle();
                        }
                    }
                    if (matched != null) {
                        JSONObject data = new JSONObject();
                        data.put("found", true);
                        data.put("clicked", clicked);
                        data.put("element", matched);
                        return ActionResult.success(data);
                    }
                    return null;
                } finally {
                    root.recycle();
                }
            });

            if (check != null) {
                if (check.ok && check.data != null) {
                    check.data.put("scrollsPerformed", scrollsPerformed);
                    check.data.put("elapsedMs", SystemClock.uptimeMillis() - start);
                }
                return check;
            }

            if (step == limit) break;

            long genBefore = eventBus.getGeneration();
            ActionResult scrollRes = scroll(dir, containerPath, containerRef, snapshotId, expectedPackage, false);
            if (!scrollRes.ok) {
                if ("package_mismatch".equals(scrollRes.reason)) return scrollRes;
                // Fallback to gesture swipe if accessibility container didn't respond
                android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
                int w = dm.widthPixels;
                int h = dm.heightPixels;
                boolean swiped;
                if ("backward".equals(dir) || "up".equals(dir)) {
                    swiped = dispatchGestureBlocking(w * 0.5f, h * 0.30f, w * 0.5f, h * 0.72f, 300L);
                } else if ("left".equals(dir)) {
                    swiped = dispatchGestureBlocking(w * 0.20f, h * 0.5f, w * 0.80f, h * 0.5f, 280L);
                } else if ("right".equals(dir)) {
                    swiped = dispatchGestureBlocking(w * 0.80f, h * 0.5f, w * 0.20f, h * 0.5f, 280L);
                } else {
                    swiped = dispatchGestureBlocking(w * 0.5f, h * 0.72f, w * 0.5f, h * 0.28f, 300L);
                }
                if (!swiped) break;
            }
            scrollsPerformed++;
            // Wait reactively for UI settle after scroll
            eventBus.awaitUiGenerationChange(genBefore, waitAfterScroll);
            Thread.sleep(Math.min(60L, waitAfterScroll));
        }

        JSONObject data = new JSONObject()
            .put("found", false)
            .put("scrollsPerformed", scrollsPerformed)
            .put("elapsedMs", SystemClock.uptimeMillis() - start);
        return ActionResult.fail("not_found", "Target not found after " + scrollsPerformed + " scrolls: " + (needle.isEmpty() ? vid : query), data);
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

    ActionResult pasteText(String text, String expectedPackage) throws Exception {
        ActionResult pkgError = checkPackageGuard(expectedPackage);
        if (pkgError != null) return pkgError;
        if (text != null) setClipboard(text);
        return onMain(() -> {
            AccessibilityNodeInfo root = resolveActiveRoot();
            if (root == null) return ActionResult.fail("no_active_window", "No active accessibility window");
            AccessibilityNodeInfo target = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            boolean result = false;
            if (target != null && target.isEditable() && !target.isPassword()) {
                result = target.performAction(AccessibilityNodeInfo.ACTION_PASTE);
                target.recycle();
            }
            root.recycle();
            return result ? ActionResult.success() : ActionResult.fail("action_failed", "ACTION_PASTE returned false");
        });
    }

    boolean pasteText(String text) throws Exception {
        return pasteText(text, null).ok;
    }

    private AccessibilityNodeInfo nodeAtPath(String path) {
        AccessibilityNodeInfo node = resolveActiveRoot();
        if (node == null) return null;
        String[] parts = path.split("\\.");
        if (parts.length == 0 || !"0".equals(parts[0])) {
            node.recycle();
            return null;
        }
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

    ActionResult tapGuarded(float x, float y, String expectedPackage) throws Exception {
        ActionResult pkgError = checkPackageGuard(expectedPackage);
        if (pkgError != null) return pkgError;
        boolean ok = dispatchGestureBlocking(x, y, x, y, 80L);
        return ok ? ActionResult.success() : ActionResult.fail("gesture_failed", "tap gesture failed");
    }

    boolean tap(float x, float y) throws Exception {
        return tapGuarded(x, y, null).ok;
    }

    ActionResult swipeGuarded(float x1, float y1, float x2, float y2, long durationMs, String expectedPackage) throws Exception {
        ActionResult pkgError = checkPackageGuard(expectedPackage);
        if (pkgError != null) return pkgError;
        boolean ok = dispatchGestureBlocking(x1, y1, x2, y2, durationMs);
        return ok ? ActionResult.success() : ActionResult.fail("gesture_failed", "swipe gesture failed");
    }

    boolean swipe(float x1, float y1, float x2, float y2, long durationMs) throws Exception {
        return swipeGuarded(x1, y1, x2, y2, durationMs, null).ok;
    }

    private boolean dispatchGestureBlocking(float x1, float y1, float x2, float y2, long durationMs) throws Exception {
        Path path = new Path();
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);
        GestureDescription gesture = new GestureDescription.Builder()
            .addStroke(new GestureDescription.StrokeDescription(path, 0, Math.max(20L, durationMs)))
            .build();
        return runGesture(gesture, durationMs + 2500L);
    }

    private boolean dispatchDoubleTapBlocking(float x, float y, long intervalMs) throws Exception {
        long tapMs = 55L;
        Path p1 = new Path();
        p1.moveTo(x, y);
        Path p2 = new Path();
        p2.moveTo(x, y);
        GestureDescription gesture = new GestureDescription.Builder()
            .addStroke(new GestureDescription.StrokeDescription(p1, 0, tapMs))
            .addStroke(new GestureDescription.StrokeDescription(p2, tapMs + intervalMs, tapMs))
            .build();
        return runGesture(gesture, tapMs * 2 + intervalMs + 2500L);
    }

    private boolean runGesture(GestureDescription gesture, long timeoutMs) throws Exception {
        CompletableFuture<Boolean> future = new CompletableFuture<>();
        boolean dispatched = onMain(() -> dispatchGesture(gesture, new GestureResultCallback() {
            @Override public void onCompleted(GestureDescription gestureDescription) {
                future.complete(true);
            }

            @Override public void onCancelled(GestureDescription gestureDescription) {
                future.complete(false);
            }
        }, mainHandler));
        if (!dispatched) return false;
        return future.get(Math.max(1500L, timeoutMs), TimeUnit.MILLISECONDS);
    }

    ActionResult typeTextGuarded(String text, String expectedPackage) throws Exception {
        return onMain(() -> {
            ActionResult pkgError = checkPackageGuardOnMain(expectedPackage);
            if (pkgError != null) return pkgError;
            AccessibilityNodeInfo root = resolveActiveRoot();
            if (root == null) return ActionResult.fail("no_active_window", "No active accessibility window");
            AccessibilityNodeInfo target = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            boolean result = false;
            if (target != null && target.isEditable() && !target.isPassword()) {
                Bundle args = new Bundle();
                args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
                result = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
                target.recycle();
            }
            root.recycle();
            return result ? ActionResult.success() : ActionResult.fail("action_failed", "No focused editable input node");
        });
    }

    boolean typeText(String text) throws Exception {
        return typeTextGuarded(text, null).ok;
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
        long deadline = SystemClock.uptimeMillis() + 2500;
        while (SystemClock.uptimeMillis() < deadline) {
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
            List<android.content.pm.ApplicationInfo> apps = pm.getInstalledApplications(0);
            Collections.sort(apps, (a, b) -> a.packageName.compareTo(b.packageName));
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

    JSONObject getRecentEvents(long sinceSeq, int limit, Set<String> types, String packageFilter) throws Exception {
        List<CompanionEventBus.Event> events = eventBus.recent(sinceSeq, limit, types, packageFilter);
        JSONArray arr = new JSONArray();
        for (CompanionEventBus.Event ev : events) {
            arr.put(serializeEvent(ev));
        }
        JSONObject out = new JSONObject();
        out.put("ok", true);
        out.put("latestSeq", eventBus.getLatestSeq());
        out.put("generation", eventBus.getGeneration());
        out.put("currentPackage", eventBus.getCurrentPackage());
        out.put("events", arr);
        return out;
    }

    JSONObject waitForEvent(long sinceSeq, Set<String> types, String packageFilter, String textContains, long timeoutMs) throws Exception {
        long start = SystemClock.uptimeMillis();
        CompanionEventBus.Event ev = eventBus.awaitEvent(sinceSeq, types, packageFilter, textContains, timeoutMs);
        JSONObject out = new JSONObject();
        out.put("ok", ev != null);
        out.put("matched", ev != null);
        out.put("latestSeq", eventBus.getLatestSeq());
        out.put("generation", eventBus.getGeneration());
        out.put("currentPackage", eventBus.getCurrentPackage());
        out.put("elapsedMs", SystemClock.uptimeMillis() - start);
        if (ev != null) {
            out.put("event", serializeEvent(ev));
        } else {
            out.put("reason", "timeout");
        }
        return out;
    }

    private static JSONObject serializeEvent(CompanionEventBus.Event ev) throws Exception {
        return new JSONObject()
            .put("seq", ev.seq)
            .put("generation", ev.generation)
            .put("timestampMs", ev.timestampMs)
            .put("type", ev.type)
            .put("package", ev.packageName)
            .put("detail", ev.detail);
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
