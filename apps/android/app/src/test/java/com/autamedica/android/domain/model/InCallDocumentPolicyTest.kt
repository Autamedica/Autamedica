package com.autamedica.android.domain.model

import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test
import java.time.LocalDate

class InCallDocumentPolicyTest {
    @Test fun argentinaRequiresMnOrMpAndNoConflictingCareCountry() {
        assertThat(InCallDocumentPolicy.doctorCountry("MN", "AR", null)).isEqualTo("AR")
        assertThat(InCallDocumentPolicy.doctorCountry("MP", null, null)).isEqualTo("AR")
        assertThat(InCallDocumentPolicy.doctorCountry("MN", "BR", null)).isNull()
        assertThat(InCallDocumentPolicy.doctorCountry("CRM", "AR", "RS")).isNull()
    }

    @Test fun brazilRequiresCrmAndState() {
        assertThat(InCallDocumentPolicy.doctorCountry("CRM", "BR", "RS")).isEqualTo("BR")
        assertThat(InCallDocumentPolicy.doctorCountry("CRM", "BR", null)).isNull()
        assertThat(InCallDocumentPolicy.doctorCountry(null, "BR", "RS")).isNull()
        assertThat(InCallDocumentPolicy.doctorCountry("MSP", "AR", null)).isNull()
    }

    @Test fun countryNeverDefaultsToArgentina() {
        assertThrows(IllegalArgumentException::class.java) {
            InCallDocumentPolicy.requireCountry(null)
        }
        assertThrows(IllegalArgumentException::class.java) {
            InCallDocumentPolicy.requireCountry("UY")
        }
        assertThat(InCallDocumentPolicy.requireCountry("BR")).isEqualTo("BR")
    }

    @Test fun restPeriodUsesInclusiveEndDate() {
        val start = LocalDate.of(2026, 11, 4)
        assertThat(InCallDocumentPolicy.inclusiveEndDate(start, 0)).isNull()
        assertThat(InCallDocumentPolicy.inclusiveEndDate(start, 1)).isEqualTo(start)
        assertThat(InCallDocumentPolicy.inclusiveEndDate(start, 2))
            .isEqualTo(LocalDate.of(2026, 11, 5))
        assertThat(InCallDocumentPolicy.inclusiveEndDate(start, 3))
            .isEqualTo(LocalDate.of(2026, 11, 6))
        assertThrows(IllegalArgumentException::class.java) {
            InCallDocumentPolicy.inclusiveEndDate(start, -1)
        }
        assertThrows(IllegalArgumentException::class.java) {
            InCallDocumentPolicy.inclusiveEndDate(start, 366)
        }
    }

    @Test fun patientAndDoctorMustHaveSameExplicitCountry() {
        InCallDocumentPolicy.requireMatchingPatientCountry("AR", "AR")
        InCallDocumentPolicy.requireMatchingPatientCountry("BR", "BR")
        assertThrows(IllegalArgumentException::class.java) {
            InCallDocumentPolicy.requireMatchingPatientCountry(null, "AR")
        }
        assertThrows(IllegalArgumentException::class.java) {
            InCallDocumentPolicy.requireMatchingPatientCountry("BR", "AR")
        }
    }

    @Test fun brazilMustNotFallBackToGenericPrescriptionIssuer() {
        assertThat(InCallDocumentPolicy.canUseNativePrescriptionIssuer("AR")).isTrue()
        assertThat(InCallDocumentPolicy.canUseNativePrescriptionIssuer("BR")).isFalse()
        assertThat(InCallDocumentPolicy.canUseNativePrescriptionIssuer("UY")).isFalse()
    }

    @Test fun unsignedCertificateHasNoPublicDocumentLink() {
        val draft = MedicalCertificate(
            id = "synthetic-certificate", cuir = "TEST-AR-DRAFT",
            status = "draft", certificateType = CertificateType.REPOSO_LABORAL,
            startDate = "2026-11-04", daysOfRest = 2,
            createdAt = "2026-11-04T12:00:00Z",
        )
        assertThat(draft.effectivePdfUrl).isNull()
        assertThat(draft.effectiveQrContent).isEmpty()
    }

    @Test fun draftPrescriptionCannotAdvertiseVerificationQr() {
        val draft = Prescription(
            id = "synthetic-rx", status = "draft", cuir = "TEST-AR-DRAFT",
            signedPdfUrl = null, qrCodeContent = null,
            medicationName = "FARMACO SOLO DEMO", dosage = "DEMOSTRACION",
            frequency = "N/A", instructions = "N/A",
            doctorName = null, doctorLicense = null,
            createdAt = "2026-11-04T12:00:00Z", countryCode = "AR",
        )
        assertThat(draft.effectiveQrContent).isEmpty()
        assertThat(draft.isActive).isFalse()
    }
}
