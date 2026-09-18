package com.autamedica.android.presentation.health

import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.domain.model.anamnesisDisplayStatus
import com.autamedica.android.domain.model.anamnesisReadOnlyReason
import com.autamedica.android.domain.model.isAnamnesisSummaryReadOnly

enum class FieldType {
    TEXT,
    NUMBER,
    TEXTAREA,
    DATE,
    SELECT,
    MULTISELECT,
    SCALE,
    BOOLEAN,
}

data class FieldOption(
    val value: String,
    val label: String,
)

data class AnamnesisFieldDefinition(
    val key: String,
    val label: String,
    val hint: String = "",
    val required: Boolean = false,
    val type: FieldType = FieldType.TEXT,
    val options: List<FieldOption> = emptyList(),
    val suggestions: List<String> = emptyList(),
    val scaleMin: Int = 1,
    val scaleMax: Int = 10,
    val scaleMinLabel: String = "Leve",
    val scaleMaxLabel: String = "Insoportable",
    val dependsOnKey: String? = null,
    val dependsOnValue: String? = null,
    val tooltip: String? = null,
)

data class SectionQuickAction(
    val label: String,
    val values: Map<String, String>,
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
    val quickAction: SectionQuickAction? = null,
    val message: String? = null,
)

private val sectionRules: Map<String, SectionRule> = mapOf(
    // ═══════════════════════════════════════════════════════════
    // 13 PASOS CLÍNICOS CANÓNICOS (Alineados con Web)
    // ═══════════════════════════════════════════════════════════

    // PASO 1: Fecha de nacimiento / Filiación
    "edad" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                key = "fecha_nacimiento",
                label = "Fecha de Nacimiento",
                hint = "AAAA-MM-DD",
                type = FieldType.DATE,
                required = false,
            ),
            AnamnesisFieldDefinition(
                key = "emergency_contact_name",
                label = "Contacto de Emergencia",
                hint = "Nombre y apellido del contacto",
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "emergency_contact_phone",
                label = "Telefono de Emergencia",
                hint = "+54 11 1234-5678",
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "blood_type",
                label = "Grupo Sanguíneo",
                hint = "Seleccionar grupo y factor",
                type = FieldType.SELECT,
                options = listOf(
                    FieldOption("A+", "A positivo (A+)"),
                    FieldOption("A-", "A negativo (A-)"),
                    FieldOption("B+", "B positivo (B+)"),
                    FieldOption("B-", "B negativo (B-)"),
                    FieldOption("AB+", "AB positivo (AB+)"),
                    FieldOption("AB-", "AB negativo (AB-)"),
                    FieldOption("O+", "O positivo (O+)"),
                    FieldOption("O-", "O negativo (O-)"),
                    FieldOption("desconocido", "No lo sé / Desconocido"),
                ),
            ),
        ),
        requiredKeys = setOf("emergency_contact_name", "emergency_contact_phone"),
        message = "Complete al menos el contacto de emergencia antes de continuar.",
    ),

    // PASO 2: Ocupación
    "ocupacion" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                key = "ocupacion_actual",
                label = "¿A qué te dedicás?",
                hint = "Ej: Docente, administrativo, comercio...",
                required = true,
                suggestions = listOf(
                    "Empleado administrativo",
                    "Docente / Educador",
                    "Comercio / Ventas",
                    "Estudiante",
                    "Salud / Médico / Enfermero",
                    "Construcción / Oficios",
                    "Transporte / Conductor",
                    "Jubilado / Retirado",
                ),
            ),
            AnamnesisFieldDefinition(
                key = "años_ocupacion",
                label = "¿Cuántos años llevás en este trabajo?",
                hint = "Ej: 5",
                type = FieldType.NUMBER,
            ),
            AnamnesisFieldDefinition(
                key = "exposicion_riesgos",
                label = "¿Estás expuesto a alguno de estos factores?",
                type = FieldType.MULTISELECT,
                options = listOf(
                    FieldOption("quimicos", "Químicos o vapores"),
                    FieldOption("ruido", "Ruido intenso"),
                    FieldOption("polvo", "Polvo o partículas"),
                    FieldOption("pantallas", "Pantallas muchas horas"),
                    FieldOption("cargas", "Cargar peso frecuente"),
                    FieldOption("estres", "Estrés laboral alto"),
                    FieldOption("ninguno", "Ninguno de los anteriores"),
                ),
            ),
        ),
        requiredKeys = setOf("ocupacion_actual"),
        message = "Por favor ingresá tu ocupación actual para evaluar tu contexto laboral.",
    ),

    // PASO 3: Motivo de consulta
    "motivo_consulta" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                key = "sintoma_principal",
                label = "Describí qué te está molestando",
                hint = "Ej: Me duele la cabeza del lado derecho, palpitaciones, ardor...",
                type = FieldType.TEXTAREA,
                required = true,
                suggestions = listOf(
                    "Control clínico de rutina",
                    "Dolor de cabeza persistente (Cefalea)",
                    "Fiebre o febrícula con decaimiento",
                    "Dolor de garganta / Disfonía",
                    "Dolor lumbar / Lumbalgia",
                    "Malestar estomacal / Acidez",
                    "Renovación de recetas crónicas",
                ),
            ),
            AnamnesisFieldDefinition(
                key = "cuando_empezo",
                label = "¿Cuándo empezó?",
                type = FieldType.SELECT,
                required = true,
                options = listOf(
                    FieldOption("hoy", "Hoy"),
                    FieldOption("2-7dias", "Hace 2 a 7 días"),
                    FieldOption("1-4semanas", "Hace 1 a 4 semanas"),
                    FieldOption("1-6meses", "Hace 1 a 6 meses"),
                    FieldOption("mas6meses", "Más de 6 meses"),
                ),
            ),
            AnamnesisFieldDefinition(
                key = "intensidad_sintoma",
                label = "¿Qué tan fuerte es el síntoma?",
                type = FieldType.SCALE,
                required = true,
                scaleMin = 1,
                scaleMax = 10,
                scaleMinLabel = "1 = Leve",
                scaleMaxLabel = "10 = Insoportable",
            ),
        ),
        requiredKeys = setOf("sintoma_principal", "cuando_empezo", "intensidad_sintoma"),
        message = "Describí el motivo de consulta, su duración e intensidad.",
    ),

    // PASO 4: Enfermedades previas
    "enfermedades_previas" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                key = "enfermedades_cronicas",
                label = "¿Tenés o tuviste alguna de estas condiciones?",
                type = FieldType.MULTISELECT,
                required = true,
                options = listOf(
                    FieldOption("diabetes", "Diabetes"),
                    FieldOption("hipertension", "Presión alta (Hipertensión)"),
                    FieldOption("asma", "Asma o EPOC"),
                    FieldOption("epilepsia", "Epilepsia / Convulsiones"),
                    FieldOption("cancer", "Cáncer u oncológicos"),
                    FieldOption("hepatitis", "Hepatitis B o C"),
                    FieldOption("vih", "VIH"),
                    FieldOption("tiroides", "Problemas de tiroides"),
                    FieldOption("ninguna", "Ninguna"),
                ),
            ),
            AnamnesisFieldDefinition(
                key = "enfermedades_detalle",
                label = "Aclaraciones o tratamientos específicos",
                hint = "Detalle adicional si tenés alguna condición diagnosticada",
                type = FieldType.TEXTAREA,
                suggestions = listOf(
                    "Bajo tratamiento regular con medicación",
                    "Control anual sin complicaciones",
                    "Diagnóstico reciente (< 1 año)",
                    "Sin internaciones previas",
                ),
            ),
        ),
        requiredKeys = setOf("enfermedades_cronicas"),
        quickAction = SectionQuickAction(
            label = "Sin antecedentes crónicos (Ninguna)",
            values = mapOf(
                "enfermedades_cronicas" to "ninguna",
                "enfermedades_detalle" to "Sin antecedentes patológicos crónicos",
            ),
        ),
        message = "Seleccioná tus antecedentes patológicos o indicá 'Ninguna'.",
    ),

    // PASO 5: Medicamentos
    "medicamentos" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                key = "toma_medicamentos",
                label = "¿Tomás algún medicamento actualmente?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "lista_medicamentos",
                label = "Listá tus medicamentos (nombre, dosis, para qué)",
                hint = "Ej:\n- Enalapril 10mg, 1 por día\n- Metformina 850mg con almuerzo",
                type = FieldType.TEXTAREA,
                required = false,
                dependsOnKey = "toma_medicamentos",
                dependsOnValue = "true",
                suggestions = listOf(
                    "Enalapril",
                    "Losartán",
                    "Metformina",
                    "Levotiroxina",
                    "Omeprazol",
                    "Atorvastatina",
                    "Aspirina 100mg",
                    "Clonazepam",
                    "Paracetamol",
                    "Ibuprofeno",
                ),
            ),
        ),
        requiredKeys = setOf("toma_medicamentos"),
        quickAction = SectionQuickAction(
            label = "Niega medicación habitual (No toma)",
            values = mapOf(
                "toma_medicamentos" to "false",
                "lista_medicamentos" to "",
            ),
        ),
        message = "Indicá si tomás medicamentos y detallalos si corresponde.",
    ),

    // PASO 6: Alergias
    "alergias" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                key = "tiene_alergias",
                label = "¿Tenés alguna alergia conocida?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "lista_alergias",
                label = "Listá tus alergias y qué reacción tuviste",
                hint = "Ej:\n- Penicilina: ronchas e hinchazón\n- Mariscos: dificultad para respirar",
                type = FieldType.TEXTAREA,
                required = false,
                dependsOnKey = "tiene_alergias",
                dependsOnValue = "true",
                suggestions = listOf(
                    "Penicilina / Amoxicilina",
                    "Aspirina / AINEs",
                    "Sulfas",
                    "Ibuprofeno",
                    "Contraste iodado",
                    "Látex",
                    "Mariscos / Pescados",
                    "Frutos secos",
                ),
            ),
            // Legacy field compatibility
            AnamnesisFieldDefinition(
                key = "medication_allergies",
                label = "Alergias a Medicamentos (Opcional)",
                hint = "Ej: Penicilina, Ibuprofeno",
                required = false,
            ),
        ),
        requiredKeys = setOf("tiene_alergias"),
        atLeastOneOf = setOf("tiene_alergias", "medication_allergies", "food_allergies"),
        quickAction = SectionQuickAction(
            label = "Niega alergias conocidas (Ninguna)",
            values = mapOf(
                "tiene_alergias" to "false",
                "lista_alergias" to "",
            ),
        ),
        message = "Indicá si presentás alergias conocidas.",
    ),

    // PASO 7: Antecedentes familiares
    "antecedentes_familiares" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                key = "padre_vivo",
                label = "¿Tu papá está vivo?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "padre_enfermedades",
                label = "Enfermedades o antecedentes del padre",
                type = FieldType.MULTISELECT,
                options = listOf(
                    FieldOption("diabetes", "Diabetes"),
                    FieldOption("hipertension", "Presión alta"),
                    FieldOption("infarto", "Infarto o cardiopatía"),
                    FieldOption("cancer", "Cáncer"),
                    FieldOption("colesterol_alto", "Colesterol alto"),
                    FieldOption("ninguna", "Ninguna conocida"),
                ),
            ),
            AnamnesisFieldDefinition(
                key = "madre_viva",
                label = "¿Tu mamá está viva?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "madre_enfermedades",
                label = "Enfermedades o antecedentes de la madre",
                type = FieldType.MULTISELECT,
                options = listOf(
                    FieldOption("diabetes", "Diabetes"),
                    FieldOption("hipertension", "Presión alta"),
                    FieldOption("cancer_mama", "Cáncer de mama"),
                    FieldOption("osteoporosis", "Osteoporosis"),
                    FieldOption("tiroides", "Problemas tiroideos"),
                    FieldOption("ninguna", "Ninguna conocida"),
                ),
            ),
            AnamnesisFieldDefinition(
                key = "hermanos_enfermedades",
                label = "Antecedentes en hermanos",
                type = FieldType.MULTISELECT,
                options = listOf(
                    FieldOption("diabetes", "Diabetes"),
                    FieldOption("cancer_joven", "Cáncer en edad temprana"),
                    FieldOption("enfermedad_mental", "Salud mental"),
                    FieldOption("no_hermanos", "No tengo hermanos"),
                    FieldOption("ninguna", "Ninguna conocida"),
                ),
            ),
        ),
        requiredKeys = setOf("padre_vivo", "madre_viva"),
        quickAction = SectionQuickAction(
            label = "Sin antecedentes familiares de relevancia",
            values = mapOf(
                "padre_vivo" to "true",
                "padre_enfermedades" to "ninguna",
                "madre_viva" to "true",
                "madre_enfermedades" to "ninguna",
                "hermanos_enfermedades" to "ninguna",
            ),
        ),
        message = "Completá los antecedentes de tus padres o indicá si están vivos.",
    ),

    // PASO 8: Hábitos de vida
    "habitos" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                key = "fuma",
                label = "¿Fumás o fumaste?",
                type = FieldType.SELECT,
                required = true,
                options = listOf(
                    FieldOption("nunca", "Nunca fumé"),
                    FieldOption("exfumador", "Fumé antes, ya dejé"),
                    FieldOption("actual", "Sí, fumo actualmente"),
                ),
            ),
            AnamnesisFieldDefinition(
                key = "cigarrillos_dia",
                label = "¿Cuántos cigarrillos al día?",
                hint = "Ej: 10",
                type = FieldType.NUMBER,
                dependsOnKey = "fuma",
                dependsOnValue = "actual",
            ),
            AnamnesisFieldDefinition(
                key = "alcohol",
                label = "¿Tomás alcohol?",
                type = FieldType.SELECT,
                required = true,
                options = listOf(
                    FieldOption("nunca", "No consumo"),
                    FieldOption("ocasional", "1 o 2 veces al mes"),
                    FieldOption("moderado", "1 o 2 veces por semana"),
                    FieldOption("frecuente", "3 a 6 veces por semana"),
                    FieldOption("diario", "Todos los días"),
                ),
            ),
            AnamnesisFieldDefinition(
                key = "ejercicio",
                label = "¿Hacés actividad física?",
                type = FieldType.SELECT,
                required = true,
                options = listOf(
                    FieldOption("sedentario", "No, estilo sedentario"),
                    FieldOption("ligero", "Poco (1 o 2 veces/semana)"),
                    FieldOption("moderado", "Regular (3 o 4 veces/semana)"),
                    FieldOption("intenso", "Intenso (5 o más veces/semana)"),
                ),
            ),
            AnamnesisFieldDefinition(
                key = "horas_sueno",
                label = "¿Cuántas horas dormís por noche en promedio?",
                type = FieldType.SCALE,
                required = true,
                scaleMin = 1,
                scaleMax = 12,
                scaleMinLabel = "1 h",
                scaleMaxLabel = "12 h",
            ),
            AnamnesisFieldDefinition(
                key = "dieta",
                label = "¿Cómo considerás tu alimentación?",
                type = FieldType.SELECT,
                required = true,
                options = listOf(
                    FieldOption("muy_mala", "Rápida o ultraprocesada"),
                    FieldOption("regular", "Variada, sin control estricto"),
                    FieldOption("buena", "Mayormente casera y equilibrada"),
                    FieldOption("excelente", "Plan nutricional guiado y saludable"),
                ),
            ),
        ),
        requiredKeys = setOf("fuma", "alcohol", "ejercicio", "horas_sueno", "dieta"),
        quickAction = SectionQuickAction(
            label = "Hábitos saludables (No fuma / Sin alcohol / Ejercicio)",
            values = mapOf(
                "fuma" to "nunca",
                "alcohol" to "nunca",
                "ejercicio" to "moderado",
                "horas_sueno" to "7",
                "dieta" to "buena",
            ),
        ),
        message = "Completá tabaquismo, alcohol, ejercicio, horas de sueño y alimentación.",
    ),

    // PASO 9: Cardiovascular
    "cardiovascular" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                key = "dolor_pecho",
                label = "¿Tuviste dolor o molestia en el pecho?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "dolor_pecho_detalle",
                label = "Describí el dolor de pecho",
                hint = "Localización, si es opresivo, cuándo se presenta...",
                type = FieldType.TEXTAREA,
                dependsOnKey = "dolor_pecho",
                dependsOnValue = "true",
                suggestions = listOf(
                    "Opresión precordial al esfuerzo físico",
                    "Puntadas intercostales con la respiración",
                    "Sensación de ardor retroesternal",
                    "Episodio aislado que cedió espontáneamente",
                ),
            ),
            AnamnesisFieldDefinition(
                key = "falta_aire",
                label = "¿Te falta el aire o sentís ahogo?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "palpitaciones",
                label = "¿Sentís palpitaciones o latidos irregulares?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "hinchazon_piernas",
                label = "¿Se te hinchan los pies o las piernas?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "sintomas_cardiovasculares",
                label = "¿Presentás alguno de estos síntomas?",
                type = FieldType.MULTISELECT,
                options = listOf(
                    FieldOption("mareos", "Mareos o desvanecimiento"),
                    FieldOption("sudoracion", "Sudor frío repentino"),
                    FieldOption("fatiga_extrema", "Cansancio extremo al caminar"),
                    FieldOption("tos_nocturna", "Tos al acostarse"),
                    FieldOption("ninguno", "Ninguno"),
                ),
            ),
        ),
        requiredKeys = setOf("dolor_pecho", "falta_aire", "palpitaciones", "hinchazon_piernas"),
        quickAction = SectionQuickAction(
            label = "Niega síntomas cardiovasculares (Normal)",
            values = mapOf(
                "dolor_pecho" to "false",
                "falta_aire" to "false",
                "palpitaciones" to "false",
                "hinchazon_piernas" to "false",
                "sintomas_cardiovasculares" to "ninguno",
            ),
        ),
        message = "Respondé las preguntas sobre dolor de pecho, palpitaciones e hinchazón.",
    ),

    // PASO 10: Respiratorio
    "respiratorio" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                key = "tos",
                label = "¿Tenés tos persistente (más de 3 semanas)?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "tos_detalle",
                label = "Describí las características de la tos",
                hint = "Seca, con flema, de noche, con dolor...",
                type = FieldType.TEXTAREA,
                dependsOnKey = "tos",
                dependsOnValue = "true",
                suggestions = listOf(
                    "Tos seca irritativa sin expectoración",
                    "Tos con flema blanquecina o mucosa",
                    "Predominio nocturno al acostarse",
                    "Asociada a cuadro gripal reciente",
                ),
            ),
            AnamnesisFieldDefinition(
                key = "falta_aire_respiratorio",
                label = "¿Te falta el aire al realizar esfuerzos cotidianos?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "silbido_pecho",
                label = "¿Escuchás silbidos o chillidos al respirar?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "sintomas_respiratorios",
                label = "¿Presentás alguno de estos síntomas?",
                type = FieldType.MULTISELECT,
                options = listOf(
                    FieldOption("sangre_tos", "Flemas con sangre"),
                    FieldOption("dolor_respirar", "Dolor al respirar profundo"),
                    FieldOption("ronquidos", "Ronquidos fuertes o pausas"),
                    FieldOption("flema_color", "Flema amarillenta o verdosa"),
                    FieldOption("ninguno", "Ninguno"),
                ),
            ),
        ),
        requiredKeys = setOf("tos", "falta_aire_respiratorio", "silbido_pecho"),
        quickAction = SectionQuickAction(
            label = "Niega síntomas respiratorios (Normal)",
            values = mapOf(
                "tos" to "false",
                "falta_aire_respiratorio" to "false",
                "silbido_pecho" to "false",
                "sintomas_respiratorios" to "ninguno",
            ),
        ),
        message = "Completá la evaluación respiratoria (tos, disnea y sibilancias).",
    ),

    // PASO 11: Digestivo
    "digestivo" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                key = "acidez",
                label = "¿Tenés acidez gástrica o reflujo frecuente?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "dolor_abdominal",
                label = "¿Tenés dolor abdominal o de panza persistente?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "cambio_habito_intestinal",
                label = "¿Cambió tu ritmo intestinal?",
                type = FieldType.SELECT,
                required = true,
                options = listOf(
                    FieldOption("no", "No, ritmo normal"),
                    FieldOption("diarrea", "Diarrea frecuente"),
                    FieldOption("estrenimiento", "Estreñimiento o constipación"),
                    FieldOption("alternante", "Alternancia entre diarrea y constipación"),
                ),
            ),
            AnamnesisFieldDefinition(
                key = "sintomas_digestivos",
                label = "¿Presentás alguno de estos signos de alarma?",
                type = FieldType.MULTISELECT,
                options = listOf(
                    FieldOption("sangre_heces", "Sangre visible en heces"),
                    FieldOption("heces_negras", "Heces negras o alquitranadas"),
                    FieldOption("perdida_peso", "Pérdida de peso sin causa"),
                    FieldOption("dificultad_tragar", "Dificultad o dolor al tragar"),
                    FieldOption("nausea_vomito", "Náuseas o vómitos frecuentes"),
                    FieldOption("hinchazon", "Distensión o pesadez severa"),
                    FieldOption("ninguno", "Ninguno"),
                ),
            ),
        ),
        requiredKeys = setOf("acidez", "dolor_abdominal", "cambio_habito_intestinal"),
        quickAction = SectionQuickAction(
            label = "Niega síntomas digestivos (Normal)",
            values = mapOf(
                "acidez" to "false",
                "dolor_abdominal" to "false",
                "cambio_habito_intestinal" to "no",
                "sintomas_digestivos" to "ninguno",
            ),
        ),
        message = "Respondé sobre acidez, dolor abdominal y hábito intestinal.",
    ),

    // PASO 12: Genitourinario
    "genitourinario" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                key = "dolor_orinar",
                label = "¿Tenés dolor o ardor al orinar?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "frecuencia_urinaria",
                label = "¿Notaste alteraciones en la frecuencia urinaria?",
                type = FieldType.SELECT,
                required = true,
                options = listOf(
                    FieldOption("normal", "No, normal"),
                    FieldOption("frecuente_dia", "Orino muy seguido durante el día"),
                    FieldOption("frecuente_noche", "Me levanto varias veces de noche"),
                    FieldOption("urgencia", "Urgencia miccional (dificultad para contener)"),
                ),
            ),
            AnamnesisFieldDefinition(
                key = "sintomas_genitourinarios",
                label = "¿Presentás alguno de estos síntomas?",
                type = FieldType.MULTISELECT,
                options = listOf(
                    FieldOption("sangre_orina", "Sangre en la orina"),
                    FieldOption("chorro_debil", "Chorro miccional débil o cortado"),
                    FieldOption("incontinencia", "Pérdida involuntaria de orina"),
                    FieldOption("dolor_lumbar", "Dolor agudo en cintura o riñón"),
                    FieldOption("ninguno", "Ninguno"),
                ),
            ),
        ),
        requiredKeys = setOf("dolor_orinar", "frecuencia_urinaria"),
        quickAction = SectionQuickAction(
            label = "Niega síntomas urinarios (Normal)",
            values = mapOf(
                "dolor_orinar" to "false",
                "frecuencia_urinaria" to "normal",
                "sintomas_genitourinarios" to "ninguno",
            ),
        ),
        message = "Indicá si sentís dolor al orinar o cambios en la frecuencia.",
    ),

    // PASO 13: Resumen final
    "resumen_final" to SectionRule(
        fields = listOf(
            AnamnesisFieldDefinition(
                key = "confirma_informacion",
                label = "¿Confirmás que la información provista es verídica y completa?",
                type = FieldType.BOOLEAN,
                required = true,
            ),
            AnamnesisFieldDefinition(
                key = "comentarios_adicionales",
                label = "¿Algo más que quieras que el médico sepa?",
                hint = "Ej: Preferencias personales, temores, dudas previas a la consulta...",
                type = FieldType.TEXTAREA,
                suggestions = listOf(
                    "Aporto estudios complementarios previos",
                    "Solicito renovación de medicación habitual",
                    "Primera consulta sobre este cuadro",
                    "Sin comentarios adicionales",
                ),
            ),
        ),
        requiredKeys = setOf("confirma_informacion"),
        message = "Por favor confirmá la veracidad de la información antes del cierre.",
    ),

    // ═══════════════════════════════════════════════════════════
    // SECCIONES LEGACY (Compatibilidad con registros previos)
    // ═══════════════════════════════════════════════════════════

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

fun getSectionQuickAction(section: String): SectionQuickAction? = sectionRules[section]?.quickAction

fun validateSection(section: String, fieldValues: Map<String, String>): SectionValidationResult {
    val rule = sectionRules[section] ?: return validateFallback(fieldValues)
    val fieldErrors = linkedMapOf<String, String>()

    rule.fields.forEach { field ->
        val isVisible = if (field.dependsOnKey != null) {
            fieldValues[field.dependsOnKey]?.trim() == field.dependsOnValue
        } else {
            true
        }

        val isKeyRequired = isVisible && (field.required || field.key in rule.requiredKeys)
        if (isKeyRequired) {
            val rawValue = fieldValues[field.key]
            when {
                rawValue.isNullOrBlank() -> {
                    fieldErrors[field.key] = "Este campo es obligatorio."
                }
                field.key.contains("phone") && !looksLikePhone(rawValue) -> {
                    fieldErrors[field.key] = "Ingrese un telefono valido para emergencias."
                }
                field.type == FieldType.BOOLEAN && rawValue != "true" && rawValue != "false" -> {
                    fieldErrors[field.key] = "Seleccione una opción."
                }
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
