package com.autamedica.android.domain.model

data class SuggestedClinicalQuestion(
    val question: String,
    val priority: String = "medium", // critical | high | medium
)

/**
 * Guía clínica para la call. Paridad funcional con ConsultationContextPanel (web):
 * motivo, red flags y preguntas sugeridas al frente del HUD médico.
 *
 * Hasta cablear el endpoint /context de anamnesis+extraction, se arma con
 * contexto local + heurística de motivo (misma intención clínica que la web).
 */
data class CallClinicalGuidance(
    val chiefComplaint: String? = null,
    val presentIllness: String? = null,
    val redFlags: List<String> = emptyList(),
    val familyHistory: List<String> = emptyList(),
    val suggestedQuestions: List<SuggestedClinicalQuestion> = emptyList(),
) {
    val hasContent: Boolean
        get() = !chiefComplaint.isNullOrBlank() ||
            !presentIllness.isNullOrBlank() ||
            redFlags.isNotEmpty() ||
            familyHistory.isNotEmpty() ||
            suggestedQuestions.isNotEmpty()
}

object CallClinicalGuidanceBuilder {
    fun fromLocalContext(
        context: PatientClinicalContext?,
        appointmentNotes: String?,
        preconsultationReason: String?,
    ): CallClinicalGuidance {
        val motivo = context?.chiefComplaint?.takeIf { it.isNotBlank() }
            ?: context?.presentIllness?.takeIf { it.isNotBlank() }
            ?: appointmentNotes?.takeIf { it.isNotBlank() }
            ?: preconsultationReason?.takeIf { it.isNotBlank() }

        val redFlags = buildList {
            context?.allergies.orEmpty().filter { it.isNotBlank() }.forEach { allergy ->
                add("Alergia: $allergy")
            }
            context?.chronicDiseases.orEmpty().filter { it.isNotBlank() }.forEach { disease ->
                add("Antecedente: $disease")
            }
            val meds = context?.medications?.takeIf { it.isNotBlank() }
            if (meds != null) add("Medicación actual: $meds")
        }

        val questions = buildQuestionsForMotivo(motivo, context)

        return CallClinicalGuidance(
            chiefComplaint = motivo,
            presentIllness = context?.presentIllness?.takeIf { it.isNotBlank() },
            redFlags = redFlags,
            familyHistory = context?.familyHistory.orEmpty().filter { it.isNotBlank() },
            suggestedQuestions = questions,
        )
    }

    private fun buildQuestionsForMotivo(
        motivo: String?,
        context: PatientClinicalContext?,
    ): List<SuggestedClinicalQuestion> {
        val text = (motivo ?: "").lowercase()
        val questions = mutableListOf<SuggestedClinicalQuestion>()

        when {
            text.contains("cefalea") || text.contains("dolor de cabeza") || text.contains("migra") -> {
                questions += SuggestedClinicalQuestion(
                    "¿Inicio súbito (“el peor de la vida”) o gradual?",
                    "critical",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Fiebre, rigidez de nuca, confusión o déficit neurológico?",
                    "critical",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Fotofobia, náuseas, aura visual o dolor unilateral?",
                    "high",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Qué analgésicos usó y con qué respuesta?",
                    "medium",
                )
            }
            text.contains("pecho") || text.contains("torácic") || text.contains("precordial") -> {
                questions += SuggestedClinicalQuestion(
                    "¿Dolor en reposo, irradiación a brazo/mandíbula o disnea?",
                    "critical",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Sudoración, náuseas o síncope asociado?",
                    "critical",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Factores de riesgo cardiovascular (HTA, DM, tabaquismo)?",
                    "high",
                )
            }
            text.contains("disnea") || text.contains("falta de aire") || text.contains("ahogo") ||
                text.contains("respir") -> {
                questions += SuggestedClinicalQuestion(
                    "¿Inicio súbito, esfuerzo o en reposo?",
                    "critical",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Dolor torácico, hemoptisis, fiebre o edema de piernas?",
                    "critical",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Asma/EPOC conocidos y uso de inhaladores?",
                    "high",
                )
            }
            text.contains("abdomen") || text.contains("estómago") || text.contains("estomago") ||
                text.contains("vómito") || text.contains("vomito") || text.contains("diarrea") -> {
                questions += SuggestedClinicalQuestion(
                    "¿Localización, irradiación y signos de alarma (rigidez, sangre)?",
                    "critical",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Fiebre, intolerancia oral o deshidratación?",
                    "high",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Última deposición y si hay diarrea o estreñimiento?",
                    "medium",
                )
            }
            text.contains("mareo") || text.contains("vértigo") || text.contains("vertigo") ||
                text.contains("desmayo") || text.contains("síncope") || text.contains("sincope") -> {
                questions += SuggestedClinicalQuestion(
                    "¿Pérdida de conciencia o solo inestabilidad?",
                    "critical",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Palpitaciones, dolor de pecho o déficit neurológico?",
                    "critical",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Relación con ortostatismo, ayuno o medicación?",
                    "high",
                )
            }
            text.contains("fiebre") || text.contains("infec") -> {
                questions += SuggestedClinicalQuestion(
                    "¿Cuántos días de fiebre y cuál fue el pico máximo?",
                    "high",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Foco infeccioso local (tos, orina, piel, oído)?",
                    "high",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Contactos, viajes recientes o inmunosupresión?",
                    "medium",
                )
            }
            text.contains("ansiedad") || text.contains("pánico") || text.contains("panico") ||
                text.contains("estrés") || text.contains("estres") || text.contains("depresión") ||
                text.contains("depresion") -> {
                questions += SuggestedClinicalQuestion(
                    "¿Ideación de autolesión o riesgo inminente?",
                    "critical",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Desde cuándo, disparadores y impacto funcional?",
                    "high",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Sueño, apetito y uso de sustancias o psicofármacos?",
                    "medium",
                )
            }
            text.contains("hipertens") || text.contains("presión") || text.contains("presion") ||
                text.contains("hta") -> {
                questions += SuggestedClinicalQuestion(
                    "¿Últimas tomas de presión y síntomas asociados (cefalea, visión)?",
                    "high",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Adherencia a antihipertensivos y horarios?",
                    "high",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Edema, disnea o dolor torácico recientes?",
                    "critical",
                )
            }
            text.contains("diabet") || text.contains("glucem") || text.contains("azúcar") ||
                text.contains("azucar") -> {
                questions += SuggestedClinicalQuestion(
                    "¿Últimas glucemias / HbA1c y síntomas de hipo o hiperglucemia?",
                    "high",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Adherencia a insulina/antidiabéticos orales?",
                    "high",
                )
                questions += SuggestedClinicalQuestion(
                    "¿Heridas, infecciones o cambios visuales?",
                    "medium",
                )
            }
            else -> {
                if (!motivo.isNullOrBlank()) {
                    questions += SuggestedClinicalQuestion(
                        "¿Desde cuándo y cómo evolucionó el síntoma principal?",
                        "high",
                    )
                    questions += SuggestedClinicalQuestion(
                        "¿Qué lo agrava y qué lo alivia?",
                        "medium",
                    )
                    questions += SuggestedClinicalQuestion(
                        "¿Hubo tratamientos previos y qué respuesta tuvieron?",
                        "medium",
                    )
                    questions += SuggestedClinicalQuestion(
                        "¿Signos de alarma que te preocupen ahora mismo?",
                        "high",
                    )
                }
            }
        }

        if (context?.allergies.orEmpty().any { it.isNotBlank() }) {
            questions.add(
                0,
                SuggestedClinicalQuestion(
                    "Antes de indicar fármacos: confirmar alergias y reacciones previas",
                    "critical",
                ),
            )
        }

        return questions.distinctBy { it.question }.take(5)
    }
}
