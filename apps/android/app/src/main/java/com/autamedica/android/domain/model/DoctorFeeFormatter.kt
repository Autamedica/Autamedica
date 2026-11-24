package com.autamedica.android.domain.model

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale
import kotlin.math.roundToLong

object DoctorFeeFormatter {

    private val groupingSymbols = DecimalFormatSymbols(Locale("es", "AR"))

    fun resolveCurrencyCode(licenseNumber: String?): String =
        if (!licenseNumber.isNullOrBlank() && licenseNumber.contains("CRM", ignoreCase = true)) {
            "BRL"
        } else {
            "ARS"
        }

    fun format(fee: Double, licenseNumber: String?): String {
        val formatter = DecimalFormat("#,##0", groupingSymbols)
        val formattedNumber = formatter.format(fee.roundToLong())
        return if (resolveCurrencyCode(licenseNumber) == "BRL") {
            "R$ $formattedNumber"
        } else {
            "$ $formattedNumber"
        }
    }
}
