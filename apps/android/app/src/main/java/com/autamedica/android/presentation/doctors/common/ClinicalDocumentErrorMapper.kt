package com.autamedica.android.presentation.doctors.common

import androidx.annotation.StringRes
import com.autamedica.android.R
import com.autamedica.android.data.remote.EdgeFunctionException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

enum class ClinicalErrorAction {
    NONE,
    ACTIVATE_CERTIFICATE,
    REVIEW_PATIENT,
    RETRY,
}

data class MappedClinicalError(
    @StringRes val messageResId: Int,
    val action: ClinicalErrorAction = ClinicalErrorAction.NONE,
    val isKnownCategory: Boolean = true,
)

private val jsonParser = Json { ignoreUnknownKeys = true }

private fun extractErrorCodeAndMessage(error: Throwable?): Pair<String?, String?> {
    if (error == null) return null to null
    val edgeCode = (error as? EdgeFunctionException)?.errorCode
    val rawMessage = error.message?.trim()
    val parsedJson = rawMessage
        ?.takeIf { it.startsWith("{") }
        ?.let { runCatching { jsonParser.parseToJsonElement(it) as? JsonObject }.getOrNull() }
    val jsonCode = parsedJson?.get("code")?.jsonPrimitive?.contentOrNull
    val jsonMsg = parsedJson?.get("message")?.jsonPrimitive?.contentOrNull
        ?: parsedJson?.get("error")?.jsonPrimitive?.contentOrNull
    return (edgeCode ?: jsonCode) to (jsonMsg ?: rawMessage)
}

internal fun mapClinicalDocumentError(
    error: Throwable?,
    isOrder: Boolean,
): MappedClinicalError {
    val isNetworkException = error is UnknownHostException ||
        error is SocketTimeoutException ||
        error is ConnectException ||
        error?.cause is UnknownHostException ||
        error?.cause is SocketTimeoutException
    if (isNetworkException) {
        return MappedClinicalError(
            messageResId = R.string.clinical_err_network,
            action = ClinicalErrorAction.RETRY,
        )
    }

    val (code, message) = extractErrorCodeAndMessage(error)
    return mapClinicalDocumentRawError(
        rawMessage = message ?: error?.message,
        errorCode = code,
        isOrder = isOrder,
    )
}

internal fun mapClinicalDocumentRawError(
    rawMessage: String?,
    errorCode: String? = null,
    isOrder: Boolean,
): MappedClinicalError {
    val raw = rawMessage?.trim().orEmpty()
    val parsedJson = raw
        .takeIf { it.startsWith("{") }
        ?.let { runCatching { jsonParser.parseToJsonElement(it) as? JsonObject }.getOrNull() }
    val resolvedCode = (errorCode ?: parsedJson?.get("code")?.jsonPrimitive?.contentOrNull)
        ?.trim()
        ?.uppercase()
        .orEmpty()
    val resolvedMsg = (
        parsedJson?.get("message")?.jsonPrimitive?.contentOrNull
            ?: parsedJson?.get("error")?.jsonPrimitive?.contentOrNull
            ?: raw
        ).lowercase()

    if (
        resolvedCode == "MEMED_MOBILE_DISABLED" ||
        "memed_mobile_disabled" in resolvedMsg ||
        "emissor digital indisponível" in resolvedMsg ||
        "emisor digital no disponible" in resolvedMsg
    ) {
        return MappedClinicalError(
            messageResId = R.string.clinical_err_digital_issuer_unavailable,
            action = ClinicalErrorAction.RETRY,
        )
    }

    if (
        resolvedCode in setOf(
            "CFM_LICENSE_NOT_VERIFIED",
            "DIGITAL_SIGNATURE_REQUIRED",
            "CERTIFICATE_EXPIRED",
            "CERTIFICATE_INACTIVE",
            "DOCTOR_NOT_ELIGIBLE",
            "DOCTOR_REQUIRED",
            "PILOT_DOCTOR_REQUIRED",
        ) ||
        listOf(
            "digital_signature_required",
            "certificado",
            "certificate",
            "matrícula",
            "matricula",
            "crm/cfm",
            "habilitación",
            "habilitação",
            "firma digital",
            "assinatura digital",
        ).any { it in resolvedMsg }
    ) {
        return MappedClinicalError(
            messageResId = R.string.clinical_err_certificate_inactive,
            action = ClinicalErrorAction.ACTIVATE_CERTIFICATE,
        )
    }

    if (
        resolvedCode in setOf(
            "CARE_COUNTRY_MISMATCH",
            "PATIENT_COUNTRY_MISMATCH",
            "CARE_COUNTRY_REQUIRED",
            "PATIENT_IDENTITY_INCOMPLETE",
            "PATIENT_ACCOUNT_INACTIVE",
            "BRAZIL_PATIENT_CONSENT_REQUIRED",
            "DOCTOR_PATIENT_ACCESS_REQUIRED",
        ) ||
        listOf(
            "care_country",
            "país de atención",
            "país do paciente",
            "país clínico",
            "mismo país",
            "mesmo país",
            "lgpd",
            "cpf",
        ).any { it in resolvedMsg }
    ) {
        return MappedClinicalError(
            messageResId = R.string.clinical_err_patient_country_or_profile,
            action = ClinicalErrorAction.REVIEW_PATIENT,
        )
    }

    if (
        listOf(
            "timeout",
            "unable to resolve host",
            "failed to connect",
            "network",
            "conexión",
            "conexão",
            "econnrefused",
        ).any { it in resolvedMsg }
    ) {
        return MappedClinicalError(
            messageResId = R.string.clinical_err_network,
            action = ClinicalErrorAction.RETRY,
        )
    }

    if (
        resolvedCode == "VALIDATION_ERROR" ||
        listOf("validation", "obligatorio", "obrigatório").any { it in resolvedMsg }
    ) {
        return MappedClinicalError(
            messageResId = R.string.clinical_err_validation,
            action = ClinicalErrorAction.NONE,
        )
    }

    return MappedClinicalError(
        messageResId = if (isOrder) {
            R.string.clinical_err_order_issue_failed
        } else {
            R.string.clinical_err_rx_issue_failed
        },
        action = ClinicalErrorAction.RETRY,
        isKnownCategory = rawLooksLikeJson(raw),
    )
}

fun rawLooksLikeJson(text: String?): Boolean {
    val trimmed = text?.trim().orEmpty()
    if (trimmed.isEmpty()) return false
    return (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        trimmed.contains("\"code\":") ||
        trimmed.contains("\"error\":")
}

object PrescriptionErrorMapper {
    fun map(error: Throwable?): MappedClinicalError =
        mapClinicalDocumentError(error = error, isOrder = false)

    fun mapRaw(rawMessage: String?, errorCode: String? = null): MappedClinicalError =
        mapClinicalDocumentRawError(rawMessage = rawMessage, errorCode = errorCode, isOrder = false)
}

object OrderErrorMapper {
    fun map(error: Throwable?): MappedClinicalError =
        mapClinicalDocumentError(error = error, isOrder = true)

    fun mapRaw(rawMessage: String?, errorCode: String? = null): MappedClinicalError =
        mapClinicalDocumentRawError(rawMessage = rawMessage, errorCode = errorCode, isOrder = true)
}
