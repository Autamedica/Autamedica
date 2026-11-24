package com.autamedica.android.presentation.health

internal data class FieldTranslationPt(
    val label: String,
    val hint: String? = null,
    val scaleMinLabel: String? = null,
    val scaleMaxLabel: String? = null,
    val optionLabels: Map<String, String> = emptyMap(),
)

internal val anamnesisSectionMessagesPt: Map<String, String> = mapOf(
    "edad" to "Preencha pelo menos o contato de emergência antes de continuar.",
    "ocupacion" to "Por favor, informe sua ocupação atual para avaliarmos seu contexto de trabalho.",
    "motivo_consulta" to "Descreva o motivo da consulta, duração e intensidade.",
    "enfermedades_previas" to "Selecione seu histórico clínico ou indique 'Nenhuma'.",
    "medicamentos" to "Informe se toma medicamentos e detalhe caso utilize algum.",
    "alergias" to "Informe se possui alergias conhecidas.",
    "antecedentes_familiares" to "Preencha o histórico dos seus pais ou informe se estão vivos.",
    "habitos" to "Preencha tabagismo, álcool, atividade física, horas de sono e alimentação.",
    "cardiovascular" to "Responda às perguntas sobre dor no peito, palpitações e inchaço.",
    "respiratorio" to "Preencha a avaliação respiratória (tosse, falta de ar e chiado).",
    "digestivo" to "Responda sobre azia, dor abdominal e hábito intestinal.",
    "genitourinario" to "Informe se sente dor ao urinar ou mudanças na frequência.",
    "resumen_final" to "Por favor, confirme a veracidade das informações antes de encerrar.",
    "personal_info" to "Preencha pelo menos o contato de emergência antes de continuar.",
    "current_medications" to "Declare a medicação atual ou escreva 'Nenhum' para registro clínico.",
    "medical_conditions" to "Declare antecedentes clínicos ou escreva 'Nenhum' se não houver.",
    "surgical_history" to "Declare cirurgias ou internações anteriores, ou escreva 'Nenhuma'.",
    "family_history" to "Declare antecedentes familiares ou escreva 'Sem antecedentes familiares conhecidos'.",
    "lifestyle" to "Preencha tabagismo, álcool, atividade física e padrão de sono.",
)

internal val anamnesisFieldTranslationsPt: Map<String, FieldTranslationPt> = mapOf(
    "edad:fecha_nacimiento" to FieldTranslationPt(
        label = "Data de Nascimento",
        hint = "AAAA-MM-DD",
    ),
    "edad:emergency_contact_name" to FieldTranslationPt(
        label = "Contato de Emergência",
        hint = "Nome e sobrenome do contato",
    ),
    "edad:emergency_contact_phone" to FieldTranslationPt(
        label = "Telefone de Emergência",
        hint = "+55 11 91234-5678",
    ),
    "edad:blood_type" to FieldTranslationPt(
        label = "Tipo Sanguíneo",
        hint = "Selecionar grupo e fator",
        optionLabels = mapOf(
            "A+" to "A positivo (A+)",
            "A-" to "A negativo (A-)",
            "B+" to "B positivo (B+)",
            "B-" to "B negativo (B-)",
            "AB+" to "AB positivo (AB+)",
            "AB-" to "AB negativo (AB-)",
            "O+" to "O positivo (O+)",
            "O-" to "O negativo (O-)",
            "desconocido" to "Não sei / Desconhecido",
        ),
    ),
    "ocupacion:ocupacion_actual" to FieldTranslationPt(
        label = "Qual é a sua ocupação?",
        hint = "Ex.: Professor, administrativo, comércio...",
    ),
    "ocupacion:años_ocupacion" to FieldTranslationPt(
        label = "Há quantos anos trabalha nessa função?",
        hint = "Ex.: 5",
    ),
    "ocupacion:exposicion_riesgos" to FieldTranslationPt(
        label = "Você fica exposto a algum destes fatores?",
        optionLabels = mapOf(
            "quimicos" to "Químicos ou vapores",
            "ruido" to "Ruído intenso",
            "polvo" to "Poeira ou partículas",
            "pantallas" to "Telas por muitas horas",
            "cargas" to "Carregar peso com frequência",
            "estres" to "Estresse ocupacional elevado",
            "ninguno" to "Nenhum dos anteriores",
        ),
    ),
    "motivo_consulta:sintoma_principal" to FieldTranslationPt(
        label = "Descreva o que está sentindo",
        hint = "Ex.: Dor de cabeça do lado direito, palpitações, queimação...",
    ),
    "motivo_consulta:cuando_empezo" to FieldTranslationPt(
        label = "Quando começou?",
        optionLabels = mapOf(
            "hoy" to "Hoje",
            "2-7dias" to "Há 2 a 7 dias",
            "1-4semanas" to "Há 1 a 4 semanas",
            "1-6meses" to "Há 1 a 6 meses",
            "mas6meses" to "Mais de 6 meses",
        ),
    ),
    "motivo_consulta:intensidad_sintoma" to FieldTranslationPt(
        label = "Qual é a intensidade do sintoma?",
        scaleMinLabel = "1 = Leve",
        scaleMaxLabel = "10 = Insuportável",
    ),
    "enfermedades_previas:enfermedades_cronicas" to FieldTranslationPt(
        label = "Você tem ou já teve alguma destas condições?",
        optionLabels = mapOf(
            "diabetes" to "Diabetes",
            "hipertension" to "Pressão alta (Hipertensão)",
            "asma" to "Asma ou DPOC",
            "epilepsia" to "Epilepsia / Convulsões",
            "cancer" to "Câncer ou doenças oncológicas",
            "hepatitis" to "Hepatite B ou C",
            "vih" to "HIV",
            "tiroides" to "Problemas na tireoide",
            "ninguna" to "Nenhuma",
        ),
    ),
    "enfermedades_previas:enfermedades_detalle" to FieldTranslationPt(
        label = "Esclarecimentos ou tratamentos específicos",
        hint = "Detalhe adicional caso tenha alguma condição diagnosticada",
    ),
    "medicamentos:toma_medicamentos" to FieldTranslationPt(
        label = "Você usa algum medicamento atualmente?",
    ),
    "medicamentos:lista_medicamentos" to FieldTranslationPt(
        label = "Liste seus medicamentos (nome, dose, indicação)",
        hint = "Ex.:\n- Enalapril 10mg, 1 ao dia\n- Metformina 850mg no almoço",
    ),
    "alergias:tiene_alergias" to FieldTranslationPt(
        label = "Você tem alguma alergia conhecida?",
    ),
    "alergias:lista_alergias" to FieldTranslationPt(
        label = "Liste suas alergias e qual reação teve",
        hint = "Ex.:\n- Penicilina: manchas e inchaço\n- Frutos do mar: falta de ar",
    ),
    "alergias:medication_allergies" to FieldTranslationPt(
        label = "Alergias a Medicamentos (Opcional)",
        hint = "Ex.: Penicilina, Ibuprofeno",
    ),
    "antecedentes_familiares:padre_vivo" to FieldTranslationPt(
        label = "Seu pai está vivo?",
    ),
    "antecedentes_familiares:padre_enfermedades" to FieldTranslationPt(
        label = "Doenças ou histórico do pai",
        optionLabels = mapOf(
            "diabetes" to "Diabetes",
            "hipertension" to "Pressão alta",
            "infarto" to "Infarto ou cardiopatia",
            "cancer" to "Câncer",
            "colesterol_alto" to "Colesterol alto",
            "ninguna" to "Nenhuma conhecida",
        ),
    ),
    "antecedentes_familiares:madre_viva" to FieldTranslationPt(
        label = "Sua mãe está viva?",
    ),
    "antecedentes_familiares:madre_enfermedades" to FieldTranslationPt(
        label = "Doenças ou histórico da mãe",
        optionLabels = mapOf(
            "diabetes" to "Diabetes",
            "hipertension" to "Pressão alta",
            "cancer_mama" to "Câncer de mama",
            "osteoporosis" to "Osteoporose",
            "tiroides" to "Problemas na tireoide",
            "ninguna" to "Nenhuma conhecida",
        ),
    ),
    "antecedentes_familiares:hermanos_enfermedades" to FieldTranslationPt(
        label = "Histórico em irmãos",
        optionLabels = mapOf(
            "diabetes" to "Diabetes",
            "cancer_joven" to "Câncer em idade precoce",
            "enfermedad_mental" to "Saúde mental",
            "no_hermanos" to "Não tenho irmãos",
            "ninguna" to "Nenhuma conhecida",
        ),
    ),
    "habitos:fuma" to FieldTranslationPt(
        label = "Você fuma ou já fumou?",
        optionLabels = mapOf(
            "nunca" to "Nunca fumei",
            "exfumador" to "Fumei antes, já parei",
            "actual" to "Sim, fumo atualmente",
        ),
    ),
    "habitos:cigarrillos_dia" to FieldTranslationPt(
        label = "Quantos cigarros por dia?",
        hint = "Ex.: 10",
    ),
    "habitos:alcohol" to FieldTranslationPt(
        label = "Você consome álcool?",
        optionLabels = mapOf(
            "nunca" to "Não consumo",
            "ocasional" to "1 ou 2 vezes por mês",
            "moderado" to "1 ou 2 vezes por semana",
            "frecuente" to "3 a 6 vezes por semana",
            "diario" to "Todos os dias",
        ),
    ),
    "habitos:ejercicio" to FieldTranslationPt(
        label = "Você pratica atividade física?",
        optionLabels = mapOf(
            "sedentario" to "Não, estilo sedentário",
            "ligero" to "Pouco (1 ou 2 vezes/semana)",
            "moderado" to "Regular (3 ou 4 vezes/semana)",
            "intenso" to "Intenso (5 ou mais vezes/semana)",
        ),
    ),
    "habitos:horas_sueno" to FieldTranslationPt(
        label = "Quantas horas dorme por noite em média?",
        scaleMinLabel = "1 h",
        scaleMaxLabel = "12 h",
    ),
    "habitos:dieta" to FieldTranslationPt(
        label = "Como considera sua alimentação?",
        optionLabels = mapOf(
            "muy_mala" to "Rápida ou ultraprocessada",
            "regular" to "Variada, sem controle rigoroso",
            "buena" to "Majoritariamente caseira e equilibrada",
            "excelente" to "Plano nutricional orientado e saudável",
        ),
    ),
    "cardiovascular:dolor_pecho" to FieldTranslationPt(
        label = "Você teve dor ou desconforto no peito?",
    ),
    "cardiovascular:dolor_pecho_detalle" to FieldTranslationPt(
        label = "Descreva a dor no peito",
        hint = "Localização, se é em aperto, quando ocorre...",
    ),
    "cardiovascular:falta_aire" to FieldTranslationPt(
        label = "Você sente falta de ar ou sufocamento?",
    ),
    "cardiovascular:palpitaciones" to FieldTranslationPt(
        label = "Você sente palpitações ou batimentos irregulares?",
    ),
    "cardiovascular:hinchazon_piernas" to FieldTranslationPt(
        label = "Seus pés ou pernas incham?",
    ),
    "cardiovascular:sintomas_cardiovasculares" to FieldTranslationPt(
        label = "Você apresenta algum destes sintomas?",
        optionLabels = mapOf(
            "mareos" to "Tontura ou desmaio",
            "sudoracion" to "Suor frio repentino",
            "fatiga_extrema" to "Cansaço extremo ao caminhar",
            "tos_nocturna" to "Tosse ao deitar",
            "ninguno" to "Nenhum",
        ),
    ),
    "respiratorio:tos" to FieldTranslationPt(
        label = "Você tem tosse persistente (mais de 3 semanas)?",
    ),
    "respiratorio:tos_detalle" to FieldTranslationPt(
        label = "Descreva as características da tosse",
        hint = "Seca, com catarro, noturna, com dor...",
    ),
    "respiratorio:falta_aire_respiratorio" to FieldTranslationPt(
        label = "Você sente falta de ar ao fazer esforços do dia a dia?",
    ),
    "respiratorio:silbido_pecho" to FieldTranslationPt(
        label = "Você ouve chiado ao respirar?",
    ),
    "respiratorio:sintomas_respiratorios" to FieldTranslationPt(
        label = "Você apresenta algum destes sintomas?",
        optionLabels = mapOf(
            "sangre_tos" to "Catarro com sangue",
            "dolor_respirar" to "Dor ao respirar fundo",
            "ronquidos" to "Ronco forte ou pausas na respiração",
            "flema_color" to "Catarro amarelado ou esverdeado",
            "ninguno" to "Nenhum",
        ),
    ),
    "digestivo:acidez" to FieldTranslationPt(
        label = "Você tem azia ou refluxo frequente?",
    ),
    "digestivo:dolor_abdominal" to FieldTranslationPt(
        label = "Você tem dor abdominal ou na barriga persistente?",
    ),
    "digestivo:cambio_habito_intestinal" to FieldTranslationPt(
        label = "Seu ritmo intestinal mudou?",
        optionLabels = mapOf(
            "no" to "Não, ritmo normal",
            "diarrea" to "Diarreia frequente",
            "estrenimiento" to "Prisão de ventre ou constipação",
            "alternante" to "Alternância entre diarreia e constipação",
        ),
    ),
    "digestivo:sintomas_digestivos" to FieldTranslationPt(
        label = "Você apresenta algum destes sinais de alerta?",
        optionLabels = mapOf(
            "sangre_heces" to "Sangue visível nas fezes",
            "heces_negras" to "Fezes escuras ou enegrecidas",
            "perdida_peso" to "Perda de peso sem causa aparente",
            "dificultad_tragar" to "Dificuldade ou dor ao engolir",
            "nausea_vomito" to "Náuseas ou vômitos frequentes",
            "hinchazon" to "Distensão ou estufamento intenso",
            "ninguno" to "Nenhum",
        ),
    ),
    "genitourinario:dolor_orinar" to FieldTranslationPt(
        label = "Você sente dor ou ardência ao urinar?",
    ),
    "genitourinario:frecuencia_urinaria" to FieldTranslationPt(
        label = "Você notou alterações na frequência urinária?",
        optionLabels = mapOf(
            "normal" to "Não, normal",
            "frecuente_dia" to "Urino com muita frequência durante o dia",
            "frecuente_noche" to "Acordo várias vezes à noite para urinar",
            "urgencia" to "Urgência urinária (dificuldade para segurar)",
        ),
    ),
    "genitourinario:sintomas_genitourinarios" to FieldTranslationPt(
        label = "Você apresenta algum destes sintomas?",
        optionLabels = mapOf(
            "sangre_orina" to "Sangue na urina",
            "chorro_debil" to "Jato urinário fraco ou interrompido",
            "incontinencia" to "Perda involuntária de urina",
            "dolor_lumbar" to "Dor aguda na lombar ou região renal",
            "ninguno" to "Nenhum",
        ),
    ),
    "resumen_final:confirma_informacion" to FieldTranslationPt(
        label = "Você confirma que as informações fornecidas são verdadeiras e completas?",
    ),
    "resumen_final:comentarios_adicionales" to FieldTranslationPt(
        label = "Mais alguma observação que queira informar ao médico?",
        hint = "Ex.: Preferências pessoais, receios, dúvidas antes da consulta...",
    ),
    "personal_info:blood_type" to FieldTranslationPt(
        label = "Tipo Sanguíneo",
        hint = "Ex.: A+, O-, AB+",
    ),
    "personal_info:emergency_contact_name" to FieldTranslationPt(
        label = "Contato de Emergência",
        hint = "Nome completo",
    ),
    "personal_info:emergency_contact_phone" to FieldTranslationPt(
        label = "Telefone de Emergência",
        hint = "+55 11 91234-5678",
    ),
    "personal_info:occupation" to FieldTranslationPt(
        label = "Ocupação",
        hint = "Ex.: Engenheiro, Professor",
    ),
    "current_medications:medications" to FieldTranslationPt(
        label = "Medicamentos Atuais",
        hint = "Nome, dose, frequência",
    ),
    "current_medications:supplements" to FieldTranslationPt(
        label = "Suplementos e Vitaminas",
        hint = "Ex.: Vitamina D, Ômega 3",
    ),
    "current_medications:natural_remedies" to FieldTranslationPt(
        label = "Fitoterápicos e Naturais",
        hint = "Ex.: Valeriana, Melatonina",
    ),
    "medical_conditions:chronic_conditions" to FieldTranslationPt(
        label = "Doenças Crônicas",
        hint = "Ex.: Diabetes, Hipertensão",
    ),
    "medical_conditions:past_conditions" to FieldTranslationPt(
        label = "Doenças Anteriores Relevantes",
        hint = "Ex.: Hepatite, Dengue",
    ),
    "medical_conditions:mental_health" to FieldTranslationPt(
        label = "Saúde Mental",
        hint = "Ex.: Ansiedade, Depressão (tratada/atual)",
    ),
    "medical_conditions:disabilities" to FieldTranslationPt(
        label = "Deficiências",
        hint = "Se aplicável",
    ),
    "surgical_history:surgeries" to FieldTranslationPt(
        label = "Cirurgias Anteriores",
        hint = "Tipo, data aproximada, hospital",
    ),
    "surgical_history:hospitalizations" to FieldTranslationPt(
        label = "Internações",
        hint = "Motivo, duração, data",
    ),
    "surgical_history:anesthesia_reactions" to FieldTranslationPt(
        label = "Reações à Anestesia",
        hint = "Caso tenha tido alguma reação",
    ),
    "family_history:cardiovascular" to FieldTranslationPt(
        label = "Doenças Cardiovasculares",
        hint = "Familiar e parentesco",
    ),
    "family_history:cancer" to FieldTranslationPt(
        label = "Câncer",
        hint = "Tipo, familiar e parentesco",
    ),
    "family_history:diabetes_family" to FieldTranslationPt(
        label = "Diabetes",
        hint = "Familiar e parentesco",
    ),
    "family_history:other_hereditary" to FieldTranslationPt(
        label = "Outras Doenças Hereditárias",
        hint = "Detalhes",
    ),
    "lifestyle:smoking" to FieldTranslationPt(
        label = "Tabagismo",
        hint = "Não fumante / Ex-fumante / Atual (quantidade)",
    ),
    "lifestyle:alcohol" to FieldTranslationPt(
        label = "Álcool",
        hint = "Não consome / Ocasional / Regular",
    ),
    "lifestyle:exercise" to FieldTranslationPt(
        label = "Atividade Física",
        hint = "Tipo, frequência semanal",
    ),
    "lifestyle:diet" to FieldTranslationPt(
        label = "Alimentação",
        hint = "Tipo de dieta, restrições",
    ),
    "lifestyle:sleep" to FieldTranslationPt(
        label = "Padrão de Sono",
        hint = "Horas médias, qualidade",
    ),
)

internal fun AnamnesisFieldDefinition.localized(
    section: String,
    isPortuguese: Boolean,
): AnamnesisFieldDefinition {
    if (!isPortuguese) return this
    val pt = anamnesisFieldTranslationsPt["$section:$key"] ?: return this
    return copy(
        label = pt.label,
        hint = pt.hint ?: hint,
        scaleMinLabel = pt.scaleMinLabel ?: scaleMinLabel,
        scaleMaxLabel = pt.scaleMaxLabel ?: scaleMaxLabel,
        options = if (options.isEmpty()) {
            options
        } else {
            options.map { option ->
                val translatedLabel = pt.optionLabels[option.value]
                if (translatedLabel != null) option.copy(label = translatedLabel) else option
            }
        },
    )
}
