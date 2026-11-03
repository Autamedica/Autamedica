package com.autamedica.android.data.attribution

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PartnerAttributionTrackerTest {
    @Test fun readsJordanInstallReferrer() {
        assertThat(extractPartnerClickToken("utm_source=cantina_jordan&utm_medium=qr&utm_term=click_${"a".repeat(32)}"))
            .isEqualTo("a".repeat(32))
    }

    @Test fun rejectsAnyUntrustedOrMalformedToken() {
        assertThat(extractPartnerClickToken("utm_source=cantina_jordan&utm_term=click_bad")).isNull()
        assertThat(extractPartnerClickToken("utm_term=https%3A%2F%2Funknown.invalid")).isNull()
        assertThat(extractPartnerClickToken("utm_source=direct")).isNull()
    }

    @Test fun ignoresPlainUtmThatDoesNotCarryIssuedClickToken() {
        assertThat(extractPartnerClickToken("utm_content=jordan01&utm_campaign=partner_jordan")).isNull()
    }
}
