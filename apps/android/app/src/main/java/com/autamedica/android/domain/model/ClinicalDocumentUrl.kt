package com.autamedica.android.domain.model

import java.net.URI
import java.net.URISyntaxException

/**
 * Checks a document URL's syntax and transport, not its signature or provider
 * authenticity. Only use after the server has supplied a signed document state.
 */
internal fun hasHttpsDocumentUrl(raw: String?): Boolean {
    if (raw.isNullOrBlank() || raw != raw.trim()) return false
    return try {
        val uri = URI(raw)
        uri.scheme.equals("https", ignoreCase = true) &&
            !uri.host.isNullOrBlank() && uri.userInfo == null
    } catch (_: URISyntaxException) {
        false
    }
}
