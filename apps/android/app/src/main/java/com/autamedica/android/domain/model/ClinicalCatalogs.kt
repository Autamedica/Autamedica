package com.autamedica.android.domain.model

/**
 * Shared Clinical Catalogs for prescriptions, medical orders, and consultation records.
 */

data class Cie10Item(
    val code: String,
    val description: String,
)

/**
 * Standard CIE-10 diagnoses frequently encountered in outpatient consultations.
 */
val COMMON_CIE10_DIAGNOSES = listOf(
    Cie10Item("I10", "Hipertensión esencial (primaria)"),
    Cie10Item("J00", "Rinofaringitis aguda (resfriado común)"),
    Cie10Item("J02.9", "Faringitis aguda, no especificada"),
    Cie10Item("E11", "Diabetes mellitus tipo 2"),
    Cie10Item("G43", "Migraña"),
    Cie10Item("J06.9", "Infección aguda de vías respiratorias superiores"),
    Cie10Item("K21.9", "Enfermedad por reflujo gastroesofágico (ERGE)"),
    Cie10Item("K29.7", "Gastritis, no especificada"),
    Cie10Item("M54.5", "Lumbago no especificado"),
    Cie10Item("R51", "Cefalea"),
    Cie10Item("N39.0", "Infección de vías urinarias"),
    Cie10Item("E78.5", "Hiperlipidemia no especificada"),
    Cie10Item("J45.9", "Asma, no especificada"),
    Cie10Item("F41.1", "Trastorno de ansiedad generalizada"),
    Cie10Item("R05", "Tos"),
    Cie10Item("R50.9", "Fiebre, no especificada"),
    Cie10Item("A09", "Gastroenteritis y colitis infecciosa"),
    Cie10Item("L30.9", "Dermatitis, no especificada"),
    Cie10Item("T78.4", "Alergia, no especificada"),
    Cie10Item("M79.1", "Mialgia"),
    Cie10Item("J20.9", "Bronquitis aguda, no especificada"),
    Cie10Item("B34.9", "Infección viral, no especificada"),
)

/**
 * Common essential outpatient medications in Argentina / LATAM.
 */
val COMMON_MEDICATIONS = listOf(
    "Amoxicilina 500 mg",
    "Amoxicilina + Ácido Clavulánico 875/125 mg",
    "Ibuprofeno 400 mg",
    "Ibuprofeno 600 mg",
    "Paracetamol 500 mg",
    "Paracetamol 1 g",
    "Enalapril 10 mg",
    "Enalapril 20 mg",
    "Losartán 50 mg",
    "Losartán 100 mg",
    "Metformina 850 mg",
    "Metformina 1000 mg",
    "Omeprazol 20 mg",
    "Pantoprazol 40 mg",
    "Levotiroxina 50 mcg",
    "Levotiroxina 100 mcg",
    "Clonazepam 0.5 mg",
    "Clonazepam 2 mg",
    "Alprazolam 0.5 mg",
    "Salbutamol aerosol 100 mcg",
    "Loratadina 10 mg",
    "Cetirizina 10 mg",
    "Azitromicina 500 mg",
    "Ciprofloxacino 500 mg",
    "Atorvastatina 20 mg",
    "Rosuvastatina 10 mg",
    "Diclofenac 50 mg",
    "Diclofenac 75 mg",
    "Betametasona 0.6 mg",
    "Dexametasona 4 mg",
)

/**
 * Common dosage chips.
 */
val COMMON_DOSAGE_PRESETS = listOf(
    "500 mg",
    "1 g",
    "10 mg",
    "20 mg",
    "50 mg",
    "1 comprimido",
    "2 comprimidos",
    "1 cápsula",
    "5 ml",
    "10 ml",
    "2 disparos",
    "1 aplicación",
)

/**
 * Common frequency chips.
 */
val COMMON_FREQUENCY_PRESETS = listOf(
    "Cada 8 horas",
    "Cada 12 horas",
    "Cada 24 horas (en ayunas)",
    "Cada 24 horas (con la cena)",
    "Cada 6 horas",
    "Según necesidad / rescate",
    "Antes de dormir",
)

/**
 * Common duration chips.
 */
val COMMON_DURATION_PRESETS = listOf(
    "Por 5 días",
    "Por 7 días",
    "Por 10 días",
    "Por 14 días",
    "Por 30 días",
    "Tratamiento crónico / continuo",
    "Hasta finalizar envase",
)
