package com.autamedica.android.domain.model

enum class RenewalStatus {
    ACTIVE,
    EXPIRING_SOON,
    EXPIRED,
    CANCELLED,
}

enum class VitalAlertSeverity {
    WARNING,
    CRITICAL,
}

data class VitalSignAlert(
    val code: String,
    val severity: VitalAlertSeverity,
    val labelEs: String,
    val labelPt: String,
)

data class VitalSignEntry(
    val id: String,
    val patientId: String,
    val bloodPressureSystolic: Int? = null,
    val bloodPressureDiastolic: Int? = null,
    val heartRate: Int? = null,
    val temperature: Double? = null,
    val oxygenSaturation: Int? = null,
    val respiratoryRate: Int? = null,
    val weight: Double? = null,
    val height: Int? = null,
    val bmi: Double? = null,
    val painScale: Int? = null,
    val notes: String? = null,
    val measuredAt: String = "",
)

data class CreateVitalSignRequest(
    val patientId: String,
    val bloodPressureSystolic: Int? = null,
    val bloodPressureDiastolic: Int? = null,
    val heartRate: Int? = null,
    val temperature: Double? = null,
    val oxygenSaturation: Int? = null,
    val weight: Double? = null,
    val height: Int? = null,
    val painScale: Int? = null,
    val notes: String? = null,
)

data class ClinicalNoteEntry(
    val id: String,
    val title: String,
    val type: String,
    val kind: String = "evolution",
    val summary: String = "",
    val diagnosis: String? = null,
    val dateRecorded: String = "",
)

data class CreateClinicalNoteRequest(
    val patientId: String,
    val title: String,
    val kind: String = "evolution",
    val summary: String,
    val diagnosis: String? = null,
)

data class PatientFollowupEntry(
    val id: String,
    val patientId: String,
    val channel: String,
    val message: String,
    val scheduledFor: String,
    val status: String,
)

data class CreateFollowupRequest(
    val patientId: String,
    val scheduledFor: String,
    val objective: String,
    val channel: String = "whatsapp",
)

data class PatientPrescriptionRenewalItem(
    val id: String,
    val cuir: String? = null,
    val status: String,
    val createdAt: String,
    val validUntil: String? = null,
    val daysRemaining: Int? = null,
    val renewalStatus: RenewalStatus,
    val canRenew: Boolean,
    val medicationName: String,
    val dosage: String = "",
    val diagnosis: String = "",
    val notes: String = "",
)

data class ExternalPatientRecord(
    val patientId: String,
    val fullName: String,
    val dni: String? = null,
    val birthDate: String? = null,
    val gender: String? = null,
    val contact: String? = null,
)

data class RegisterExternalPatientRequest(
    val fullName: String,
    val documentNumber: String,
    val gender: String,
    val birthDate: String? = null,
    val contact: String? = null,
)

object ClinicalWorkspaceLogic {

    fun computeVitalAlerts(vital: VitalSignEntry): List<VitalSignAlert> {
        val alerts = mutableListOf<VitalSignAlert>()
        val sys = vital.bloodPressureSystolic
        val dia = vital.bloodPressureDiastolic
        if (sys != null && dia != null) {
            when {
                sys >= 180 || dia >= 120 -> alerts += VitalSignAlert(
                    code = "bp_crisis",
                    severity = VitalAlertSeverity.CRITICAL,
                    labelEs = "Crisis hipertensiva ($sys/$dia mmHg)",
                    labelPt = "Crise hipertensiva ($sys/$dia mmHg)",
                )
                sys >= 140 || dia >= 90 -> alerts += VitalSignAlert(
                    code = "bp_elevated",
                    severity = VitalAlertSeverity.WARNING,
                    labelEs = "Presión elevada ($sys/$dia mmHg)",
                    labelPt = "Pressão elevada ($sys/$dia mmHg)",
                )
                sys < 90 || dia < 60 -> alerts += VitalSignAlert(
                    code = "bp_low",
                    severity = VitalAlertSeverity.WARNING,
                    labelEs = "Hipotensión ($sys/$dia mmHg)",
                    labelPt = "Hipotensão ($sys/$dia mmHg)",
                )
            }
        }
        vital.heartRate?.let { hr ->
            when {
                hr > 120 || hr < 45 -> alerts += VitalSignAlert(
                    code = "hr_critical",
                    severity = VitalAlertSeverity.CRITICAL,
                    labelEs = "FC crítica ($hr lpm)",
                    labelPt = "FC crítica ($hr bpm)",
                )
                hr > 100 || hr < 50 -> alerts += VitalSignAlert(
                    code = "hr_abnormal",
                    severity = VitalAlertSeverity.WARNING,
                    labelEs = "FC alterada ($hr lpm)",
                    labelPt = "FC alterada ($hr bpm)",
                )
            }
        }
        vital.oxygenSaturation?.let { spo2 ->
            when {
                spo2 < 90 -> alerts += VitalSignAlert(
                    code = "spo2_critical",
                    severity = VitalAlertSeverity.CRITICAL,
                    labelEs = "Hipoxemia severa (SpO2 $spo2%)",
                    labelPt = "Hipoxemia grave (SpO2 $spo2%)",
                )
                spo2 < 94 -> alerts += VitalSignAlert(
                    code = "spo2_low",
                    severity = VitalAlertSeverity.WARNING,
                    labelEs = "Saturación baja (SpO2 $spo2%)",
                    labelPt = "Saturação baixa (SpO2 $spo2%)",
                )
            }
        }
        vital.temperature?.let { temp ->
            when {
                temp >= 39.0 -> alerts += VitalSignAlert(
                    code = "temp_high_fever",
                    severity = VitalAlertSeverity.CRITICAL,
                    labelEs = "Fiebre alta ($temp °C)",
                    labelPt = "Febre alta ($temp °C)",
                )
                temp >= 37.8 || temp < 35.5 -> alerts += VitalSignAlert(
                    code = "temp_abnormal",
                    severity = VitalAlertSeverity.WARNING,
                    labelEs = "Temperatura alterada ($temp °C)",
                    labelPt = "Temperatura alterada ($temp °C)",
                )
            }
        }
        vital.painScale?.let { pain ->
            if (pain >= 7) {
                alerts += VitalSignAlert(
                    code = if (pain >= 8) "pain_severe" else "pain_high",
                    severity = if (pain >= 8) VitalAlertSeverity.CRITICAL else VitalAlertSeverity.WARNING,
                    labelEs = "Dolor intenso ($pain/10)",
                    labelPt = "Dor intensa ($pain/10)",
                )
            }
        }
        return alerts
    }

    fun computeRenewalStatus(status: String, daysRemaining: Int?): RenewalStatus {
        val normalized = status.trim().lowercase()
        return when {
            normalized == "cancelled" || normalized == "voided" -> RenewalStatus.CANCELLED
            normalized == "expired" || (daysRemaining != null && daysRemaining < 0) -> RenewalStatus.EXPIRED
            daysRemaining != null && daysRemaining <= 7 -> RenewalStatus.EXPIRING_SOON
            else -> RenewalStatus.ACTIVE
        }
    }

    fun localizeGender(raw: String?, isPortuguese: Boolean): String? {
        val clean = raw?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
        return when (clean) {
            "male", "m", "masculino" -> "Masculino"
            "female", "f", "femenino", "feminino" -> if (isPortuguese) "Feminino" else "Femenino"
            "other", "otro", "outro" -> if (isPortuguese) "Outro" else "Otro"
            "prefer_not_to_say" -> if (isPortuguese) "Prefere não informar" else "Prefiere no informar"
            else -> raw.trim().replaceFirstChar { it.uppercase() }
        }
    }

    fun localizeSpecialty(raw: String?, isPortuguese: Boolean): String {
        val clean = raw?.trim().orEmpty()
        if (clean.isEmpty()) return ""
        if (!isPortuguese) return clean
        return when (clean.lowercase()) {
            "medicina general", "clínica médica", "clinica medica", "general_medicine" -> "Clínica Geral"
            "pediatría", "pediatria" -> "Pediatria"
            "cardiología", "cardiologia" -> "Cardiologia"
            "dermatología", "dermatologia" -> "Dermatologia"
            "ginecología", "ginecologia" -> "Ginecologia"
            "psiquiatría", "psiquiatria" -> "Psiquiatria"
            else -> clean
        }
    }
}
