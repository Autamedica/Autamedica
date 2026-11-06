package com.autamedica.android.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Regression: Memed Custom Tab return must not reopen an appointment. */
class MemedBrowserReturnTest {
    @Test
    fun returnLinkDoesNotCreateNewCallRoute() {
        assertThat(NotificationRouteResolver.parseDeepLink("autamedica://return")).isNull()
        assertThat(NotificationRouteResolver.resolve(deepLink = "autamedica://return")).isNull()
    }
}
