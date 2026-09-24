package com.autamedica.android.presentation.videocall

/**
 * Estado del panel clínico en call del médico.
 *
 * GUIDANCE: reposo (DoctorClinicalGuidePanel compacto sobre el video, 0 taps).
 * RESUMEN / PREGUNTAS / NOTAS: detent con pestañas del MISMO sheet (no modal,
 * el video queda visible arriba). El sheet morfea desde el reposo y colapsa a él.
 */
enum class ClinicalSheetPanel {
    GUIDANCE,
    RESUMEN,
    PREGUNTAS,
    NOTAS,
}