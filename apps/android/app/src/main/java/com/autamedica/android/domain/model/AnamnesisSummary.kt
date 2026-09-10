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
        val CANONICAL_SECTIONS = listOf(
            "edad",
            "ocupacion",
            "motivo_consulta",
            "enfermedades_previas",
            "medicamentos",
            "alergias",
            "antecedentes_familiares",
            "habitos",
            "cardiovascular",
            "respiratorio",
            "digestivo",
            "genitourinario",
            "resumen_final",
        )

        val LEGACY_SECTIONS = listOf(
            "personal_info",
            "allergies",
            "current_medications",
            "medical_conditions",
            "surgical_history",
            "family_history",
            "lifestyle",
        )

        val SECTION_ORDER = CANONICAL_SECTIONS

        fun category(section: String): String = when (section) {
            "edad", "ocupacion", "personal_info" -> "Filiación"
            "motivo_consulta" -> "Motivo consulta"
            "enfermedades_previas", "medicamentos", "alergias", "antecedentes_familiares",
            "current_medications", "medical_conditions", "surgical_history", "family_history" -> "Antecedentes"
            "habitos", "lifestyle" -> "Estilo de vida"
            "cardiovascular", "respiratorio", "digestivo", "genitourinario" -> "Aparatos/Sistemas"
            "resumen_final" -> "Cierre"
            else -> "General"
        }

        fun subtitle(section: String): String = when (section) {
            "edad" -> "Tu fecha de nacimiento y datos de contacto"
            "ocupacion" -> "Tu rutina diaria y entorno de trabajo"
            "motivo_consulta" -> "Contanos con tus palabras qué te trae hoy"
            "enfermedades_previas" -> "Condiciones crónicas o diagnósticos previos"
            "medicamentos" -> "Fármacos, dosis y suplementos actuales"
            "alergias" -> "Alergias a medicamentos, alimentos o sustancias"
            "antecedentes_familiares" -> "Antecedentes de salud en padres y hermanos"
            "habitos" -> "Tabaquismo, alcohol, actividad física, sueño y nutrición"
            "cardiovascular" -> "Evaluación del corazón y circulación"
            "respiratorio" -> "Evaluación de pulmones y respiración"
            "digestivo" -> "Evaluación del aparato digestivo y tránsito"
            "genitourinario" -> "Evaluación del sistema urinario y renal"
            "resumen_final" -> "Confirmación y observaciones finales"
            "personal_info" -> "Datos personales y contacto de emergencia"
            "current_medications" -> "Medicamentos habituales"
            "medical_conditions" -> "Condiciones médicas previas"
            "surgical_history" -> "Historial quirúrgico e internaciones"
            "family_history" -> "Antecedentes médicos familiares"
            "lifestyle" -> "Hábitos y estilo de vida"
            else -> ""
        }

        fun displayName(section: String): String = when (section) {
            "edad" -> "Datos Personales"
            "ocupacion" -> "Ocupación"
            "motivo_consulta" -> "Motivo de Consulta"
            "enfermedades_previas" -> "Enfermedades Previas"
            "medicamentos" -> "Medicamentos"
            "alergias" -> "Alergias"
            "antecedentes_familiares" -> "Antecedentes Familiares"
            "habitos" -> "Estilo de Vida"
            "cardiovascular" -> "Corazón"
            "respiratorio" -> "Pulmones"
            "digestivo" -> "Digestivo"
            "genitourinario" -> "Sistema Urinario"
            "resumen_final" -> "Resumen Final"
            "personal_info" -> "Datos Personales"
            "current_medications" -> "Medicamentos Actuales"
            "medical_conditions" -> "Condiciones Médicas"
            "surgical_history" -> "Historial Quirúrgico"
            "family_history" -> "Antecedentes Familiares"
            "lifestyle" -> "Estilo de Vida"
            else -> section.replace("_", " ").replaceFirstChar { it.uppercase() }
        }

        fun shortLabel(section: String): String = when (section) {
            "edad" -> "Edad"
            "ocupacion" -> "Trabajo"
            "motivo_consulta" -> "Motivo"
            "enfermedades_previas" -> "Enfermedades"
            "medicamentos" -> "Medicamentos"
            "alergias" -> "Alergias"
            "antecedentes_familiares" -> "Familia"
            "habitos" -> "Hábitos"
            "cardiovascular" -> "Corazón"
            "respiratorio" -> "Pulmones"
            "digestivo" -> "Digestivo"
            "genitourinario" -> "Urinario"
            "resumen_final" -> "Resumen"
            "personal_info" -> "Datos"
            "current_medications" -> "Fármacos"
            "medical_conditions" -> "Clínica"
            "surgical_history" -> "Cirugías"
            "family_history" -> "Familia"
            "lifestyle" -> "Hábitos"
            else -> displayName(section)
        }
    }
}
