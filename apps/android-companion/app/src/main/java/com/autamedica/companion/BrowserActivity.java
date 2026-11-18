package com.autamedica.companion;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.CookieManager;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

public final class BrowserActivity extends Activity {
    private static volatile BrowserActivity instance;
    private WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        instance = this;
        // This is intentional: Autamedica Companion exposes CDP through a separately
        // authenticated loopback proxy for the owner's local Codex/Playwright client.
        WebView.setWebContentsDebuggingEnabled(true);
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setBlockNetworkLoads(false);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(webView);
        String url = getIntent().getStringExtra("url");
        if (url != null) webView.loadUrl(url);
    }

    @Override protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String url = intent.getStringExtra("url");
        if (url != null && webView != null) webView.loadUrl(url);
    }

    @Override protected void onDestroy() {
        if (instance == this) instance = null;
        if (webView != null) { webView.stopLoading(); webView.destroy(); webView = null; }
        super.onDestroy();
    }

    public static void navigate(String url) throws Exception {
        BrowserActivity a = require();
        a.onMain(() -> { a.webView.loadUrl(url); return true; });
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

    private static BrowserActivity require() {
        BrowserActivity a = instance;
        if (a == null || a.webView == null) throw new IllegalStateException("Browser not open; call browser_navigate first");
        return a;
    }

    private <T> T onMain(java.util.concurrent.Callable<T> action) throws Exception {
        if (Looper.myLooper() == Looper.getMainLooper()) return action.call();
        CompletableFuture<T> result = new CompletableFuture<>();
        main.post(() -> { try { result.complete(action.call()); } catch (Throwable e) { result.completeExceptionally(e); } });
        return result.get(8, TimeUnit.SECONDS);
    }
}
