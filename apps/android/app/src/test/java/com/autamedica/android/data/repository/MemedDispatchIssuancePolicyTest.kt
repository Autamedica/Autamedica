package com.autamedica.android.data.repository

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MemedDispatchIssuancePolicyTest {
    private val requestId = "12345678-abcd-4d91-8a1f-1234567890ab"

    private fun evidence(
        dispatchRequestId: String? = requestId,
        source: String? = "memed",
        providerPrescriptionId: String? = "memed-rx-90210",
        emissionStatus: String? = "provider_verified",
        providerVerifiedAt: String? = "2026-11-17T05:00:00Z",
        prescriptionStatus: String? = "draft",
    ) = MemedDispatchIssuanceEvidence(
        source = source,
        dispatchRequestId = dispatchRequestId,
        providerPrescriptionId = providerPrescriptionId,
        emissionStatus = emissionStatus,
        providerVerifiedAt = providerVerifiedAt,
        prescriptionStatus = prescriptionStatus,
    )

    @Test fun confirmsOnlyProviderVerifiedPrescriptionLinkedToExactJordanDispatch() {
        assertTrue(MemedDispatchIssuancePolicy.confirms(requestId, evidence()))
    }

    @Test fun rejectsPrescriptionFromAnotherDispatchOrMissingDispatchLink() {
        assertFalse(MemedDispatchIssuancePolicy.confirms(
            requestId,
            evidence(dispatchRequestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        ))
        assertFalse(MemedDispatchIssuancePolicy.confirms(requestId, evidence(dispatchRequestId = null)))
    }

    @Test fun rejectsUnverifiedOrUnidentifiedProviderEvents() {
        assertFalse(MemedDispatchIssuancePolicy.confirms(requestId, evidence(source = "local")))
        assertFalse(MemedDispatchIssuancePolicy.confirms(requestId, evidence(emissionStatus = "pending")))
        assertFalse(MemedDispatchIssuancePolicy.confirms(requestId, evidence(providerPrescriptionId = null)))
        assertFalse(MemedDispatchIssuancePolicy.confirms(requestId, evidence(providerVerifiedAt = null)))
    }

    @Test fun aCancelledPrescriptionIsNotReportedAsIssued() {
        assertFalse(MemedDispatchIssuancePolicy.confirms(
            requestId,
            evidence(prescriptionStatus = "cancelled"),
        ))
    }

    @Test fun rejectsMalformedDispatchIdentifiers() {
        assertFalse(MemedDispatchIssuancePolicy.confirms("not-a-uuid", evidence()))
    }
}
