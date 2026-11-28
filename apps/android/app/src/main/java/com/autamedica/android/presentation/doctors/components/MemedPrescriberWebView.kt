package com.autamedica.android.presentation.doctors.components

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.net.http.SslError
import android.os.Message
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.PrimaryDark
import kotlinx.coroutines.launch

private const val MEMED_JS_BRIDGE_NAME = "AutamedicaMemedBridge"

internal fun configureMemedCookieManager(webView: WebView) {
    val cookieManager = CookieManager.getInstance()
    cookieManager.setAcceptCookie(true)
    cookieManager.setAcceptThirdPartyCookies(webView, true)
    cookieManager.flush()
}

private class AutamedicaMemedJsBridge(
    private val onPayload: (String) -> Unit,
) {
    @JavascriptInterface
    fun onBridgeState(payload: String) {
        onPayload(payload)
    }
}

/**
 * Unified embedded Memed WebView for all Brazilian digital prescription and
 * certificate flows (standalone prescriptions, certificates/atestados, and
 * active video consultations).
 *
 * Security & continuity guarantees:
 * - Never writes Supabase cookies manually or embeds tokens in URLs.
 * - Loads a server-issued single-use session-exchange URL so `@supabase/ssr`
 *   establishes HttpOnly/Secure/SameSite=Lax session cookies on the server.
 * - Never opens external browsers, Chrome Custom Tabs, or third-party apps.
 * - Intercepts unexpected `/auth/login` redirects or 401/403 failures and
 *   presents an actionable retry/diagnostic surface without losing native state.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MemedPrescriberWebView(
    exchangeUrl: String,
    onRetryHandoff: suspend (forceRefreshSession: Boolean) -> Result<String>,
    @StringRes titleRes: Int = R.string.video_memed_title,
    @StringRes closeLabelRes: Int = R.string.clinical_ops_back,
    applyStatusBarPadding: Boolean = true,
    onClose: () -> Unit,
) {
    val webViewRef = remember { mutableStateOf<WebView?>(null) }
    val coroutineScope = rememberCoroutineScope()
    val retryController = remember(exchangeUrl) { MemedHandoffRetryController(maxAutoRetries = 1) }

    var activeUrl by remember(exchangeUrl) { mutableStateOf(exchangeUrl) }
    var webViewInstanceKey by remember(exchangeUrl) { mutableIntStateOf(0) }
    var isLoading by remember(exchangeUrl) { mutableStateOf(true) }
    var errorState by remember(exchangeUrl) { mutableStateOf<MemedWebViewErrorState?>(null) }
    var isRetrying by remember(exchangeUrl) { mutableStateOf(false) }

    fun executeRetry(forceRefreshSession: Boolean) {
        if (isRetrying) return
        isRetrying = true
        isLoading = true
        errorState = null
        coroutineScope.launch {
            val result = onRetryHandoff(forceRefreshSession)
            isRetrying = false
            result
                .onSuccess { freshExchangeUrl ->
                    activeUrl = freshExchangeUrl
                    val currentWebView = webViewRef.value
                    if (currentWebView != null) {
                        currentWebView.loadUrl(freshExchangeUrl)
                    } else {
                        webViewInstanceKey += 1
                    }
                }
                .onFailure { err ->
                    isLoading = false
                    errorState = MemedWebViewErrorState(
                        code = MemedWebViewErrorCode.EXCHANGE_UNAUTHORIZED,
                        diagnosticCode = "HANDOFF_RETRY_FAILED",
                        detailMessage = err.message,
                        canAutoRetry = false,
                    )
                }
        }
    }

    fun handleWebViewFailure(failure: MemedWebViewErrorState) {
        if (retryController.tryConsumeAutoRetry(failure)) {
            executeRetry(forceRefreshSession = true)
            return
        }
        isLoading = false
        errorState = failure
    }

    BackHandler(enabled = true) {
        val webView = webViewRef.value
        if (errorState == null && webView?.canGoBack() == true) {
            webView.goBack()
        } else {
            onClose()
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            webViewRef.value?.let { webView ->
                webView.removeJavascriptInterface(MEMED_JS_BRIDGE_NAME)
                webView.stopLoading()
                webView.loadUrl("about:blank")
                webView.clearHistory()
                webView.removeAllViews()
                webView.destroy()
            }
            webViewRef.value = null
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
            .let { base -> if (applyStatusBarPadding) base.statusBarsPadding() else base }
            .navigationBarsPadding()
            .imePadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(titleRes),
                color = Color(0xFF172033),
                fontWeight = FontWeight.SemiBold,
            )
            TextButton(
                onClick = onClose,
                modifier = Modifier.minimumInteractiveComponentSize(),
            ) {
                Text(stringResource(closeLabelRes), color = PrimaryDark)
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        ) {
            key(webViewInstanceKey) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { viewContext ->
                    WebView(viewContext).apply {
                        webViewRef.value = this
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.javaScriptCanOpenWindowsAutomatically = true
                        settings.setSupportMultipleWindows(true)
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        configureMemedCookieManager(this)

                        addJavascriptInterface(
                            AutamedicaMemedJsBridge { payloadJson ->
                                post {
                                    val event = MemedWebViewNavigationPolicy.parseBridgeEvent(payloadJson)
                                        ?: return@post
                                    if (event.type == "ready") {
                                        isLoading = false
                                        errorState = null
                                        return@post
                                    }
                                    if (event.code == "SESSION_RETRY_REQUESTED") {
                                        retryController.resetForManualRetry()
                                        executeRetry(forceRefreshSession = true)
                                        return@post
                                    }
                                    MemedWebViewNavigationPolicy.errorFromBridgeEvent(event)?.let { failure ->
                                        handleWebViewFailure(failure)
                                    }
                                }
                            },
                            MEMED_JS_BRIDGE_NAME,
                        )

                        webChromeClient = object : WebChromeClient() {
                            override fun onCreateWindow(
                                view: WebView?,
                                isDialog: Boolean,
                                isUserGesture: Boolean,
                                resultMsg: Message?,
                            ): Boolean {
                                val hostWebView = view ?: return false
                                val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false
                                val popupWebView = WebView(hostWebView.context)
                                popupWebView.webViewClient = object : WebViewClient() {
                                    override fun shouldOverrideUrlLoading(
                                        popup: WebView,
                                        request: WebResourceRequest,
                                    ): Boolean {
                                        val url = request.url.toString()
                                        when (MemedWebViewNavigationPolicy.classifyNavigation(url)) {
                                            MemedWebViewNavigationAction.RETURN_TO_APP -> onClose()
                                            MemedWebViewNavigationAction.INTERCEPT_LOGIN_REDIRECT ->
                                                handleWebViewFailure(
                                                    MemedWebViewErrorState(
                                                        code = MemedWebViewErrorCode.LOGIN_REDIRECT_BLOCKED,
                                                        diagnosticCode = "LOGIN_REDIRECT_BLOCKED",
                                                        canAutoRetry = true,
                                                    ),
                                                )
                                            MemedWebViewNavigationAction.ALLOW_IN_WEBVIEW ->
                                                hostWebView.loadUrl(url)
                                            MemedWebViewNavigationAction.BLOCK_EXTERNAL -> Unit
                                        }
                                        popup.destroy()
                                        return true
                                    }
                                }
                                transport.webView = popupWebView
                                resultMsg.sendToTarget()
                                return true
                            }
                        }

                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                view: WebView,
                                request: WebResourceRequest,
                            ): Boolean {
                                val url = request.url.toString()
                                return when (MemedWebViewNavigationPolicy.classifyNavigation(url)) {
                                    MemedWebViewNavigationAction.RETURN_TO_APP -> {
                                        onClose()
                                        true
                                    }
                                    MemedWebViewNavigationAction.INTERCEPT_LOGIN_REDIRECT -> {
                                        handleWebViewFailure(
                                            MemedWebViewErrorState(
                                                code = MemedWebViewErrorCode.LOGIN_REDIRECT_BLOCKED,
                                                diagnosticCode = "LOGIN_REDIRECT_BLOCKED",
                                                canAutoRetry = true,
                                            ),
                                        )
                                        true
                                    }
                                    MemedWebViewNavigationAction.ALLOW_IN_WEBVIEW -> false
                                    MemedWebViewNavigationAction.BLOCK_EXTERNAL -> true
                                }
                            }

                            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                val currentUrl = url.orEmpty()
                                if (MemedWebViewNavigationPolicy.classifyNavigation(currentUrl) ==
                                    MemedWebViewNavigationAction.INTERCEPT_LOGIN_REDIRECT
                                ) {
                                    view?.stopLoading()
                                    handleWebViewFailure(
                                        MemedWebViewErrorState(
                                            code = MemedWebViewErrorCode.LOGIN_REDIRECT_BLOCKED,
                                            diagnosticCode = "LOGIN_REDIRECT_BLOCKED",
                                            canAutoRetry = true,
                                        ),
                                    )
                                    return
                                }
                                isLoading = true
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                val currentUrl = url.orEmpty()
                                if (MemedWebViewNavigationPolicy.classifyNavigation(currentUrl) ==
                                    MemedWebViewNavigationAction.INTERCEPT_LOGIN_REDIRECT
                                ) {
                                    handleWebViewFailure(
                                        MemedWebViewErrorState(
                                            code = MemedWebViewErrorCode.LOGIN_REDIRECT_BLOCKED,
                                            diagnosticCode = "LOGIN_REDIRECT_BLOCKED",
                                            canAutoRetry = true,
                                        ),
                                    )
                                    return
                                }
                                CookieManager.getInstance().flush()
                                isLoading = false
                            }

                            override fun onReceivedHttpError(
                                view: WebView,
                                request: WebResourceRequest,
                                errorResponse: WebResourceResponse,
                            ) {
                                MemedWebViewNavigationPolicy.classifyHttpError(
                                    requestUrl = request.url.toString(),
                                    statusCode = errorResponse.statusCode,
                                    isForMainFrame = request.isForMainFrame,
                                )?.let { failure ->
                                    handleWebViewFailure(failure)
                                }
                            }

                            override fun onReceivedError(
                                view: WebView,
                                request: WebResourceRequest,
                                error: WebResourceError,
                            ) {
                                if (!request.isForMainFrame) return
                                handleWebViewFailure(
                                    MemedWebViewErrorState(
                                        code = MemedWebViewErrorCode.PROVIDER_OR_NETWORK_ERROR,
                                        diagnosticCode = "WEBVIEW_NET_${error.errorCode}",
                                        canAutoRetry = false,
                                    ),
                                )
                            }

                            override fun onReceivedSslError(
                                view: WebView,
                                handler: SslErrorHandler,
                                error: SslError,
                            ) {
                                handler.cancel()
                                handleWebViewFailure(
                                    MemedWebViewErrorState(
                                        code = MemedWebViewErrorCode.SSL_ERROR,
                                        diagnosticCode = "SSL_HANDSHAKE_REJECTED",
                                        canAutoRetry = false,
                                    ),
                                )
                            }

                            override fun onRenderProcessGone(
                                view: WebView,
                                detail: RenderProcessGoneDetail,
                            ): Boolean {
                                (view.parent as? ViewGroup)?.removeView(view)
                                view.removeJavascriptInterface(MEMED_JS_BRIDGE_NAME)
                                view.destroy()
                                if (webViewRef.value === view) {
                                    webViewRef.value = null
                                }
                                handleWebViewFailure(
                                    MemedWebViewErrorState(
                                        code = MemedWebViewErrorCode.RENDER_PROCESS_GONE,
                                        diagnosticCode = if (detail.didCrash()) {
                                            "WEBVIEW_RENDERER_CRASHED"
                                        } else {
                                            "WEBVIEW_RENDERER_KILLED"
                                        },
                                        canAutoRetry = false,
                                    ),
                                )
                                return true
                            }
                        }

                        loadUrl(activeUrl)
                    }
                },
                update = {},
            )
            }

            errorState?.let { error ->
                MemedWebViewErrorOverlay(
                    error = error,
                    closeLabelRes = closeLabelRes,
                    onRetry = {
                        retryController.resetForManualRetry()
                        executeRetry(forceRefreshSession = true)
                    },
                    onClose = onClose,
                )
            }

            if (isLoading && errorState == null) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.White.copy(alpha = 0.92f))
                        .semantics { liveRegion = LiveRegionMode.Polite },
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.padding(24.dp),
                    ) {
                        CircularProgressIndicator()
                        Text(
                            text = stringResource(R.string.memed_webview_loading),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(0xFF334155),
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MemedWebViewErrorOverlay(
    error: MemedWebViewErrorState,
    @StringRes closeLabelRes: Int,
    onRetry: () -> Unit,
    onClose: () -> Unit,
) {
    val bodyRes = when (error.code) {
        MemedWebViewErrorCode.EXCHANGE_UNAUTHORIZED,
        MemedWebViewErrorCode.LOGIN_REDIRECT_BLOCKED,
        MemedWebViewErrorCode.SESSION_EXPIRED_IN_PAGE -> R.string.memed_webview_error_session
        MemedWebViewErrorCode.EXCHANGE_FORBIDDEN,
        MemedWebViewErrorCode.CLINICAL_DENIED_IN_PAGE -> R.string.memed_webview_error_clinical
        MemedWebViewErrorCode.RENDER_PROCESS_GONE -> R.string.memed_webview_error_renderer
        MemedWebViewErrorCode.PROVIDER_OR_NETWORK_ERROR,
        MemedWebViewErrorCode.SSL_ERROR -> R.string.memed_webview_error_generic
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
            .padding(24.dp)
            .semantics { liveRegion = LiveRegionMode.Assertive },
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            color = Color(0xFFF8FAFC),
            shape = MaterialTheme.shapes.large,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = stringResource(R.string.memed_webview_error_title),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFF0F172A),
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = error.detailMessage?.takeIf { it.isNotBlank() }
                        ?: stringResource(bodyRes),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFF334155),
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(R.string.memed_webview_diagnostic_code, error.diagnosticCode),
                    style = MaterialTheme.typography.labelMedium,
                    fontFamily = FontFamily.Monospace,
                    color = Color(0xFF64748B),
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Button(
                    onClick = onRetry,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .minimumInteractiveComponentSize(),
                ) {
                    Text(stringResource(R.string.memed_webview_retry))
                }
                OutlinedButton(
                    onClick = onClose,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .minimumInteractiveComponentSize(),
                ) {
                    Text(stringResource(closeLabelRes))
                }
            }
        }
    }
}
