package com.autamedica.android.util

import java.util.Locale

/**
 * Utilidad de regionalización para AutaMedica Android.
 * Permite identificar el contexto de país (Argentina vs. Brasil / Internacional)
 * a partir de countryCode explícito, prefijo de número telefónico o Locale del dispositivo.
 */
object CountryContext {

    /**
     * Determina si el contexto actual corresponde a Brasil.
     * Criterios:
     * 1. Código de país explícito "BR".
     * 2. Prefijo telefónico internacional brasileño (+55 o 55 con longitud de celular/fijo).
     * 3. Locale con país "BR" o idioma "pt".
     */
    fun isBrazil(
        countryCode: String? = null,
        phoneNumber: String? = null,
        locale: Locale = Locale.getDefault(),
    ): Boolean {
        if (countryCode?.equals("BR", ignoreCase = true) == true) return true
        if (countryCode?.equals("AR", ignoreCase = true) == true) return false

        val cleanPhone = phoneNumber?.trim()?.replace(" ", "")?.replace("-", "") ?: ""
        if (cleanPhone.startsWith("+55") || (cleanPhone.startsWith("55") && cleanPhone.length >= 12)) return true
        if (cleanPhone.startsWith("+54") || (cleanPhone.startsWith("54") && cleanPhone.length >= 11)) return false

        return locale.country.equals("BR", ignoreCase = true) || locale.language.equals("pt", ignoreCase = true)
    }

    /**
     * Determina si el contexto actual corresponde a Argentina.
     * Criterios:
     * 1. Código de país explícito "AR".
     * 2. Prefijo telefónico internacional argentino (+54).
     * 3. Locale con país "AR" o español cuando no es Brasil.
     */
    fun isArgentina(
        countryCode: String? = null,
        phoneNumber: String? = null,
        locale: Locale = Locale.getDefault(),
    ): Boolean {
        if (countryCode?.equals("AR", ignoreCase = true) == true) return true
        if (countryCode?.equals("BR", ignoreCase = true) == true) return false

        val cleanPhone = phoneNumber?.trim()?.replace(" ", "")?.replace("-", "") ?: ""
        if (cleanPhone.startsWith("+54") || (cleanPhone.startsWith("54") && cleanPhone.length >= 11)) return true
        if (cleanPhone.startsWith("+55") || (cleanPhone.startsWith("55") && cleanPhone.length >= 12)) return false

        if (locale.country.equals("AR", ignoreCase = true)) return true

        // Si es portugués o Brasil, definitivamente no es Argentina
        if (isBrazil(countryCode, phoneNumber, locale)) return false

        // Si es español por defecto en AutaMedica, se asume Argentina salvo especificación contraria
        return locale.language.equals("es", ignoreCase = true)
    }

    val BRAZIL_LOCALE: Locale = Locale("pt", "BR")
    val ARGENTINA_LOCALE: Locale = Locale("es", "AR")

    /**
     * Retorna el Locale adecuado según el contexto (Brasil vs Argentina / fallback).
     */
    fun getLocale(
        countryCode: String? = null,
        phoneNumber: String? = null,
        locale: Locale = Locale.getDefault(),
    ): Locale {
        return if (isBrazil(countryCode, phoneNumber, locale)) {
            BRAZIL_LOCALE
        } else {
            ARGENTINA_LOCALE
        }
    }

    /**
     * Formatea un valor monetario según el país (R$ en Brasil, $ en Argentina).
     */
    fun formatCurrency(
        amount: Double,
        maxFractionDigits: Int = 0,
        countryCode: String? = null,
        phoneNumber: String? = null,
        locale: Locale = Locale.getDefault(),
    ): String {
        val targetLocale = getLocale(countryCode, phoneNumber, locale)
        val format = java.text.NumberFormat.getCurrencyInstance(targetLocale).apply {
            maximumFractionDigits = maxFractionDigits
        }
        return format.format(amount)
    }

    /**
     * Formatea centavos a moneda según el contexto de país.
     */
    fun formatCurrencyFromCents(
        cents: Long,
        maxFractionDigits: Int = 0,
        countryCode: String? = null,
        phoneNumber: String? = null,
        locale: Locale = Locale.getDefault(),
    ): String {
        return formatCurrency(
            amount = cents / 100.0,
            maxFractionDigits = maxFractionDigits,
            countryCode = countryCode,
            phoneNumber = phoneNumber,
            locale = locale,
        )
    }
}

