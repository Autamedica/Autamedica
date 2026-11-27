package com.autamedica.android.presentation.doctors.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.http.SslError
import android.os.Message
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.autamedica.android.BuildConfig
import com.autamedica.android.R

private val ICP_OAUTH_HOSTS = listOf(
    "vidaas.com.br",
    "birdid.com.br",
    "safeweb.com.br",
    "certisign.com.br",
    "soluti.com.br",
    "validcertificadora.com.br",
    "serasaexperian.com.br",
    "iti.gov.br",
    "gov.br",
)

private val ICP_APP_SCHEMES = setOf("vidaas", "birdid", "safeid", "serasaid")

private fun isExternalIcpOAuthHost(host: String): Boolean {
    val normalized = host.lowercase()
    return ICP_OAUTH_HOSTS.any { normalized == it || normalized.endsWith(".$it") }
}

private fun isMemedTrustedInWebViewHost(host: String): Boolean {
    val normalized = host.lowercase()
    return normalized == "doctor.autamedica.com" ||
        normalized == "autamedica.com" ||
        normalized == "www.autamedica.com" ||
        normalized == "partners.memed.com.br" ||
        normalized == "integrations.memed.com.br" ||
        normalized == "accounts.google.com" ||
        normalized.endsWith(".google.com") ||
        normalized.endsWith(".gstatic.com") ||
        normalized.endsWith(".googleapis.com") ||
        normalized == "memed.com.br" ||
        normalized.endsWith(".memed.com.br")
}

private fun launchExternalIcpOAuth(context: Context, uri: Uri) {
    if (uri.scheme.equals("https", ignoreCase = true)) {
        try {
            CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
                .launchUrl(context, uri)
            return
        } catch (_: ActivityNotFoundException) {
            // Fall through to generic external browser/app handler.
        } catch (_: SecurityException) {
            // Fall through to generic external browser/app handler.
        }
    }
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

/**
 * Full-screen official Brazilian digital prescriber WebView with ICP-Brasil
 * cloud signature (VIDaaS / BirdID / SafeID / Certisign / Soluti) handoff.
 */
@Composable
fun MemedPrescriberWebView(
    url: String,
    sessionTokens: Pair<String, String>?,
    @StringRes titleRes: Int = R.string.video_memed_title,
    @StringRes closeLabelRes: Int = R.string.clinical_ops_back,
    onClose: () -> Unit,
) {
    val webViewRef = remember { mutableStateOf<WebView?>(null) }

    BackHandler(enabled = true) {
        val webView = webViewRef.value
        if (webView?.canGoBack() == true) webView.goBack() else onClose()
    }

    DisposableEffect(Unit) {
        onDispose {
            runCatching {
                val cookies = CookieManager.getInstance()
                cookies.removeSessionCookies(null)
                cookies.flush()
            }
            webViewRef.value?.let { webView ->
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
            .statusBarsPadding(),
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
            TextButton(onClick = onClose) {
                Text(stringResource(closeLabelRes))
            }
        }
        AndroidView(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
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
                    CookieManager.getInstance().setAcceptCookie(true)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
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
                                    val target = request.url
                                    val scheme = target.scheme?.lowercase().orEmpty()
                                    if (scheme == "autamedica" && target.host == "return") {
                                        onClose()
                                    } else if (scheme in ICP_APP_SCHEMES) {
                                        launchExternalIcpOAuth(viewContext, target)
                                    } else if (scheme == "https") {
                                        val host = target.host?.lowercase().orEmpty()
                                        if (isExternalIcpOAuthHost(host)) {
                                            launchExternalIcpOAuth(viewContext, target)
                                        } else if (isMemedTrustedInWebViewHost(host)) {
                                            hostWebView.loadUrl(target.toString())
                                        }
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
                            val target = request.url
                            val scheme = target.scheme?.lowercase().orEmpty()
                            if (scheme == "autamedica" && target.host == "return") {
                                onClose()
                                return true
                            }
                            if (scheme in ICP_APP_SCHEMES) {
                                launchExternalIcpOAuth(viewContext, target)
                                return true
                            }
                            if (scheme != "https") return true
                            val host = target.host?.lowercase() ?: return true
                            if (isExternalIcpOAuthHost(host)) {
                                launchExternalIcpOAuth(viewContext, target)
                                return true
                            }
                            return !isMemedTrustedInWebViewHost(host)
                        }

                        override fun onReceivedSslError(
                            view: WebView,
                            handler: SslErrorHandler,
                            error: SslError,
                        ) {
                            handler.cancel()
                        }
                    }
                    val tokens = sessionTokens
                    if (tokens == null) {
                        onClose()
                    } else {
                        val projectRef = BuildConfig.SUPABASE_URL.substringAfter("https://").substringBefore('.')
                        val sessionJson = """{"access_token":"${tokens.first}","refresh_token":"${tokens.second}","token_type":"bearer"}"""
                        val encodedSession = "base64-" + Base64.encodeToString(
                            sessionJson.toByteArray(Charsets.UTF_8),
                            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
                        )
                        val sessionCookie = "sb-$projectRef-auth-token=$encodedSession; Domain=.autamedica.com; Path=/; Secure; SameSite=Lax"
                        CookieManager.getInstance().setCookie("https://doctor.autamedica.com", sessionCookie) {
                            CookieManager.getInstance().flush()
                            post { loadUrl(url) }
                        }
                    }
                }
            },
            update = {},
        )
    }
}
