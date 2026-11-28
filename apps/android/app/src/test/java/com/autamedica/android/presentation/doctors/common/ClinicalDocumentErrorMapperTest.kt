package com.autamedica.android.presentation.doctors.common

import com.autamedica.android.R
import com.autamedica.android.data.remote.EdgeFunctionException
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.net.SocketTimeoutException

class ClinicalDocumentErrorMapperTest {

    @Test
    fun `prescription mapper translates MEMED_MOBILE_DISABLED json without leaking raw json`() {
        val raw = """{"code":"MEMED_MOBILE_DISABLED","message":"Memed mobile disabled"}"""
        val mapped = PrescriptionErrorMapper.map(IllegalStateException(raw))

        assertThat(mapped.messageResId).isEqualTo(R.string.clinical_err_digital_issuer_unavailable)
        assertThat(mapped.action).isEqualTo(ClinicalErrorAction.RETRY)
        assertThat(mapped.isKnownCategory).isTrue()
        assertThat(rawLooksLikeJson(raw)).isTrue()
    }

    @Test
    fun `prescription mapper translates EdgeFunctionException certificate inactive to activate action`() {
        val err = EdgeFunctionException(
            statusCode = 403,
            errorCode = "CFM_LICENSE_NOT_VERIFIED",
            message = "Matrícula CFM inactiva o vencida",
        )
        val mapped = PrescriptionErrorMapper.map(err)

        assertThat(mapped.messageResId).isEqualTo(R.string.clinical_err_certificate_inactive)
        assertThat(mapped.action).isEqualTo(ClinicalErrorAction.ACTIVATE_CERTIFICATE)
        assertThat(mapped.isKnownCategory).isTrue()
    }

    @Test
    fun `order mapper translates care_country mismatch to review patient action`() {
        val err = EdgeFunctionException(
            statusCode = 422,
            errorCode = "CARE_COUNTRY_MISMATCH",
            message = "El país clínico del paciente no coincide",
        )
        val mapped = OrderErrorMapper.map(err)

        assertThat(mapped.messageResId).isEqualTo(R.string.clinical_err_patient_country_or_profile)
        assertThat(mapped.action).isEqualTo(ClinicalErrorAction.REVIEW_PATIENT)
        assertThat(mapped.isKnownCategory).isTrue()
    }

    @Test
    fun `order mapper translates network timeouts cleanly`() {
        val mapped = OrderErrorMapper.map(SocketTimeoutException("timeout"))

        assertThat(mapped.messageResId).isEqualTo(R.string.clinical_err_network)
        assertThat(mapped.action).isEqualTo(ClinicalErrorAction.RETRY)
        assertThat(mapped.isKnownCategory).isTrue()
    }

    @Test
    fun `order mapper catches unknown raw json without exposing braces`() {
        val mapped = OrderErrorMapper.map(IllegalStateException("""{"code":"INTERNAL_500","error":"boom"}"""))

        assertThat(mapped.messageResId).isEqualTo(R.string.clinical_err_order_issue_failed)
        assertThat(mapped.action).isEqualTo(ClinicalErrorAction.RETRY)
        assertThat(mapped.isKnownCategory).isTrue()
    }

    @Test
    fun `order mapper preserves clean non-json domain message as custom detail`() {
        val mapped = OrderErrorMapper.map(IllegalStateException("El profesional no tiene vínculo clínico activo con este paciente."))

        assertThat(mapped.isKnownCategory).isFalse()
        assertThat(mapped.action).isEqualTo(ClinicalErrorAction.RETRY)
    }
}

@RunWith(RobolectricTestRunner::class)
class ClinicalDocumentErrorResourcesTest {

    @Test
    @Config(sdk = [35], qualifiers = "pt-rBR")
    fun `pt-BR resources provide white-label localized error copy and Portuguese imaging suggestions`() {
        val ctx = RuntimeEnvironment.getApplication()
        val issuerUnavailable = ctx.getString(R.string.clinical_err_digital_issuer_unavailable)
        val certInactive = ctx.getString(R.string.clinical_err_certificate_inactive)
        val countryMismatch = ctx.getString(R.string.clinical_err_patient_country_or_profile)
        val orderFailed = ctx.getString(R.string.clinical_err_order_issue_failed)
        val imaging = ctx.resources.getStringArray(R.array.order_suggestions_imaging).toList()

        assertThat(issuerUnavailable).doesNotContain("{")
        assertThat(issuerUnavailable.lowercase()).doesNotContain("memed")
        assertThat(certInactive).contains("certificado")
        assertThat(countryMismatch).contains("país")
        assertThat(orderFailed).contains("pedido médico")
        assertThat(imaging).contains("Ultrassonografia abdominal total")
        assertThat(imaging).contains("Radiografia de tórax (PA e Perfil)")
    }

    @Test
    @Config(sdk = [35], qualifiers = "es")
    fun `es resources provide white-label localized error copy`() {
        val ctx = RuntimeEnvironment.getApplication()
        val issuerUnavailable = ctx.getString(R.string.clinical_err_digital_issuer_unavailable)
        val certInactive = ctx.getString(R.string.clinical_err_certificate_inactive)
        val countryMismatch = ctx.getString(R.string.clinical_err_patient_country_or_profile)
        val orderFailed = ctx.getString(R.string.clinical_err_order_issue_failed)

        assertThat(issuerUnavailable).doesNotContain("{")
        assertThat(issuerUnavailable.lowercase()).doesNotContain("memed")
        assertThat(certInactive).contains("certificado")
        assertThat(countryMismatch).contains("país")
        assertThat(orderFailed).contains("orden médica")
    }
}
