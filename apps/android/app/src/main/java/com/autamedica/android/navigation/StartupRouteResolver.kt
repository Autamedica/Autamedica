package com.autamedica.android.navigation

import com.autamedica.android.domain.model.User
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Never mount a private NavHost route before Supabase has restored an
 * authenticated user and AuthRepository has verified its profile role.
 * A timed-out/failed lookup fails closed to Login instead of spinning forever.
 */
internal suspend fun resolveStartupRoute(
    timeoutMillis: Long = 12_000L,
    getCurrentUser: suspend () -> User?,
): Route {
    return try {
        val user = withTimeoutOrNull(timeoutMillis) { getCurrentUser() }
        if (user != null) Route.Main else Route.Login
    } catch (_: Exception) {
        // AuthRepository can throw CancellationException when the session
        // switches mid-lookup. Only propagate actual lifecycle cancellation.
        currentCoroutineContext().ensureActive()
        Route.Login
    }
}
