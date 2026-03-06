package com.autamedica.android.presentation.health

import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.domain.model.anamnesisDisplayStatus
import com.autamedica.android.domain.model.anamnesisReadOnlyReason
import com.autamedica.android.domain.model.isAnamnesisSummaryReadOnly

data class AnamnesisFieldDefinition(
    val key: String,
    val label: String,
    val hint: String,
    val required: Boolean = false,
)

data class SectionValidationResult(
    val isValid: Boolean,
    val fieldErrors: Map<String, String> = emptyMap(),
    val message: String? = null,
)

private data class SectionRule(
    val fields: List<AnamnesisFieldDefinition>,
    val requiredKeys: Set<String> = emptySet(),
    val atLeastOneOf: Set<String> = emptySet(),
    val message: String? = null,
)

private val sectionRules: Map<String, SectionRule> = mapOf(
    "personal_info" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition("blood_type", "Grupo Sanguineo", "Ej: A+, O-, AB+"),
            AnamnesisFieldDefinition(
                "emergency_contact_name",
                "Contacto de Emergencia",
                "Nombre completo",
                required = true,
            ),
            AnamnesisFieldDefinition(
                "emergency_contact_phone",
                "Telefono de Emergencia",
                "+54 11 1234-5678",
                required = true,
            ),
            AnamnesisFieldDefinition("occupation", "Ocupacion", "Ej: Ingeniero, Docente"),
        ),
        requiredKeys = setOf("emergency_contact_name", "emergency_contact_phone"),
        message = "Complete al menos el contacto de emergencia antes de continuar.",
    ),
    "allergies" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                "medication_allergies",
                "Alergias a Medicamentos",
                "Ej: Penicilina, Ibuprofeno",
            ),
            AnamnesisFieldDefinition(
                "food_allergies",
                "Alergias Alimentarias",
                "Ej: Frutos secos, Mariscos",
            ),
            AnamnesisFieldDefinition(
                "environmental_allergies",
                "Alergias Ambientales",
                "Ej: Polen, Polvo, Acaros",
            ),
            AnamnesisFieldDefinition(
                "other_allergies",
                "Otras Alergias",
                "Latex, Picaduras, etc.",
            ),
        ),
        atLeastOneOf = setOf(
            "medication_allergies",
            "food_allergies",
            "environmental_allergies",
            "other_allergies",
        ),
        message = "Registre alergias relevantes o escriba 'Ninguna' si no presenta antecedentes.",
    ),
    "current_medications" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                "medications",
                "Medicamentos Actuales",
                "Nombre, dosis, frecuencia",
            ),
            AnamnesisFieldDefinition(
                "supplements",
                "Suplementos y Vitaminas",
                "Ej: Vitamina D, Omega 3",
            ),
            AnamnesisFieldDefinition(
                "natural_remedies",
                "Remedios Naturales",
                "Ej: Valeriana, Melatonina",
            ),
        ),
        atLeastOneOf = setOf("medications", "supplements", "natural_remedies"),
        message = "Declare medicacion actual o escriba 'Ninguno' para dejar constancia clinica.",
    ),
    "medical_conditions" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                "chronic_conditions",
                "Enfermedades Cronicas",
                "Ej: Diabetes, Hipertension",
            ),
            AnamnesisFieldDefinition(
                "past_conditions",
                "Enfermedades Pasadas Relevantes",
                "Ej: Hepatitis, Dengue",
            ),
            AnamnesisFieldDefinition(
                "mental_health",
                "Salud Mental",
                "Ej: Ansiedad, Depresion (tratada/actual)",
            ),
            AnamnesisFieldDefinition("disabilities", "Discapacidades", "Si aplica"),
        ),
        atLeastOneOf = setOf(
            "chronic_conditions",
            "past_conditions",
            "mental_health",
            "disabilities",
        ),
        message = "Declare antecedentes clinicos o escriba 'Ninguno' si no corresponde.",
    ),
    "surgical_history" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                "surgeries",
                "Cirugias Previas",
                "Tipo, fecha aproximada, hospital",
            ),
            AnamnesisFieldDefinition(
                "hospitalizations",
                "Internaciones",
                "Motivo, duracion, fecha",
            ),
            AnamnesisFieldDefinition(
                "anesthesia_reactions",
                "Reacciones a Anestesia",
                "Si tuvo alguna reaccion",
            ),
        ),
        atLeastOneOf = setOf("surgeries", "hospitalizations", "anesthesia_reactions"),
        message = "Declare cirugias o internaciones previas, o escriba 'Ninguna'.",
    ),
    "family_history" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                "cardiovascular",
                "Enfermedades Cardiovasculares",
                "Familiar y parentesco",
            ),
            AnamnesisFieldDefinition("cancer", "Cancer", "Tipo, familiar y parentesco"),
            AnamnesisFieldDefinition("diabetes_family", "Diabetes", "Familiar y parentesco"),
            AnamnesisFieldDefinition(
                "other_hereditary",
                "Otras Enfermedades Hereditarias",
                "Detalle",
            ),
        ),
        atLeastOneOf = setOf(
            "cardiovascular",
            "cancer",
            "diabetes_family",
            "other_hereditary",
        ),
        message = "Declare antecedentes familiares o escriba 'Sin antecedentes familiares conocidos'.",
    ),
    "lifestyle" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                "smoking",
                "Tabaquismo",
                "No fumador / Ex fumador / Actual (cantidad)",
                required = true,
            ),
            AnamnesisFieldDefinition(
                "alcohol",
                "Alcohol",
                "No consume / Ocasional / Regular",
                required = true,
            ),
            AnamnesisFieldDefinition(
                "exercise",
                "Actividad Fisica",
                "Tipo, frecuencia semanal",
                required = true,
            ),
            AnamnesisFieldDefinition("diet", "Alimentacion", "Tipo de dieta, restricciones"),
            AnamnesisFieldDefinition(
                "sleep",
                "Patron de Sueno",
                "Horas promedio, calidad",
                required = true,
            ),
        ),
        requiredKeys = setOf("smoking", "alcohol", "exercise", "sleep"),
        message = "Complete tabaquismo, alcohol, actividad fisica y patron de sueno.",
    ),
)

fun getSectionFieldDefinitions(section: String): List<AnamnesisFieldDefinition> =
    sectionRules[section]?.fields ?: listOf(
        AnamnesisFieldDefinition("notes", "Notas", "Ingrese informacion relevante", required = true),
    )

fun getSectionValidationHint(section: String): String? = sectionRules[section]?.message

fun validateSection(section: String, fieldValues: Map<String, String>): SectionValidationResult {
    val rule = sectionRules[section] ?: return validateFallback(fieldValues)
    val fieldErrors = linkedMapOf<String, String>()

    rule.requiredKeys.forEach { key ->
        val rawValue = fieldValues[key]
        when {
            rawValue.isNullOrBlank() -> {
                fieldErrors[key] = "Este campo es obligatorio."
            }
            key == "emergency_contact_phone" && !looksLikePhone(rawValue) -> {
                fieldErrors[key] = "Ingrese un telefono valido para emergencias."
            }
        }
    }

    if (rule.atLeastOneOf.isNotEmpty() && rule.atLeastOneOf.none { hasMeaningfulAnswer(fieldValues[it]) }) {
        val errorMessage = rule.message ?: "Complete al menos un dato relevante en esta seccion."
        rule.atLeastOneOf.forEachIndexed { index, key ->
            if (index == 0) {
                fieldErrors[key] = errorMessage
            }
        }
    }

    return if (fieldErrors.isEmpty()) {
        SectionValidationResult(isValid = true)
    } else {
        SectionValidationResult(
            isValid = false,
            fieldErrors = fieldErrors,
            message = rule.message ?: "Revise los datos obligatorios de esta seccion.",
        )
    }
}

fun isAnamnesisReadOnly(summary: AnamnesisSummary?): Boolean {
    return isAnamnesisSummaryReadOnly(summary)
}

fun anamnesisReadOnlyMessage(summary: AnamnesisSummary?): String? {
    return anamnesisReadOnlyReason(summary)
}

fun anamnesisStatusLabel(summary: AnamnesisSummary?): String = anamnesisDisplayStatus(summary)

private fun validateFallback(fieldValues: Map<String, String>): SectionValidationResult {
    return if (fieldValues.values.any(::hasMeaningfulAnswer)) {
        SectionValidationResult(isValid = true)
    } else {
        SectionValidationResult(
            isValid = false,
            fieldErrors = mapOf("notes" to "Ingrese al menos una nota clinica relevante."),
            message = "Ingrese al menos una nota clinica relevante antes de continuar.",
        )
    }
}

private fun hasMeaningfulAnswer(value: String?): Boolean = !value.isNullOrBlank()

private fun looksLikePhone(value: String): Boolean =
    value.count(Char::isDigit) >= 6
