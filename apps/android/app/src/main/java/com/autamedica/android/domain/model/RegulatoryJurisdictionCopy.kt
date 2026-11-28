package com.autamedica.android.domain.model

import androidx.annotation.StringRes
import com.autamedica.android.R

enum class RegulatoryJurisdiction {
    AR,
    BR,
    GENERIC,
}

enum class ClinicalJurisdictionResolution {
    LOADING,
    UNRESOLVED,
    BR,
    AR,
}

fun resolveClinicalJurisdictionState(
    eligibility: DoctorEligibility?,
    isLoadingEligibility: Boolean,
): ClinicalJurisdictionResolution {
    if (isLoadingEligibility) return ClinicalJurisdictionResolution.LOADING
    if (eligibility == null) return ClinicalJurisdictionResolution.UNRESOLVED
    return when (
        resolveRegulatoryJurisdiction(
            countryCode = eligibility.countryCode,
            doctorLicense = eligibility.doctorLicense,
        )
    ) {
        RegulatoryJurisdiction.BR -> ClinicalJurisdictionResolution.BR
        RegulatoryJurisdiction.AR -> ClinicalJurisdictionResolution.AR
        RegulatoryJurisdiction.GENERIC -> ClinicalJurisdictionResolution.UNRESOLVED
    }
}

/**
 * Resolves regulatory copy strictly from the doctor's or clinical document's
 * persisted jurisdiction (`care_country`, `license_type`, `uf_brazil`, or license prefix).
 * Never derives legal/regulatory references from the Android device locale.
 */
fun resolveRegulatoryJurisdiction(
    countryCode: String? = null,
    licenseType: String? = null,
    ufBrazil: String? = null,
    doctorLicense: String? = null,
): RegulatoryJurisdiction {
    val cleanCountry = countryCode?.trim()?.uppercase()?.takeIf { it.isNotEmpty() }
    val cleanLicenseType = licenseType?.trim()?.uppercase()?.takeIf { it.isNotEmpty() }
    val cleanLicense = doctorLicense?.trim()?.uppercase()?.takeIf { it.isNotEmpty() }

    val fromPolicy = if (cleanLicenseType != null) {
        when (cleanLicenseType) {
            "CRM" -> if (cleanCountry == null || cleanCountry == "BR") "BR" else null
            "MN", "MP" -> if (cleanCountry == null || cleanCountry == "AR") "AR" else null
            else -> InCallDocumentPolicy.doctorCountry(cleanLicenseType, cleanCountry, ufBrazil)
        }
    } else {
        cleanCountry
    }

    return when (fromPolicy) {
        "AR" -> RegulatoryJurisdiction.AR
        "BR" -> RegulatoryJurisdiction.BR
        else -> when {
            cleanLicense?.startsWith("CRM") == true -> RegulatoryJurisdiction.BR
            cleanLicense?.startsWith("MN") == true || cleanLicense?.startsWith("MP") == true ->
                RegulatoryJurisdiction.AR
            else -> RegulatoryJurisdiction.GENERIC
        }
    }
}

object RegulatoryJurisdictionCopy {

    @StringRes
    fun signatureVerifyButtonRes(jurisdiction: RegulatoryJurisdiction): Int = when (jurisdiction) {
        RegulatoryJurisdiction.AR -> R.string.reg_signature_button_verify_ar
        RegulatoryJurisdiction.BR -> R.string.reg_signature_button_verify_br
        RegulatoryJurisdiction.GENERIC -> R.string.reg_signature_button_verify_generic
    }

    @StringRes
    fun signatureVerifiedStatusRes(jurisdiction: RegulatoryJurisdiction): Int = when (jurisdiction) {
        RegulatoryJurisdiction.AR -> R.string.reg_signature_verified_ar
        RegulatoryJurisdiction.BR -> R.string.reg_signature_verified_br
        RegulatoryJurisdiction.GENERIC -> R.string.reg_signature_verified_generic
    }

    @StringRes
    fun signatureMustValidateErrorRes(jurisdiction: RegulatoryJurisdiction): Int = when (jurisdiction) {
        RegulatoryJurisdiction.AR -> R.string.reg_signature_must_validate_ar
        RegulatoryJurisdiction.BR -> R.string.reg_signature_must_validate_br
        RegulatoryJurisdiction.GENERIC -> R.string.reg_signature_must_validate_generic
    }

    @StringRes
    fun certificateWorkLeaveLabelRes(jurisdiction: RegulatoryJurisdiction): Int = when (jurisdiction) {
        RegulatoryJurisdiction.AR -> R.string.reg_cert_work_leave_ar
        RegulatoryJurisdiction.BR -> R.string.reg_cert_work_leave_br
        RegulatoryJurisdiction.GENERIC -> R.string.reg_cert_work_leave_generic
    }

    @StringRes
    fun certificateDiagnosisReservedRes(jurisdiction: RegulatoryJurisdiction): Int = when (jurisdiction) {
        RegulatoryJurisdiction.AR -> R.string.reg_cert_diagnosis_reserved_ar
        RegulatoryJurisdiction.BR -> R.string.reg_cert_diagnosis_reserved_br
        RegulatoryJurisdiction.GENERIC -> R.string.reg_cert_diagnosis_reserved_generic
    }

    @StringRes
    fun certificateHideDiagnosisSubtitleRes(jurisdiction: RegulatoryJurisdiction): Int = when (jurisdiction) {
        RegulatoryJurisdiction.AR -> R.string.reg_cert_hide_diagnosis_subtitle_ar
        RegulatoryJurisdiction.BR -> R.string.reg_cert_hide_diagnosis_subtitle_br
        RegulatoryJurisdiction.GENERIC -> R.string.reg_cert_hide_diagnosis_subtitle_generic
    }

    @StringRes
    fun certificateLicenseRequiredRes(jurisdiction: RegulatoryJurisdiction): Int = when (jurisdiction) {
        RegulatoryJurisdiction.AR -> R.string.reg_cert_license_required_ar
        RegulatoryJurisdiction.BR -> R.string.reg_cert_license_required_br
        RegulatoryJurisdiction.GENERIC -> R.string.reg_cert_license_required_generic
    }

    @StringRes
    fun prescriptionCreateSubtitleRes(jurisdiction: RegulatoryJurisdiction): Int = when (jurisdiction) {
        RegulatoryJurisdiction.AR -> R.string.reg_rx_create_subtitle_ar
        RegulatoryJurisdiction.BR -> R.string.reg_rx_create_subtitle_br
        RegulatoryJurisdiction.GENERIC -> R.string.reg_rx_create_subtitle_generic
    }

    @StringRes
    fun prescriptionEligibleTitleRes(jurisdiction: RegulatoryJurisdiction): Int = when (jurisdiction) {
        RegulatoryJurisdiction.AR -> R.string.reg_rx_eligible_title_ar
        RegulatoryJurisdiction.BR -> R.string.reg_rx_eligible_title_br
        RegulatoryJurisdiction.GENERIC -> R.string.reg_rx_eligible_title_generic
    }

    @StringRes
    fun prescriptionFallbackReasonRes(jurisdiction: RegulatoryJurisdiction): Int = when (jurisdiction) {
        RegulatoryJurisdiction.AR -> R.string.reg_rx_fallback_reason_ar
        RegulatoryJurisdiction.BR -> R.string.reg_rx_fallback_reason_br
        RegulatoryJurisdiction.GENERIC -> R.string.reg_rx_fallback_reason_generic
    }

    @StringRes
    fun prescriptionOfficialValidationRes(jurisdiction: RegulatoryJurisdiction): Int = when (jurisdiction) {
        RegulatoryJurisdiction.AR -> R.string.reg_rx_official_validation_ar
        RegulatoryJurisdiction.BR -> R.string.reg_rx_official_validation_br
        RegulatoryJurisdiction.GENERIC -> R.string.reg_rx_official_validation_generic
    }

    @StringRes
    fun certificateLicenseVerifiedRes(jurisdiction: RegulatoryJurisdiction): Int = when (jurisdiction) {
        RegulatoryJurisdiction.AR -> R.string.reg_cert_license_verified_ar
        RegulatoryJurisdiction.BR -> R.string.reg_cert_license_verified_br
        RegulatoryJurisdiction.GENERIC -> R.string.reg_cert_license_verified_generic
    }
}
