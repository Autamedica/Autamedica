package com.autamedica.android.data.remote

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth

/** Returns a Supabase session user only when an authenticated JWT is active. */
internal fun SupabaseClient.currentAuthenticatedUserIdOrNull(): String? {
    val session = auth.currentSessionOrNull() ?: return null
    if (session.accessToken.isBlank()) return null
    return session.user?.id?.takeIf { it.isNotBlank() }
}
