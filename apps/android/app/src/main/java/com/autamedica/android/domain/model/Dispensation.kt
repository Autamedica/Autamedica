package com.autamedica.android.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Seguimiento de dispensación de una receta vista desde el paciente.
 *
 * Espeja el DTO que expone el BFF web en
 * `apps/web/src/pages/api/patients/prescriptions/[id]/dispensation.ts`.
 * El paciente no tiene visibilidad sobre `dispensation_validations`.
 */
@Serializable
data class PrescriptionDispensation(
    @SerialName("prescription_status") val prescriptionStatus: String,
    val dispensation: DispensationOrder? = null,
    val events: List<DispensationEvent> = emptyList(),
)

@Serializable
data class DispensationOrder(
    val id: String,
    val status: String,
    @SerialName("prescription_type") val prescriptionType: String = "standard",
    @SerialName("clinical_semaphore") val clinicalSemaphore: String? = null,
    val medication: String,
    val formulation: String,
    @SerialName("quantity_units") val quantityUnits: Int = 0,
    @SerialName("pharmacy_id") val pharmacyId: String? = null,
    @SerialName("dispense_window_start") val dispenseWindowStart: String? = null,
    @SerialName("dispense_window_end") val dispenseWindowEnd: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String,
    @SerialName("pharmacy_name") val pharmacyName: String? = null,
)

@Serializable
data class DispensationEvent(
    val id: String,
    @SerialName("dispense_status") val dispenseStatus: String? = null,
    @SerialName("dispensed_medication") val dispensedMedication: String? = null,
    @SerialName("dispensed_formulation") val dispensedFormulation: String? = null,
    @SerialName("dispensed_quantity") val dispensedQuantity: Int? = null,
    @SerialName("substitution_type") val substitutionType: String? = null,
    @SerialName("pharmacy_notes") val pharmacyNotes: String? = null,
    @SerialName("dispensed_at") val dispensedAt: String? = null,
)