package com.autamedica.android.domain.model

const val ANAMNESIS_STATUS_DRAFT = "draft"
const val ANAMNESIS_STATUS_NOT_STARTED = "not_started"
const val ANAMNESIS_STATUS_IN_PROGRESS = "in_progress"
const val ANAMNESIS_STATUS_COMPLETED = "completed"
const val ANAMNESIS_STATUS_UNDER_REVIEW = "under_review"
const val ANAMNESIS_STATUS_APPROVED = "approved"

private val editableStatuses = setOf(
    ANAMNESIS_STATUS_DRAFT,
    ANAMNESIS_STATUS_NOT_STARTED,
    ANAMNESIS_STATUS_IN_PROGRESS,
)

private val readOnlyStatuses = setOf(
    ANAMNESIS_STATUS_COMPLETED,
    ANAMNESIS_STATUS_UNDER_REVIEW,
    ANAMNESIS_STATUS_APPROVED,
)

fun normalizeAnamnesisStatus(status: String?): String =
    status?.trim()?.lowercase().orEmpty()

fun isAnamnesisSummaryReadOnly(summary: AnamnesisSummary?): Boolean {
    if (summary == null) return false
    return summary.locked || normalizeAnamnesisStatus(summary.status) in readOnlyStatuses
}

fun anamnesisReadOnlyReason(summary: AnamnesisSummary?): String? {
    if (summary == null) return null

    return when (normalizeAnamnesisStatus(summary.status)) {
        ANAMNESIS_STATUS_APPROVED ->
            "La ficha médica ya fue aprobada por el equipo médico."
        ANAMNESIS_STATUS_UNDER_REVIEW ->
            "La anamnesis ya fue enviada y esta en revision. No se permiten cambios."
        ANAMNESIS_STATUS_COMPLETED ->
            "La ficha médica ya fue completada."
        else -> if (summary.locked) {
            "La ficha médica se encuentra cerrada para edición."
        } else {
            null
        }
    }
}

fun anamnesisDisplayStatus(summary: AnamnesisSummary?): String = when {
    summary == null -> "Sin datos"
    normalizeAnamnesisStatus(summary.status) == ANAMNESIS_STATUS_APPROVED -> "Aprobada"
    normalizeAnamnesisStatus(summary.status) == ANAMNESIS_STATUS_UNDER_REVIEW -> "En revision"
    normalizeAnamnesisStatus(summary.status) == ANAMNESIS_STATUS_COMPLETED -> "Completada"
    normalizeAnamnesisStatus(summary.status) == ANAMNESIS_STATUS_DRAFT -> "Borrador"
    normalizeAnamnesisStatus(summary.status) == ANAMNESIS_STATUS_NOT_STARTED -> "Sin iniciar"
    normalizeAnamnesisStatus(summary.status) == ANAMNESIS_STATUS_IN_PROGRESS -> "En progreso"
    summary.locked -> "Bloqueada"
    else -> "En progreso"
}

fun deriveEditableAnamnesisStatus(
    currentStatus: String?,
    completedSections: Int,
    totalSections: Int,
): String {
    if (totalSections > 0 && completedSections >= totalSections) {
        return ANAMNESIS_STATUS_COMPLETED
    }

    return when (normalizeAnamnesisStatus(currentStatus)) {
        ANAMNESIS_STATUS_DRAFT,
        ANAMNESIS_STATUS_NOT_STARTED ->
            if (completedSections > 0) ANAMNESIS_STATUS_IN_PROGRESS else normalizeAnamnesisStatus(currentStatus)
        in editableStatuses -> normalizeAnamnesisStatus(currentStatus)
        else -> if (completedSections > 0) ANAMNESIS_STATUS_IN_PROGRESS else ANAMNESIS_STATUS_DRAFT
    }
}
