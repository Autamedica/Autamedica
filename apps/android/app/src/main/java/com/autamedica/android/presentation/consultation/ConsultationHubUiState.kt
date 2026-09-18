package com.autamedica.android.presentation.consultation

import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentFollowup
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.model.FollowupCheckInEvolution
import com.autamedica.android.domain.model.MedicalOrder
import com.autamedica.android.domain.model.Prescription

/**
 * Estado inmutable de la pantalla ConsultationHub.
 * Diseñado bajo arquitectura MVI estricta: cero tipos genéricos, datos clínicos tipados.
 */
data class ConsultationHubUiState(
    // Sincronización y estados de carga
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val globalError: String? = null,
    val joinableAppointmentIds: Set<String> = emptySet(),
    val availableDoctors: List<DoctorBookingInfo> = emptyList(),

    // 1. Constantes Clínicas del Paciente (Nubank style: Alergias, Medicación, Ficha)
    val clinicalConstants: ClinicalConstantsUiModel = ClinicalConstantsUiModel(),

    // 2. Consola de Atención en Tiempo Real (Uber style: FSM)
    val consoleState: ConsultationConsoleState = ConsultationConsoleState.Idle,

    // 3. Farmacoterapia Activa (Prescripciones vigentes con CUIR)
    val activePrescriptions: List<Prescription> = emptyList(),

    // 4. Órdenes de Estudios Médicos y Laboratorio
    val pendingMedicalOrders: List<MedicalOrder> = emptyList(),

    // 5. Continuidad Asistencial (Protocolo 48h Post-Consulta)
    val pendingFollowupCheckIn: AppointmentFollowup? = null,
    val isSubmittingCheckIn: Boolean = false,

    // Estados transitorios de pago y acciones
    val payingAppointmentId: String? = null,
    val checkoutUrlToLaunch: String? = null,
    val toastMessage: String? = null,
    val selectedPrescriptionForQr: Prescription? = null,
)

/**
 * Constantes clínicas del paciente para seguridad asistencial y farmacológica inmediata.
 */
data class ClinicalConstantsUiModel(
    val allergies: List<String> = emptyList(),
    val hasNoKnownAllergies: Boolean = false,
    val allergiesDeclared: Boolean = false,
    val habitualMedications: List<String> = emptyList(),
    val anamnesisCompletionPercentage: Int = 0,
    val isAnamnesisComplete: Boolean = false,
)

/**
 * Máquina de estados finitos (FSM) que modela la consola central de despacho clínico (Estilo Uber).
 */
sealed interface ConsultationConsoleState {
    // 1. Videoconsulta lista para ingresar de inmediato
    data class ActiveVideoconsultation(
        val appointment: Appointment,
        val doctorName: String,
        val doctorSpecialty: String,
        val licenseNumber: String?,
        val isSisaValidated: Boolean,
        val chiefComplaint: String?,
        val isConnecting: Boolean = false,
    ) : ConsultationConsoleState

    // 2. Turno agendado pendiente de pago
    data class PendingPayment(
        val appointment: Appointment,
        val feeAmountArs: Double,
        val isProcessingPayment: Boolean = false,
    ) : ConsultationConsoleState

    // 3. Guardia Médica 24/7 y Triage con detector de Red Flags
    data class OnCallTriage(
        val availableDoctorsCount: Int,
        val enteredChiefComplaint: String = "",
        val selectedSymptomChips: Set<String> = emptySet(),
        val detectedRedFlags: List<RedFlagSign> = emptyList(),
        val isBypassingRedFlagWarning: Boolean = false,
        val isDispatchingGuard: Boolean = false,
    ) : ConsultationConsoleState {
        val hasCriticalRedFlag: Boolean
            get() = detectedRedFlags.isNotEmpty() && !isBypassingRedFlagWarning
    }

    // 4. Estado de reposo clínico / Sin consultas urgentes
    data object Idle : ConsultationConsoleState
}

/**
 * Signos de alarma detectados en tiempo real por el RedFlagDetector clínico.
 */
data class RedFlagSign(
    val title: String,
    val reason: String,
    val emergencyPhone: String = "107",
)

/**
 * Evaluador clínico reactivo de banderas rojas en tiempo real (0 ms de latencia, puramente local).
 */
object RedFlagDetector {

    private val CARDIOVASCULAR_PATTERNS = listOf(
        "dolor de pecho", "pecho", "opresion", "opresión", "infarto", "brazo izquierdo",
        "mandibula", "mandíbula", "dolor precordial", "angina"
    )

    private val RESPIRATORY_PATTERNS = listOf(
        "no puedo respirar", "falta de aire", "ahogo", "asfixia", "cianosis",
        "labios morados", "disnea severa"
    )

    private val NEUROLOGICAL_PATTERNS = listOf(
        "desmayo", "sincope", "síncope", "perdi el conocimiento", "perdí el conocimiento",
        "confusion", "confusión", "boca torcida", "paralisis", "parálisis", "no puedo hablar",
        "perdida de fuerza", "pérdida de fuerza", "acv"
    )

    private val HEMORRHAGIC_PATTERNS = listOf(
        "hemorragia", "sangre abundante", "vomito sangre", "vómito sangre",
        "tos con sangre", "sangrado digestivo"
    )

    private val ANAPHYLAXIS_PATTERNS = listOf(
        "se me cierra la garganta", "edema de glotis", "hinchazon de lengua",
        "hinchazón de lengua", "anafilaxia", "urticaria con ahogo"
    )

    fun evaluate(text: String, activeChips: Set<String>): List<RedFlagSign> {
        val combined = (text + " " + activeChips.joinToString(" ")).lowercase()
        val detected = mutableListOf<RedFlagSign>()

        if (CARDIOVASCULAR_PATTERNS.any { combined.contains(it) }) {
            detected.add(
                RedFlagSign(
                    title = "Dolor u opresión torácica",
                    reason = "Posible afección coronaria aguda. Requiere evaluación médica presencial inmediata."
                )
            )
        }

        if (RESPIRATORY_PATTERNS.any { combined.contains(it) }) {
            detected.add(
                RedFlagSign(
                    title = "Dificultad respiratoria aguda",
                    reason = "Riesgo de compromiso de vía aérea o insuficiencia ventilatoria."
                )
            )
        }

        if (NEUROLOGICAL_PATTERNS.any { combined.contains(it) }) {
            detected.add(
                RedFlagSign(
                    title = "Signo de déficit neurológico o síncope",
                    reason = "Pérdida de conocimiento o asimetría motora requieren guardia presencial con estudios urgentes."
                )
            )
        }

        if (HEMORRHAGIC_PATTERNS.any { combined.contains(it) }) {
            detected.add(
                RedFlagSign(
                    title = "Sangrado profuso o activo",
                    reason = "Riesgo de descompensación hemodinámica. Acuda inmediatamente a un centro de guardia."
                )
            )
        }

        if (ANAPHYLAXIS_PATTERNS.any { combined.contains(it) }) {
            detected.add(
                RedFlagSign(
                    title = "Sospecha de anafilaxia",
                    reason = "Compromiso de vía aérea por reacción alérgica grave. Requiere auxilio médico de emergencia."
                )
            )
        }

        return detected
    }
}

/**
 * Contrato de intenciones y acciones del usuario en la pantalla ConsultationHub.
 */
sealed interface ConsultationHubUiAction {
    data object Refresh : ConsultationHubUiAction
    data object ClearToast : ConsultationHubUiAction
    data object ClearCheckoutUrl : ConsultationHubUiAction

    // Videoconsulta Activa
    data class EnterActiveVideocall(val appointmentId: String) : ConsultationHubUiAction

    // Pagos
    data class PayPendingAppointment(val appointment: Appointment) : ConsultationHubUiAction

    // Guardia Médica 24/7 y Triage
    data class OnChiefComplaintChanged(val text: String) : ConsultationHubUiAction
    data class OnSymptomChipToggled(val symptom: String) : ConsultationHubUiAction
    data object BypassRedFlagWarning : ConsultationHubUiAction
    data class RequestEmergencyDispatch(val onReady: (appointmentId: String) -> Unit) : ConsultationHubUiAction

    // Prescripciones y QR
    data class SelectPrescriptionForQr(val prescription: Prescription?) : ConsultationHubUiAction

    // Continuidad Asistencial (48h)
    data class SubmitFollowupEvolution(
        val followupId: String,
        val evolution: FollowupCheckInEvolution,
        val notes: String? = null,
    ) : ConsultationHubUiAction
}
