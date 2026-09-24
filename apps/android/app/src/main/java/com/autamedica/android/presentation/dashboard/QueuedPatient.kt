package com.autamedica.android.presentation.dashboard

import com.autamedica.android.domain.model.PharmacyConsultationRequest

enum class TriageLevel {
    URGENCY,
    PRIORITY,
    CONTROL,
    STABLE,
}

data class QueuedPatient(
    val id: String,
    val name: String,
    val age: Int,
    val triage: TriageLevel,
    val triageScale: String,
    val reason: String,
    val vitals: String,
    val antecedents: String,
    val waitMinutes: Int,
    val intakeSummary: String,
)

fun formatCleanName(raw: String?): String = com.autamedica.android.domain.model.formatCleanName(raw)
fun formatCleanNameFromEmail(email: String?): String = com.autamedica.android.domain.model.formatCleanNameFromEmail(email)

fun cleanPatientName(name: String?): String {
    if (name.isNullOrBlank()) return ""
    return formatCleanName(name)
}

fun PharmacyConsultationRequest.toQueuedPatient(): QueuedPatient {
    val (triageLevel, triageScale) = inferTriageFromReason(reason)
    val extractedAge = extractPatientAge(patientName, reason)
    val cleanName = cleanPatientName(patientName).ifBlank { "Paciente DNI $patientDni" }
    val cleanPharmacy = if (pharmacyName.isBlank() || pharmacyName.contains("kiosco", ignoreCase = true)) {
        "Farmacia de Guardia"
    } else {
        pharmacyName
    }
    val cleanReason = reason.ifBlank { "Derivación para atención médica inmediata" }

    val vitalsText = "📍 $cleanPharmacy • Espera: ${minutesWaiting} min"
    val antecedentsText = "DNI: ${patientDni.ifBlank { "No informado" }} • Tel: ${patientPhone.ifBlank { "No informado" }}"
    val intakeText = "Derivación en tiempo real desde $cleanPharmacy para $cleanName. Motivo clínico: $cleanReason. Paciente a la espera de consulta médica."

    return QueuedPatient(
        id = id,
        name = cleanName,
        age = extractedAge,
        triage = triageLevel,
        triageScale = triageScale,
        reason = cleanReason,
        vitals = vitalsText,
        antecedents = antecedentsText,
        waitMinutes = minutesWaiting.toInt(),
        intakeSummary = intakeText,
    )
}

fun inferTriageFromReason(reason: String): Pair<TriageLevel, String> {
    val lower = reason.lowercase()
    return when {
        lower.contains("torácic") || lower.contains("pecho") || lower.contains("opresiv") ||
        lower.contains("infarto") || lower.contains("disnea") || lower.contains("asfix") ||
        lower.contains("acv") || lower.contains("convulsi") || lower.contains("inconscien") ||
        lower.contains("desmayo") || lower.contains("paro") || lower.contains("emergencia") -> {
            TriageLevel.URGENCY to "Manchester II · Emergencia"
        }
        lower.contains("cefalea") || lower.contains("hipertens") || lower.contains("presión") ||
        lower.contains("crisis") || lower.contains("fiebre") || lower.contains("cólico") ||
        lower.contains("abdom") || lower.contains("trauma") || lower.contains("fractura") ||
        lower.contains("urgencia") || lower.contains("hemorrag") || lower.contains("sangrad") -> {
            TriageLevel.PRIORITY to "Manchester III · Urgencia"
        }
        lower.contains("control") || lower.contains("receta") || lower.contains("renova") ||
        lower.contains("suplement") || lower.contains("rutina") || lower.contains("estudio") ||
        lower.contains("laboratorio") || lower.contains("anticoncept") -> {
            TriageLevel.CONTROL to "Manchester IV · Prioritario"
        }
        else -> {
            TriageLevel.PRIORITY to "Manchester III · Guardia Activa"
        }
    }
}

private fun extractPatientAge(vararg sources: String?): Int {
    val regex = Regex("""\b(\d{1,2})\s*(?:años|a\b|\)|$)""")
    for (source in sources) {
        if (source.isNullOrBlank()) continue
        val match = regex.find(source)
        if (match != null) {
            val num = match.groupValues[1].toIntOrNull()
            if (num != null && num in 1..110) return num
        }
    }
    return 0
}
