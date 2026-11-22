package com.autamedica.companion;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

public final class BrowserActivity extends Activity {
    private static volatile BrowserActivity instance;
    private WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());
    private static final int FILE_CHOOSER_REQUEST = 18771;
    private android.webkit.ValueCallback<Uri[]> pendingFileChooser;
    private volatile int loadProgress = 0;

    static boolean isReady() {
        BrowserActivity activity = instance;
        return activity != null && activity.webView != null;
    }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        instance = this;

        // Chromium's WebView DevTools socket is bridged locally with a separate
        // 256-bit authenticated proxy. No public or Wi-Fi CDP listener is created.
        WebView.setWebContentsDebuggingEnabled(true);

        createAndAttachWebView();

        String requested = getIntent().getStringExtra("url");
        String restored = state == null ? SecureVault.get(this, "browser.lastUrl", "https://www.google.com")
            : state.getString("lastUrl", SecureVault.get(this, "browser.lastUrl", "https://www.google.com"));
        webView.loadUrl(isWebUrl(requested) ? requested : restored);
    }

    private void createAndAttachWebView() {
        loadProgress = 0;
        WebView created = new WebView(this);
        created.getSettings().setJavaScriptEnabled(true);
        created.getSettings().setDomStorageEnabled(true);
        created.getSettings().setDatabaseEnabled(true);
        created.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);
        created.getSettings().setSupportMultipleWindows(true);
        created.getSettings().setAllowFileAccess(false);
        created.getSettings().setAllowContentAccess(true);
        created.getSettings().setSafeBrowsingEnabled(true);
        created.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(created, true);
        created.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                loadProgress = 100;
                persistSession(url);
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return !("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme));
            }

            @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                if (view == webView) {
                    android.util.Log.w("AutamedicaBrowser", "WebView renderer gone (didCrash=" + detail.didCrash() + "); recreating WebView");
                    String last = SecureVault.get(BrowserActivity.this, "browser.lastUrl", "https://www.google.com");
                    try {
                        if (view.getParent() instanceof ViewGroup) {
                            ((ViewGroup) view.getParent()).removeView(view);
                        }
                        view.destroy();
                    } catch (Exception ignored) {}
                    webView = null;
                    main.post(() -> {
                        if (!isFinishing() && !isDestroyed()) {
                            createAndAttachWebView();
                            if (webView != null) webView.loadUrl(last);
                        }
                    });
                }
                return true;
            }
        });
        created.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int newProgress) {
                loadProgress = newProgress;
            }

            @Override public boolean onShowFileChooser(WebView view,
                    android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
                pendingFileChooser = callback;
                Intent chooser = params.createIntent();
                try {
                    startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    pendingFileChooser = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }

            @Override public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture,
                    android.os.Message resultMsg) {
                android.webkit.WebView.HitTestResult hit = view.getHitTestResult();
                String target = hit == null ? null : hit.getExtra();
                if (target != null && (target.startsWith("https://") || target.startsWith("http://"))) {
                    view.post(() -> view.loadUrl(target));
                }
                return false;
            }
        });
        created.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView = created;
        setContentView(created);
    }

    private void persistSession(String url) {
        CookieManager.getInstance().flush();
        if (isWebUrl(url)) {
            try { SecureVault.put(getApplicationContext(), "browser.lastUrl", url); }
            catch (Exception error) { android.util.Log.w("AutamedicaBrowser", "Could not persist browser URL"); }
        }
    }

    private static boolean isWebUrl(String value) {
        return value != null && (value.startsWith("https://") || value.startsWith("http://"));
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String url = intent.getStringExtra("url");
        if (isWebUrl(url) && webView != null) webView.loadUrl(url);
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        if (webView != null) out.putString("lastUrl", webView.getUrl());
        CookieManager.getInstance().flush();
        super.onSaveInstanceState(out);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && pendingFileChooser != null) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            pendingFileChooser.onReceiveValue(results);
            pendingFileChooser = null;
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override protected void onPause() {
        // Deliberately do not call WebView.onPause()/pauseTimers(): the owner can
        // keep a foreground runtime + PARTIAL_WAKE_LOCK while the display is off.
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
        if (webView != null) {
            persistSession(webView.getUrl());
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        if (instance == this) instance = null;
        super.onDestroy();
    }

    public static String evaluate(String script) throws Exception {
        BrowserActivity a = require();
        CompletableFuture<String> result = new CompletableFuture<>();
        a.onMain(() -> {
            a.webView.evaluateJavascript(script, value -> result.complete(value == null ? "null" : value));
            return true;
        });
        return result.get(15, TimeUnit.SECONDS);
    }

    public static org.json.JSONObject getState() throws Exception {
        org.json.JSONObject out = new org.json.JSONObject();
        BrowserActivity a = instance;
        if (a == null || a.webView == null) {
            out.put("ok", true);
            out.put("ready", false);
            out.put("url", "");
            out.put("title", "");
            out.put("progress", 0);
            out.put("canGoBack", false);
            out.put("canGoForward", false);
            return out;
        }
        return a.onMain(() -> {
            org.json.JSONObject s = new org.json.JSONObject();
            s.put("ok", true);
            s.put("ready", a.webView != null);
            s.put("url", a.webView != null && a.webView.getUrl() != null ? a.webView.getUrl() : "");
            s.put("title", a.webView != null && a.webView.getTitle() != null ? a.webView.getTitle() : "");
            s.put("progress", a.loadProgress);
            s.put("canGoBack", a.webView != null && a.webView.canGoBack());
            s.put("canGoForward", a.webView != null && a.webView.canGoForward());
            return s;
        });
    }

    public static boolean goBack() throws Exception {
        BrowserActivity a = require();
        return a.onMain(() -> {
            if (a.webView.canGoBack()) {
                a.webView.goBack();
                return true;
            }
            return false;
        });
    }

    public static boolean goForward() throws Exception {
        BrowserActivity a = require();
        return a.onMain(() -> {
            if (a.webView.canGoForward()) {
                a.webView.goForward();
                return true;
            }
            return false;
        });
    }

    public static boolean reloadPage() throws Exception {
        BrowserActivity a = require();
        return a.onMain(() -> {
            a.loadProgress = 0;
            a.webView.reload();
            return true;
        });
    }

    private static BrowserActivity require() {
        BrowserActivity a = instance;
        if (a == null || a.webView == null)
            throw new IllegalStateException("Browser not open; call browser_navigate first");
        return a;
    }

    private <T> T onMain(java.util.concurrent.Callable<T> action) throws Exception {
        if (Looper.myLooper() == Looper.getMainLooper()) return action.call();
        CompletableFuture<T> result = new CompletableFuture<>();
        main.post(() -> {
            try { result.complete(action.call()); }
            catch (Throwable error) { result.completeExceptionally(error); }
        });
        return result.get(8, TimeUnit.SECONDS);
    }
}
