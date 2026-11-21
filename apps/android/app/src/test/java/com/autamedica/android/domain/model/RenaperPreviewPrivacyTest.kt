package com.autamedica.android.domain.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RenaperPreviewPrivacyTest {
    @Test fun onlyThreeLettersPerPartAndNeverStreetNumber() {
        val masked = RenaperPreviewPrivacy.maskAddress("Calle Ficticia 123, Rosario, Santa Fe")
        assertThat(masked).isEqualTo("Cal** ******** ***, Ros****, San** **")
        assertThat(masked).doesNotContain("123")
        assertThat(masked).doesNotContain("Ficticia")
    }

    @Test fun paidUsersAreNotExemptFromMaskedAddress() {
        val masked = RenaperPreviewPrivacy.maskAddress("123 Avenida de Prueba, Cordoba")
        assertThat(masked).isEqualTo("*** Ave**** ** ******, Cor****")
    }

    @Test fun noAddressGivesNoAccidentalFallback() {
        assertThat(RenaperPreviewPrivacy.maskAddress(null)).isEmpty()
        assertThat(RenaperPreviewPrivacy.maskAddress("")).isEmpty()
    }
}
