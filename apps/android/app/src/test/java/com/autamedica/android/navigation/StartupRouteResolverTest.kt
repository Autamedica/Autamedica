package com.autamedica.android.navigation

import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class StartupRouteResolverTest {
    private val signedInUser = User(
        id = "signed-in-test-user",
        email = "qa@example.invalid",
        role = UserRole.PATIENT,
    )

    @Test
    fun noSessionStartsAtLogin() = runBlocking {
        assertEquals(Route.Login, resolveStartupRoute(getCurrentUser = { null }))
    }

    @Test
    fun verifiedSessionStartsAtMain() = runBlocking {
        assertEquals(Route.Main, resolveStartupRoute(getCurrentUser = { signedInUser }))
    }

    @Test
    fun profileLookupFailureFailsClosedToLogin() = runBlocking {
        assertEquals(Route.Login, resolveStartupRoute(getCurrentUser = {
            throw IllegalStateException("profile unavailable")
        }))
    }

    @Test
    fun sessionSwitchDuringProfileLookupDoesNotLeaveSplashStuck() = runBlocking {
        assertEquals(Route.Login, resolveStartupRoute(getCurrentUser = {
            throw CancellationException("Session changed during profile resolution")
        }))
    }

    @Test
    fun slowSessionLookupTimesOutToLogin() = runBlocking {
        assertEquals(Route.Login, resolveStartupRoute(
            getCurrentUser = { delay(300L); signedInUser },
            timeoutMillis = 20L,
        ))
    }
}
