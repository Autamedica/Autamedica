package com.autamedica.android.presentation.doctors.components

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI

enum class MemedWebViewNavigationAction {
    ALLOW_IN_WEBVIEW,
    RETURN_TO_APP,
    INTERCEPT_LOGIN_REDIRECT,
    BLOCK_EXTERNAL,
}

enum class MemedWebViewErrorCode {
    EXCHANGE_UNAUTHORIZED,
    EXCHANGE_FORBIDDEN,
    LOGIN_REDIRECT_BLOCKED,
    SESSION_EXPIRED_IN_PAGE,
    CLINICAL_DENIED_IN_PAGE,
    PROVIDER_OR_NETWORK_ERROR,
    SSL_ERROR,
}

data class MemedWebViewErrorState(
    val code: MemedWebViewErrorCode,
    val diagnosticCode: String,
    val httpStatus: Int? = null,
    val detailMessage: String? = null,
    val canAutoRetry: Boolean,
)

data class MemedBridgeJsEvent(
    val type: String,
    val code: String? = null,
    val status: Int? = null,
    val message: String? = null,
)

/**
 * Pure navigation, error classification, and JS-bridge parsing policy for the
 * unified embedded Memed WebView. All Memed & ICP-Brasil HTTPS flows remain
 * strictly inside the AutaMedica WebView — external browsers and Custom Tabs
 * are never launched.
 */
object MemedWebViewNavigationPolicy {
    private val bridgeJson = Json { ignoreUnknownKeys = true }

    private val AUTAMEDICA_HOSTS = setOf(
        "doctor.autamedica.com",
        "autamedica.com",
        "www.autamedica.com",
    )

    private val ICP_HTTPS_HOSTS = listOf(
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

    private val LOGIN_PATH_PREFIXES = listOf(
        "/auth/login",
        "/login",
        "/signin",
        "/ingresar",
    )

    fun isTrustedInWebViewHost(host: String): Boolean {
        val normalized = host.lowercase()
        if (normalized in AUTAMEDICA_HOSTS) return true
        if (normalized == "memed.com.br" || normalized.endsWith(".memed.com.br")) return true
        if (
            normalized == "accounts.google.com" ||
            normalized.endsWith(".google.com") ||
            normalized.endsWith(".gstatic.com") ||
            normalized.endsWith(".googleapis.com")
        ) {
            return true
        }
        return ICP_HTTPS_HOSTS.any { normalized == it || normalized.endsWith(".$it") }
    }

    fun isLoginRedirectUri(uri: URI): Boolean {
        val host = uri.host?.lowercase() ?: return false
        val isAutamedica = host in AUTAMEDICA_HOSTS || host.endsWith(".autamedica.com")
        if (!isAutamedica) return false
        val path = (uri.path ?: "").lowercase()
        return LOGIN_PATH_PREFIXES.any { prefix ->
            path == prefix || path.startsWith("$prefix/")
        }
    }

    fun classifyNavigation(rawUrl: String): MemedWebViewNavigationAction {
        val uri = runCatching { URI(rawUrl) }.getOrNull()
            ?: return MemedWebViewNavigationAction.BLOCK_EXTERNAL
        val scheme = uri.scheme?.lowercase().orEmpty()
        val host = uri.host?.lowercase().orEmpty()

        if (scheme == "autamedica" && host == "return") {
            return MemedWebViewNavigationAction.RETURN_TO_APP
        }
        if (scheme != "https" || host.isBlank()) {
            return MemedWebViewNavigationAction.BLOCK_EXTERNAL
        }
        if (isLoginRedirectUri(uri)) {
            return MemedWebViewNavigationAction.INTERCEPT_LOGIN_REDIRECT
        }
        return if (isTrustedInWebViewHost(host)) {
            MemedWebViewNavigationAction.ALLOW_IN_WEBVIEW
        } else {
            MemedWebViewNavigationAction.BLOCK_EXTERNAL
        }
    }

    fun classifyHttpError(
        requestUrl: String,
        statusCode: Int,
        isForMainFrame: Boolean,
    ): MemedWebViewErrorState? {
        if (statusCode < 400) return null
        val uri = runCatching { URI(requestUrl) }.getOrNull()
        val path = uri?.path.orEmpty()
        val isExchangeRequest = path == "/api/doctors/memed-mobile/session-exchange"
        val isContextOrPortalRequest =
            path == "/doctors/prescriptions/memed-mobile" ||
                path == "/api/doctors/prescriptions/memed-mobile-context"
        if (!isForMainFrame && !isExchangeRequest && !isContextOrPortalRequest) {
            return null
        }

        return when (statusCode) {
            401 -> MemedWebViewErrorState(
                code = MemedWebViewErrorCode.EXCHANGE_UNAUTHORIZED,
                diagnosticCode = if (isExchangeRequest) "EXCHANGE_HTTP_401" else "PORTAL_HTTP_401",
                httpStatus = statusCode,
                canAutoRetry = true,
            )
            403 -> MemedWebViewErrorState(
                code = MemedWebViewErrorCode.EXCHANGE_FORBIDDEN,
                diagnosticCode = if (isExchangeRequest) "EXCHANGE_HTTP_403" else "PORTAL_HTTP_403",
                httpStatus = statusCode,
                canAutoRetry = false,
            )
            else -> MemedWebViewErrorState(
                code = MemedWebViewErrorCode.PROVIDER_OR_NETWORK_ERROR,
                diagnosticCode = "WEB_HTTP_$statusCode",
                httpStatus = statusCode,
                canAutoRetry = false,
            )
        }
    }

    fun parseBridgeEvent(rawJson: String): MemedBridgeJsEvent? {
        if (rawJson.length > 4096) return null
        val obj = runCatching { bridgeJson.parseToJsonElement(rawJson) as? JsonObject }.getOrNull()
            ?: return null
        val type = obj["type"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
            ?: return null
        return MemedBridgeJsEvent(
            type = type,
            code = obj["code"]?.jsonPrimitive?.contentOrNull,
            status = obj["status"]?.jsonPrimitive?.intOrNull,
            message = obj["message"]?.jsonPrimitive?.contentOrNull,
        )
    }

    fun errorFromBridgeEvent(event: MemedBridgeJsEvent): MemedWebViewErrorState? =
        when (event.type) {
            "session_expired" -> MemedWebViewErrorState(
                code = MemedWebViewErrorCode.SESSION_EXPIRED_IN_PAGE,
                diagnosticCode = event.code ?: "SESSION_EXPIRED_IN_PAGE",
                httpStatus = event.status,
                detailMessage = event.message,
                canAutoRetry = true,
            )
            "clinical_denied" -> MemedWebViewErrorState(
                code = MemedWebViewErrorCode.CLINICAL_DENIED_IN_PAGE,
                diagnosticCode = event.code ?: "CLINICAL_DENIED_IN_PAGE",
                httpStatus = event.status,
                detailMessage = event.message,
                canAutoRetry = false,
            )
            "provider_error" -> MemedWebViewErrorState(
                code = MemedWebViewErrorCode.PROVIDER_OR_NETWORK_ERROR,
                diagnosticCode = event.code ?: "PROVIDER_ERROR_IN_PAGE",
                httpStatus = event.status,
                detailMessage = event.message,
                canAutoRetry = false,
            )
            else -> null
        }
}

/**
 * Guarantees at most one automatic session refresh + handoff retry per user attempt,
 * preventing infinite reload loops if a server policy or account gate blocks access.
 */
class MemedHandoffRetryController(private val maxAutoRetries: Int = 1) {
    private var autoRetriesUsed = 0

    fun tryConsumeAutoRetry(error: MemedWebViewErrorState): Boolean {
        if (!error.canAutoRetry) return false
        if (autoRetriesUsed >= maxAutoRetries) return false
        autoRetriesUsed += 1
        return true
    }

    fun resetForManualRetry() {
        autoRetriesUsed = 0
    }
}
