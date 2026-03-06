package com.autamedica.android.domain.model

data class AnamnesisSummary(
    val id: String,
    val status: String,
    val completionPercentage: Int,
    val locked: Boolean,
    val updatedAt: String,
    val completedSections: Int,
    val totalSections: Int,
)

data class AnamnesisSectionItem(
    val section: String,
    val completed: Boolean,
    val notes: String,
    val updatedAt: String? = null,
)

data class AnamnesisDetail(
    val summary: AnamnesisSummary,
    val sections: List<AnamnesisSectionItem>,
)

data class AnamnesisSection(
    val id: String,
    val anamnesisId: String,
    val section: String,
    val data: Map<String, String>,
    val completed: Boolean,
    val completedAt: String?,
    val updatedAt: String?,
) {
    companion object {
        val SECTION_ORDER = listOf(
            "personal_info",
            "allergies",
            "current_medications",
            "medical_conditions",
            "surgical_history",
            "family_history",
            "lifestyle",
        )

        fun displayName(section: String): String = when (section) {
            "personal_info" -> "Datos Personales"
            "allergies" -> "Alergias"
            "current_medications" -> "Medicamentos Actuales"
            "medical_conditions" -> "Condiciones Medicas"
            "surgical_history" -> "Historial Quirurgico"
            "family_history" -> "Antecedentes Familiares"
            "lifestyle" -> "Estilo de Vida"
            else -> section.replace("_", " ").replaceFirstChar { it.uppercase() }
        }
    }
}
