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

fun anamnesisReadOnlyReason(summary: AnamnesisSummary?): String? =
    anamnesisReadOnlyReason(summary, isPortuguese = false)

fun anamnesisReadOnlyReason(summary: AnamnesisSummary?, isPortuguese: Boolean): String? {
    if (summary == null) return null

    return when (normalizeAnamnesisStatus(summary.status)) {
        ANAMNESIS_STATUS_APPROVED ->
            if (isPortuguese) {
                "A ficha médica já foi aprovada pela equipe médica."
            } else {
                "La ficha médica ya fue aprobada por el equipo médico."
            }
        ANAMNESIS_STATUS_UNDER_REVIEW ->
            if (isPortuguese) {
                "A anamnese já foi enviada e está em revisão. Não são permitidas alterações."
            } else {
                "La anamnesis ya fue enviada y esta en revision. No se permiten cambios."
            }
        ANAMNESIS_STATUS_COMPLETED ->
            if (isPortuguese) {
                "A ficha médica já foi concluída."
            } else {
                "La ficha médica ya fue completada."
            }
        else -> if (summary.locked) {
            if (isPortuguese) {
                "A ficha médica está fechada para edição."
            } else {
                "La ficha médica se encuentra cerrada para edición."
            }
        } else {
            null
        }
    }
}

fun anamnesisDisplayStatus(summary: AnamnesisSummary?): String =
    anamnesisDisplayStatus(summary, isPortuguese = false)

fun anamnesisDisplayStatus(summary: AnamnesisSummary?, isPortuguese: Boolean): String = when {
    summary == null -> if (isPortuguese) "Sem dados" else "Sin datos"
    normalizeAnamnesisStatus(summary.status) == ANAMNESIS_STATUS_APPROVED -> "Aprobada".let {
        if (isPortuguese) "Aprovada" else it
    }
    normalizeAnamnesisStatus(summary.status) == ANAMNESIS_STATUS_UNDER_REVIEW ->
        if (isPortuguese) "Em revisão" else "En revision"
    normalizeAnamnesisStatus(summary.status) == ANAMNESIS_STATUS_COMPLETED ->
        if (isPortuguese) "Concluída" else "Completada"
    normalizeAnamnesisStatus(summary.status) == ANAMNESIS_STATUS_DRAFT ->
        if (isPortuguese) "Rascunho" else "Borrador"
    normalizeAnamnesisStatus(summary.status) == ANAMNESIS_STATUS_NOT_STARTED ->
        if (isPortuguese) "Não iniciada" else "Sin iniciar"
    normalizeAnamnesisStatus(summary.status) == ANAMNESIS_STATUS_IN_PROGRESS ->
        if (isPortuguese) "Em andamento" else "En progreso"
    summary.locked -> if (isPortuguese) "Bloqueada" else "Bloqueada"
    else -> if (isPortuguese) "Em andamento" else "En progreso"
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
