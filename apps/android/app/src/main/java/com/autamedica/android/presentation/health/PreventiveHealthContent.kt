package com.autamedica.android.presentation.health

enum class PreventiveGender(
    val key: String,
    val label: String,
) {
    Male("male", "Masculino"),
    Female("female", "Femenino");

    companion object {
        fun fromKey(key: String?): PreventiveGender? = entries.firstOrNull { it.key == key }
    }
}

fun normalizePreventiveGender(raw: String?): PreventiveGender? {
    val normalized = raw?.trim()?.lowercase() ?: return null
    return when (normalized) {
        "female", "f", "mujer", "femenino" -> PreventiveGender.Female
        "male", "m", "hombre", "masculino" -> PreventiveGender.Male
        else -> null
    }
}

enum class PreventiveCategory(val label: String) {
    Cardiovascular("Cardiovascular"),
    Cancer("Deteccion de Cancer"),
    Metabolic("Metabolico"),
    Bone("Salud Osea"),
    Preventive("Preventivo General"),
    Other("Otros"),
}

enum class PreventiveCoverage(val label: String) {
    Total("100%"),
    Partial("Parcial"),
    Variable("Variable"),
}

enum class PreventiveUrgency {
    High,
    Medium,
    Low,
}

data class PreventiveScreening(
    val id: String,
    val name: String,
    val shortName: String,
    val description: String,
    val gender: PreventiveGender?,
    val startAge: Int,
    val endAge: Int?,
    val frequency: String,
    val category: PreventiveCategory,
    val benefits: List<String>,
    val specialCase: String? = null,
    val coverage: PreventiveCoverage,
    val urgency: PreventiveUrgency,
) {
    fun appliesTo(gender: PreventiveGender?): Boolean =
        this.gender == null || gender == null || this.gender == gender
}

data class PreventiveEducationItem(
    val title: String,
    val description: String,
)

private val screeningDatabase = listOf(
    PreventiveScreening(
        id = "blood-pressure",
        name = "Control de Presion Arterial",
        shortName = "Presion Arterial",
        description = "Medicion de la presion arterial para detectar hipertension.",
        gender = null,
        startAge = 18,
        endAge = null,
        frequency = "Anual",
        category = PreventiveCategory.Cardiovascular,
        benefits = listOf(
            "Detecta hipertension antes de que cause danos.",
            "Ayuda a prevenir infartos y ACV.",
            "Es un control simple y rapido."
        ),
        specialCase = "Puede indicarse con mayor frecuencia si hay factores de riesgo.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.High,
    ),
    PreventiveScreening(
        id = "glucose-female",
        name = "Analisis de Glucemia en Ayunas",
        shortName = "Glucemia",
        description = "Medicion de azucar en sangre para detectar diabetes.",
        gender = PreventiveGender.Female,
        startAge = 45,
        endAge = null,
        frequency = "Cada 3 anos",
        category = PreventiveCategory.Metabolic,
        benefits = listOf(
            "Detecta diabetes temprano.",
            "Previene complicaciones graves.",
            "Permite control con dieta y medicacion."
        ),
        specialCase = "Puede adelantarse desde los 35 si hay sobrepeso u obesidad.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.Medium,
    ),
    PreventiveScreening(
        id = "glucose-male",
        name = "Analisis de Glucemia en Ayunas",
        shortName = "Glucemia",
        description = "Medicion de azucar en sangre para detectar diabetes.",
        gender = PreventiveGender.Male,
        startAge = 35,
        endAge = null,
        frequency = "Cada 3 anos",
        category = PreventiveCategory.Metabolic,
        benefits = listOf(
            "Detecta diabetes temprano.",
            "Previene complicaciones graves.",
            "Permite control con dieta y medicacion."
        ),
        specialCase = "Puede adelantarse desde los 25 si hay sobrepeso u obesidad.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.Medium,
    ),
    PreventiveScreening(
        id = "cholesterol-female",
        name = "Perfil Lipidico (Colesterol)",
        shortName = "Colesterol",
        description = "Analisis de colesterol y trigliceridos.",
        gender = PreventiveGender.Female,
        startAge = 45,
        endAge = null,
        frequency = "Cada 5 anos",
        category = PreventiveCategory.Metabolic,
        benefits = listOf(
            "Previene enfermedades cardiovasculares.",
            "Detecta riesgo de infartos.",
            "Permite tratamiento preventivo."
        ),
        specialCase = "Puede adelantarse desde los 35 si hay factores de riesgo.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.Medium,
    ),
    PreventiveScreening(
        id = "cholesterol-male",
        name = "Perfil Lipidico (Colesterol)",
        shortName = "Colesterol",
        description = "Analisis de colesterol y trigliceridos.",
        gender = PreventiveGender.Male,
        startAge = 35,
        endAge = null,
        frequency = "Cada 5 anos",
        category = PreventiveCategory.Metabolic,
        benefits = listOf(
            "Previene enfermedades cardiovasculares.",
            "Detecta riesgo de infartos.",
            "Permite tratamiento preventivo."
        ),
        specialCase = "Puede adelantarse desde los 25 si hay factores de riesgo.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.Medium,
    ),
    PreventiveScreening(
        id = "pap-test",
        name = "Papanicolaou (PAP)",
        shortName = "PAP",
        description = "Estudio para detectar cancer de cuello uterino.",
        gender = PreventiveGender.Female,
        startAge = 25,
        endAge = 64,
        frequency = "Cada 3 anos",
        category = PreventiveCategory.Cancer,
        benefits = listOf(
            "Detecta lesiones de cuello uterino de forma temprana.",
            "Mejora las chances de curacion si aparece enfermedad.",
            "Es un procedimiento rapido."
        ),
        specialCase = "Se suele indicar luego de dos PAP negativos consecutivos.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.High,
    ),
    PreventiveScreening(
        id = "hpv-test",
        name = "Test de VPH",
        shortName = "VPH",
        description = "Deteccion del Virus del Papiloma Humano.",
        gender = PreventiveGender.Female,
        startAge = 30,
        endAge = 64,
        frequency = "Cada 5 anos",
        category = PreventiveCategory.Cancer,
        benefits = listOf(
            "Detecta el virus antes de que genere lesiones.",
            "Puede complementar o reemplazar al PAP.",
            "Aporta mayor precision diagnostica."
        ),
        specialCase = "Su uso depende del criterio medico y del esquema de screening.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.High,
    ),
    PreventiveScreening(
        id = "mammography",
        name = "Mamografia",
        shortName = "Mamografia",
        description = "Radiografia de mamas para detectar cancer de mama.",
        gender = PreventiveGender.Female,
        startAge = 50,
        endAge = 69,
        frequency = "Cada 2 anos",
        category = PreventiveCategory.Cancer,
        benefits = listOf(
            "Detecta cancer de mama en etapas tempranas.",
            "Reduce la mortalidad en poblacion objetivo.",
            "Tiene cobertura del programa nacional."
        ),
        specialCase = "Puede indicarse antes si hay antecedentes o riesgo elevado.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.High,
    ),
    PreventiveScreening(
        id = "breast-ultrasound",
        name = "Ecografia Mamaria",
        shortName = "Eco Mamaria",
        description = "Complemento de la mamografia en mamas densas o antecedentes.",
        gender = PreventiveGender.Female,
        startAge = 40,
        endAge = null,
        frequency = "Segun criterio medico",
        category = PreventiveCategory.Cancer,
        benefits = listOf(
            "Complementa la mamografia.",
            "Es util en mamas densas.",
            "No usa radiacion."
        ),
        specialCase = "Suele indicarse como complemento y no como reemplazo.",
        coverage = PreventiveCoverage.Partial,
        urgency = PreventiveUrgency.Medium,
    ),
    PreventiveScreening(
        id = "colonoscopy",
        name = "Colonoscopia",
        shortName = "Colonoscopia",
        description = "Estudio del colon para detectar cancer colorrectal.",
        gender = null,
        startAge = 50,
        endAge = 75,
        frequency = "Cada 10 anos",
        category = PreventiveCategory.Cancer,
        benefits = listOf(
            "Detecta y previene cancer de colon.",
            "Permite extirpar polipos durante el estudio.",
            "Tiene alta efectividad diagnostica."
        ),
        specialCase = "Se indica antes si hay antecedentes familiares.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.High,
    ),
    PreventiveScreening(
        id = "fobt",
        name = "Test de Sangre Oculta en Materia Fecal",
        shortName = "Sangre Oculta",
        description = "Analisis de heces para detectar sangrado intestinal.",
        gender = null,
        startAge = 50,
        endAge = 75,
        frequency = "Anual",
        category = PreventiveCategory.Cancer,
        benefits = listOf(
            "Es una alternativa no invasiva.",
            "Detecta sangrado intestinal temprano.",
            "Tiene bajo costo y facil realizacion."
        ),
        specialCase = "Suele usarse cuando no se realiza colonoscopia.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.Medium,
    ),
    PreventiveScreening(
        id = "psa",
        name = "PSA (Antigeno Prostatico)",
        shortName = "PSA",
        description = "Analisis de sangre para detectar cancer de prostata.",
        gender = PreventiveGender.Male,
        startAge = 50,
        endAge = 75,
        frequency = "Anual",
        category = PreventiveCategory.Cancer,
        benefits = listOf(
            "Detecta cancer de prostata temprano.",
            "Mejora la tasa de curacion cuando se detecta a tiempo.",
            "Es un analisis simple."
        ),
        specialCase = "Puede adelantarse desde los 45 si hay antecedentes familiares.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.High,
    ),
    PreventiveScreening(
        id = "rectal-exam",
        name = "Tacto Rectal",
        shortName = "Tacto Rectal",
        description = "Examen fisico de la prostata.",
        gender = PreventiveGender.Male,
        startAge = 50,
        endAge = 75,
        frequency = "Anual",
        category = PreventiveCategory.Cancer,
        benefits = listOf(
            "Complementa el PSA.",
            "Detecta anomalias prostaticas.",
            "Aporta evaluacion directa de la glandula."
        ),
        specialCase = "Se indica en conjunto con PSA segun criterio profesional.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.High,
    ),
    PreventiveScreening(
        id = "bone-density-female",
        name = "Densitometria Osea",
        shortName = "Densitometria",
        description = "Medicion de densidad osea para detectar osteoporosis.",
        gender = PreventiveGender.Female,
        startAge = 65,
        endAge = null,
        frequency = "Cada 2 anos",
        category = PreventiveCategory.Bone,
        benefits = listOf(
            "Detecta osteoporosis temprano.",
            "Ayuda a prevenir fracturas.",
            "Permite tratamiento preventivo."
        ),
        specialCase = "Puede indicarse antes de los 65 si hay factores de riesgo.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.Medium,
    ),
    PreventiveScreening(
        id = "bone-density-male",
        name = "Densitometria Osea",
        shortName = "Densitometria",
        description = "Medicion de densidad osea para detectar osteoporosis.",
        gender = PreventiveGender.Male,
        startAge = 70,
        endAge = null,
        frequency = "Cada 2 anos",
        category = PreventiveCategory.Bone,
        benefits = listOf(
            "Detecta osteoporosis temprano.",
            "Ayuda a prevenir fracturas.",
            "Permite tratamiento preventivo."
        ),
        specialCase = "Puede indicarse antes si hubo fracturas o uso prolongado de corticoides.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.Low,
    ),
    PreventiveScreening(
        id = "lung-ct",
        name = "TAC de Torax de Baja Dosis",
        shortName = "TAC Torax",
        description = "Tomografia para detectar cancer de pulmon en fumadores.",
        gender = null,
        startAge = 55,
        endAge = 74,
        frequency = "Anual",
        category = PreventiveCategory.Cancer,
        benefits = listOf(
            "Detecta cancer de pulmon temprano.",
            "Reduce mortalidad en fumadores de alto riesgo.",
            "Usa baja dosis de radiacion."
        ),
        specialCase = "Se considera en personas con tabaquismo importante o exfumadores recientes.",
        coverage = PreventiveCoverage.Variable,
        urgency = PreventiveUrgency.High,
    ),
    PreventiveScreening(
        id = "eye-exam",
        name = "Examen Visual y Glaucoma",
        shortName = "Control Visual",
        description = "Control oftalmologico completo.",
        gender = null,
        startAge = 40,
        endAge = null,
        frequency = "Cada 2 a 4 anos",
        category = PreventiveCategory.Preventive,
        benefits = listOf(
            "Detecta glaucoma temprano.",
            "Ayuda a prevenir perdida visual.",
            "Corrige problemas de vision."
        ),
        specialCase = "Puede hacerse anual si hay antecedentes o diabetes.",
        coverage = PreventiveCoverage.Partial,
        urgency = PreventiveUrgency.Medium,
    ),
    PreventiveScreening(
        id = "dental-checkup",
        name = "Control Odontologico",
        shortName = "Odontologia",
        description = "Revision dental y limpieza.",
        gender = null,
        startAge = 6,
        endAge = null,
        frequency = "Cada 6 meses",
        category = PreventiveCategory.Preventive,
        benefits = listOf(
            "Previene caries y enfermedad periodontal.",
            "Detecta problemas tempranos.",
            "Contribuye a la salud general."
        ),
        specialCase = null,
        coverage = PreventiveCoverage.Partial,
        urgency = PreventiveUrgency.Medium,
    ),
    PreventiveScreening(
        id = "skin-exam",
        name = "Control Dermatologico",
        shortName = "Control de Piel",
        description = "Revision de lunares y manchas en la piel.",
        gender = null,
        startAge = 18,
        endAge = null,
        frequency = "Anual",
        category = PreventiveCategory.Cancer,
        benefits = listOf(
            "Detecta melanoma temprano.",
            "Ayuda a prevenir cancer de piel.",
            "Es un control simple y rapido."
        ),
        specialCase = "Puede ser mas frecuente en piel clara o con muchos lunares.",
        coverage = PreventiveCoverage.Partial,
        urgency = PreventiveUrgency.Medium,
    ),
    PreventiveScreening(
        id = "flu-vaccine",
        name = "Vacuna Antigripal",
        shortName = "Antigripal",
        description = "Vacuna anual contra la gripe.",
        gender = null,
        startAge = 65,
        endAge = null,
        frequency = "Anual",
        category = PreventiveCategory.Preventive,
        benefits = listOf(
            "Previene complicaciones graves de gripe.",
            "Reduce hospitalizaciones.",
            "Protege a grupos de riesgo."
        ),
        specialCase = "Tambien se indica en embarazadas y poblacion de riesgo.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.Medium,
    ),
    PreventiveScreening(
        id = "pneumococcal-vaccine",
        name = "Vacuna Antineumococica",
        shortName = "Antineumococica",
        description = "Vacuna contra neumonia bacteriana.",
        gender = null,
        startAge = 65,
        endAge = null,
        frequency = "Una vez",
        category = PreventiveCategory.Preventive,
        benefits = listOf(
            "Previene neumonia grave.",
            "Ofrece proteccion duradera.",
            "Es especialmente importante en mayores."
        ),
        specialCase = "El esquema puede variar segun indicacion medica.",
        coverage = PreventiveCoverage.Total,
        urgency = PreventiveUrgency.Medium,
    ),
)

val preventiveEducationItems = listOf(
    PreventiveEducationItem(
        title = "Vacunas al dia",
        description = "Revisa antigripal, antineumococica y otros esquemas segun edad y factores de riesgo."
    ),
    PreventiveEducationItem(
        title = "Screening por edad y genero",
        description = "Usa la calculadora para identificar chequeos como PAP, mamografia, colonoscopia o PSA."
    ),
    PreventiveEducationItem(
        title = "Factores de riesgo",
        description = "Antecedentes familiares, tabaquismo, obesidad o menopausia precoz pueden adelantar controles."
    ),
    PreventiveEducationItem(
        title = "Seguimiento continuo",
        description = "Agenda con tu medico los estudios sugeridos y sostenlos en el tiempo para detectar a tiempo."
    ),
)

fun getRecommendedPreventiveScreenings(
    age: Int,
    gender: PreventiveGender,
): List<PreventiveScreening> {
    val urgencyOrder = mapOf(
        PreventiveUrgency.High to 0,
        PreventiveUrgency.Medium to 1,
        PreventiveUrgency.Low to 2,
    )
    return screeningDatabase
        .asSequence()
        .filter { it.appliesTo(gender) }
        .filter { age >= it.startAge }
        .filter { it.endAge == null || age <= it.endAge }
        .sortedWith(
            compareBy<PreventiveScreening> { urgencyOrder[it.urgency] ?: 99 }
                .thenBy { it.category.ordinal }
                .thenBy { it.startAge }
        )
        .toList()
}

fun groupRecommendedScreeningsByCategory(
    screenings: List<PreventiveScreening>,
): List<Pair<PreventiveCategory, List<PreventiveScreening>>> =
    PreventiveCategory.entries
        .map { category -> category to screenings.filter { it.category == category } }
        .filter { (_, grouped) -> grouped.isNotEmpty() }

fun getPreventiveAgeMilestones(): List<Int> =
    screeningDatabase
        .flatMap { screening ->
            listOfNotNull(screening.startAge, screening.endAge)
        }
        .distinct()
        .sorted()

fun getScreeningsStartingAtAge(
    age: Int,
    gender: PreventiveGender?,
): List<PreventiveScreening> =
    screeningDatabase.filter { screening ->
        screening.startAge == age && screening.appliesTo(gender)
    }

fun getScreeningsEndingAtAge(
    age: Int,
    gender: PreventiveGender?,
): List<PreventiveScreening> =
    screeningDatabase.filter { screening ->
        screening.endAge == age && screening.appliesTo(gender)
    }

fun getNextPreventiveMilestone(
    currentAge: Int?,
    gender: PreventiveGender?,
): Int? {
    if (currentAge == null) return null
    return getPreventiveAgeMilestones().firstOrNull { age ->
        age > currentAge &&
            (
                getScreeningsStartingAtAge(age, gender).isNotEmpty() ||
                    getScreeningsEndingAtAge(age, gender).isNotEmpty()
                )
    }
}
