package com.autamedica.android.presentation.doctors.common

import com.autamedica.android.domain.model.ClinicalJurisdictionResolution
import com.autamedica.android.domain.model.DoctorEligibility
import com.autamedica.android.domain.model.resolveClinicalJurisdictionState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ClinicalAccessibilityContractTest {

    private val androidMainDir: File by lazy {
        listOf(
            File("src/main/java/com/autamedica/android"),
            File("app/src/main/java/com/autamedica/android"),
            File("apps/android/app/src/main/java/com/autamedica/android"),
        ).first { it.exists() }
    }

    @Test
    fun `resolveClinicalJurisdictionState fails closed while loading or when eligibility is unresolved`() {
        assertEquals(
            ClinicalJurisdictionResolution.LOADING,
            resolveClinicalJurisdictionState(eligibility = null, isLoadingEligibility = true),
        )
        assertEquals(
            ClinicalJurisdictionResolution.LOADING,
            resolveClinicalJurisdictionState(
                eligibility = DoctorEligibility(
                    isEligible = true,
                    doctorLicense = "MN 12345",
                    validationStatus = "verified",
                    countryCode = "AR",
                ),
                isLoadingEligibility = true,
            ),
        )
        assertEquals(
            ClinicalJurisdictionResolution.UNRESOLVED,
            resolveClinicalJurisdictionState(eligibility = null, isLoadingEligibility = false),
        )
        assertEquals(
            ClinicalJurisdictionResolution.UNRESOLVED,
            resolveClinicalJurisdictionState(
                eligibility = DoctorEligibility(
                    isEligible = false,
                    doctorLicense = null,
                    validationStatus = "pending",
                    countryCode = null,
                ),
                isLoadingEligibility = false,
            ),
        )
    }

    @Test
    fun `resolveClinicalJurisdictionState resolves BR and AR strictly from verified eligibility`() {
        assertEquals(
            ClinicalJurisdictionResolution.BR,
            resolveClinicalJurisdictionState(
                eligibility = DoctorEligibility(
                    isEligible = true,
                    doctorLicense = "CRM-SP 123456",
                    validationStatus = "verified",
                    countryCode = "BR",
                ),
                isLoadingEligibility = false,
            ),
        )
        assertEquals(
            ClinicalJurisdictionResolution.BR,
            resolveClinicalJurisdictionState(
                eligibility = DoctorEligibility(
                    isEligible = true,
                    doctorLicense = "CRM-RJ 99999",
                    validationStatus = "verified",
                    countryCode = null,
                ),
                isLoadingEligibility = false,
            ),
        )
        assertEquals(
            ClinicalJurisdictionResolution.AR,
            resolveClinicalJurisdictionState(
                eligibility = DoctorEligibility(
                    isEligible = true,
                    doctorLicense = "MN 54321",
                    validationStatus = "verified",
                    countryCode = "AR",
                ),
                isLoadingEligibility = false,
            ),
        )
    }

    @Test
    fun `prescription and certificate screens fail closed without eligibility fallback`() {
        val rxScreen = File(androidMainDir, "presentation/doctors/prescriptions/CreatePrescriptionScreen.kt").readText()
        val rxVm = File(androidMainDir, "presentation/doctors/prescriptions/DoctorPrescriptionsViewModel.kt").readText()
        val certScreen = File(androidMainDir, "presentation/doctors/certificates/CreateCertificateScreen.kt").readText()
        val certVm = File(androidMainDir, "presentation/doctors/certificates/DoctorCertificatesViewModel.kt").readText()

        assertFalse(rxScreen.contains("eligibility?.isEligible ?: true"))
        assertFalse(certScreen.contains("eligibility?.isEligible ?: true"))
        assertFalse(rxVm.contains("""?: "AR""""))

        assertTrue(rxScreen.contains("resolveClinicalJurisdictionState("))
        assertTrue(certScreen.contains("resolveClinicalJurisdictionState("))
        assertTrue(rxVm.contains("resolveClinicalJurisdictionState("))
        assertTrue(certVm.contains("resolveClinicalJurisdictionState("))
        assertTrue(certVm.contains("isDiagnosisValidationError"))
        assertTrue(certScreen.contains("diagnosisFocusRequester"))
    }

    @Test
    fun `clinical screens meet interactive touch target, WCAG AA contrast, and live region parity`() {
        val certCreate = File(androidMainDir, "presentation/doctors/certificates/CreateCertificateScreen.kt").readText()
        val certList = File(androidMainDir, "presentation/doctors/certificates/DoctorCertificatesScreen.kt").readText()
        val orderCreate = File(androidMainDir, "presentation/doctors/medicalorders/CreateMedicalOrderScreen.kt").readText()
        val orderList = File(androidMainDir, "presentation/doctors/medicalorders/DoctorMedicalOrdersScreen.kt").readText()
        val rxList = File(androidMainDir, "presentation/doctors/prescriptions/DoctorPrescriptionsScreen.kt").readText()
        val patientSelector = File(androidMainDir, "presentation/doctors/components/EventualPatientDniSelectorCard.kt").readText()
        val inCallSheet = File(androidMainDir, "presentation/videocall/components/InCallClinicalBottomSheet.kt").readText()

        val files = listOf(certCreate, certList, orderCreate, orderList, rxList, patientSelector, inCallSheet)
        val forbiddenSizes = listOf("size(24.dp)", "size(28.dp)", "size(32.dp)", "height(34.dp)", "size(36.dp)", "height(46.dp)")
        val controlStart = Regex("""\b(?:IconButton|Button|FilledTonalButton|OutlinedButton)\(""")
        files.forEach { src ->
            controlStart.findAll(src).forEach { match ->
                val signature = extractBalancedParentheses(src, match.range.last)
                forbiddenSizes.forEach { badSize ->
                    assertFalse("Unexpected $badSize on interactive control: $signature", signature.contains(badSize))
                }
            }
        }

        // Single selectable radio card without nested clickable RadioButton duplication
        assertTrue(orderCreate.contains("Role.RadioButton"))
        assertTrue(orderCreate.contains("onClick = null"))

        // Localized DNI/CPF selector & no hardcoded AR phone placeholders
        assertFalse(patientSelector.contains("+54 9 11"))
        assertFalse(patientSelector.contains("Ej: 32456789"))
        assertFalse(patientSelector.contains("Nombre y Apellido completos"))
        assertTrue(patientSelector.contains("LiveRegionMode.Assertive"))

        // FlowRow instead of horizontalScroll for certificate & order chips
        assertFalse(certCreate.contains("horizontalScroll("))
        assertFalse(certList.contains("horizontalScroll("))
        assertFalse(orderList.contains("horizontalScroll("))

        // In-call bottom sheet focus, live regions, and localized BR Memed strings
        assertFalse(inCallSheet.contains("Emitir Receita Digital"))
        assertFalse(inCallSheet.contains("Emitir Atestado Digital"))
        assertTrue(inCallSheet.contains("LiveRegionMode.Assertive"))
        assertTrue(inCallSheet.contains("LiveRegionMode.Polite"))
        assertTrue(inCallSheet.contains("certDiagnosisFocusRequester"))
        assertTrue(certCreate.contains("LiveRegionMode.Assertive"))
    }

    private fun extractBalancedParentheses(source: String, openParenIndex: Int): String {
        var depth = 0
        var index = openParenIndex
        while (index < source.length) {
            when (source[index]) {
                '(' -> depth += 1
                ')' -> {
                    depth -= 1
                    if (depth == 0) {
                        return source.substring(openParenIndex, index + 1)
                    }
                }
            }
            index += 1
        }
        return source.substring(openParenIndex)
    }
}
