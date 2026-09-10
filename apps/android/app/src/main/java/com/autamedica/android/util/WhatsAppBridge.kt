package com.autamedica.android.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.qualifiers.ApplicationContext
import java.net.URLEncoder
import javax.inject.Inject
import javax.inject.Singleton

/**
 * External bridge to WhatsApp & OpenClaw for AutaMedica clinical workflows.
 *
 * Facilitates patient conversational triage, 48h clinical followup, advisor support,
 * and audio pre-anamnesis directly via WhatsApp or browser fallback.
 */
@Singleton
class WhatsAppBridge @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /**
     * Configurable official phone number for AutaMedica clinic / OpenClaw gateway.
     * Can be customized or reconfigured at runtime.
     */
    var officialPhoneNumber: String = DEFAULT_AUTAMEDICA_PHONE

    /**
     * Factory function for creating ACTION_VIEW intents. Can be overridden in unit tests.
     */
    internal var intentFactory: (Uri, String?) -> Intent = { uri, targetPackage ->
        Intent(Intent.ACTION_VIEW, uri).apply {
            if (targetPackage != null) {
                setPackage(targetPackage)
            }
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    /**
     * URI parser function. Can be overridden in unit tests to avoid unmocked android.net.Uri stubs.
     */
    internal var uriParser: (String) -> Uri = { Uri.parse(it) }

    /**
     * Creates an Intent for viewing WhatsApp URI with optional package constraint and NEW_TASK flag.
     */
    fun createWhatsAppIntent(uri: Uri, targetPackage: String? = null): Intent {
        return intentFactory(uri, targetPackage)
    }

    /**
     * Opens a WhatsApp chat with the specified phone number and initial pre-filled message.
     *
     * Dispatches an [Intent.ACTION_VIEW] targeting package "com.whatsapp" with [Intent.FLAG_ACTIVITY_NEW_TASK].
     * If WhatsApp is not installed, gracefully falls back to the system web browser.
     *
     * @param phone The recipient phone number. Defaults to [officialPhoneNumber] if null or blank.
     * @param initialMessage Optional initial text to prefill in the chat input.
     * @return True if the intent was successfully dispatched (app or browser), false otherwise.
     */
    fun openWhatsAppChat(
        phone: String? = null,
        initialMessage: String? = null,
    ): Boolean {
        val targetPhone = phone?.takeIf { it.isNotBlank() } ?: officialPhoneNumber
        val uri = uriParser(buildWhatsAppUrl(targetPhone, initialMessage))

        // 1. Try launching native WhatsApp app
        try {
            val waIntent = intentFactory(uri, WHATSAPP_PACKAGE)
            context.startActivity(waIntent)
            SecureLog.info("[WhatsAppBridge] Launched native WhatsApp for phone: ${SecureLog.sanitize(targetPhone)}")
            return true
        } catch (e: ActivityNotFoundException) {
            SecureLog.warn("[WhatsAppBridge] WhatsApp package $WHATSAPP_PACKAGE not found, attempting browser fallback", e)
        } catch (e: Exception) {
            SecureLog.error("[WhatsAppBridge] Error launching native WhatsApp, attempting fallback", e)
        }

        // 2. Fallback to web browser or generic URI handler
        return try {
            val fallbackIntent = intentFactory(uri, null)
            context.startActivity(fallbackIntent)
            SecureLog.info("[WhatsAppBridge] Launched WhatsApp via browser fallback")
            true
        } catch (fallbackError: ActivityNotFoundException) {
            SecureLog.error("[WhatsAppBridge] No browser or activity found to handle WhatsApp URI", fallbackError)
            false
        } catch (fallbackError: Exception) {
            SecureLog.error("[WhatsAppBridge] Unexpected failure in WhatsApp browser fallback", fallbackError)
            false
        }
    }

    /**
     * Inicia el triaje conversacional de 7 preguntas de AutaMedica enviando el mensaje clave "SALUD".
     */
    fun launchTriageChat(phone: String? = null): Boolean {
        return openWhatsAppChat(phone = phone, initialMessage = TRIAGE_MESSAGE)
    }

    /**
     * Envía la respuesta al seguimiento clínico a 48 horas (Línea 4 AutaMedica).
     *
     * @param response "1" (Mejor), "2" (Igual) o "3" (Peor). Normaliza respuestas semánticas.
     */
    fun launchFollowupReply(response: String, phone: String? = null): Boolean {
        val normalizedReply = normalizeFollowupResponse(response)
        return openWhatsAppChat(phone = phone, initialMessage = normalizedReply)
    }

    /**
     * Abre WhatsApp con el mensaje "3" para contactar a un asesor o soporte médico humano.
     */
    fun launchDoctorSupport(phone: String? = null): Boolean {
        return openWhatsAppChat(phone = phone, initialMessage = DOCTOR_SUPPORT_MESSAGE)
    }

    /**
     * Abre WhatsApp con el mensaje "5" para iniciar la pre-anamnesis guiada por nota de voz.
     */
    fun launchAudioAnamnesis(phone: String? = null): Boolean {
        return openWhatsAppChat(phone = phone, initialMessage = AUDIO_ANAMNESIS_MESSAGE)
    }

    companion object {
        /**
         * Número oficial de atención / OpenClaw gateway de AutaMedica (+54 9 11 2233-4455).
         */
        const val DEFAULT_AUTAMEDICA_PHONE = "5491122334455"

        const val WHATSAPP_PACKAGE = "com.whatsapp"
        const val WHATSAPP_BUSINESS_PACKAGE = "com.whatsapp.w4b"

        const val TRIAGE_MESSAGE = "SALUD"
        const val DOCTOR_SUPPORT_MESSAGE = "3"
        const val AUDIO_ANAMNESIS_MESSAGE = "5"

        /**
         * Normaliza respuestas para el protocolo de seguimiento clínico 48h.
         */
        fun normalizeFollowupResponse(response: String): String {
            return when (response.trim().lowercase()) {
                "1", "better", "mejor", "melhor" -> "1"
                "2", "same", "stable", "igual" -> "2"
                "3", "worse", "peor", "pior" -> "3"
                else -> response.trim()
            }
        }

        /**
         * Genera la URL completa formateada para la API de WhatsApp.
         */
        fun buildWhatsAppUrl(phone: String?, initialMessage: String?): String {
            val cleanPhone = phone?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() }
            val queryParams = mutableListOf<String>()
            if (cleanPhone != null) {
                queryParams.add("phone=" + URLEncoder.encode(cleanPhone, "UTF-8"))
            }
            if (!initialMessage.isNullOrBlank()) {
                queryParams.add("text=" + URLEncoder.encode(initialMessage, "UTF-8"))
            }
            return if (queryParams.isEmpty()) {
                "https://api.whatsapp.com/send"
            } else {
                "https://api.whatsapp.com/send?" + queryParams.joinToString("&")
            }
        }

        /**
         * Construye la URI oficial de la API de WhatsApp para abrir chat con mensaje opcional.
         */
        fun buildWhatsAppUri(phone: String?, initialMessage: String?): Uri {
            return Uri.parse(buildWhatsAppUrl(phone, initialMessage))
        }
    }
}
