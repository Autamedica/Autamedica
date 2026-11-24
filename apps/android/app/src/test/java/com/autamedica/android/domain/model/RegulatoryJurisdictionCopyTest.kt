package com.autamedica.android.domain.model

import com.google.common.truth.Truth.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.util.Locale

class RegulatoryJurisdictionCopyTest {

    private lateinit var originalLocale: Locale

    @Before
    fun setup() {
        originalLocale = Locale.getDefault()
    }

    @After
    fun tearDown() {
        Locale.setDefault(originalLocale)
    }

    @Test
    fun `AR doctor resolves AR jurisdiction even when device locale is pt-BR`() {
        Locale.setDefault(Locale("pt", "BR"))

        val jurisdiction = resolveRegulatoryJurisdiction(
            countryCode = "AR",
            licenseType = "MN",
            ufBrazil = null,
            doctorLicense = "MN-12345",
        )

        assertThat(jurisdiction).isEqualTo(RegulatoryJurisdiction.AR)
    }

    @Test
    fun `BR doctor resolves BR jurisdiction even when device locale is es-AR`() {
        Locale.setDefault(Locale("es", "AR"))

        val jurisdiction = resolveRegulatoryJurisdiction(
            countryCode = "BR",
            licenseType = "CRM",
            ufBrazil = "SP",
            doctorLicense = "CRM-SP 99881",
        )

        assertThat(jurisdiction).isEqualTo(RegulatoryJurisdiction.BR)
    }

    @Test
    fun `regulatory copy resources remain distinct across AR, BR, and GENERIC`() {
        assertThat(RegulatoryJurisdictionCopy.certificateWorkLeaveLabelRes(RegulatoryJurisdiction.AR))
            .isNotEqualTo(RegulatoryJurisdictionCopy.certificateWorkLeaveLabelRes(RegulatoryJurisdiction.BR))

        assertThat(RegulatoryJurisdictionCopy.signatureVerifyButtonRes(RegulatoryJurisdiction.AR))
            .isNotEqualTo(RegulatoryJurisdictionCopy.signatureVerifyButtonRes(RegulatoryJurisdiction.BR))
        assertThat(RegulatoryJurisdictionCopy.signatureVerifyButtonRes(RegulatoryJurisdiction.GENERIC))
            .isNotEqualTo(RegulatoryJurisdictionCopy.signatureVerifyButtonRes(RegulatoryJurisdiction.AR))
        assertThat(RegulatoryJurisdictionCopy.signatureVerifyButtonRes(RegulatoryJurisdiction.GENERIC))
            .isNotEqualTo(RegulatoryJurisdictionCopy.signatureVerifyButtonRes(RegulatoryJurisdiction.BR))

        assertThat(RegulatoryJurisdictionCopy.prescriptionCreateSubtitleRes(RegulatoryJurisdiction.AR))
            .isNotEqualTo(RegulatoryJurisdictionCopy.prescriptionCreateSubtitleRes(RegulatoryJurisdiction.BR))
        assertThat(RegulatoryJurisdictionCopy.certificateHideDiagnosisSubtitleRes(RegulatoryJurisdiction.AR))
            .isNotEqualTo(RegulatoryJurisdictionCopy.certificateHideDiagnosisSubtitleRes(RegulatoryJurisdiction.BR))
    }
}
