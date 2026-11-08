package com.autamedica.android.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.util.Locale

class CountryContextTest {

    @Test
    fun `explicit countryCode BR identifies Brazil`() {
        assertThat(CountryContext.isBrazil(countryCode = "BR")).isTrue()
        assertThat(CountryContext.isBrazil(countryCode = "br")).isTrue()
        assertThat(CountryContext.isArgentina(countryCode = "BR")).isFalse()
    }

    @Test
    fun `explicit countryCode AR identifies Argentina`() {
        assertThat(CountryContext.isArgentina(countryCode = "AR")).isTrue()
        assertThat(CountryContext.isArgentina(countryCode = "ar")).isTrue()
        assertThat(CountryContext.isBrazil(countryCode = "AR")).isFalse()
    }

    @Test
    fun `brazilian phone numbers identify Brazil`() {
        assertThat(CountryContext.isBrazil(phoneNumber = "+55 11 98765-4321")).isTrue()
        assertThat(CountryContext.isBrazil(phoneNumber = "+5555999999999")).isTrue()
        assertThat(CountryContext.isArgentina(phoneNumber = "+55 11 98765-4321")).isFalse()
    }

    @Test
    fun `argentine phone numbers identify Argentina`() {
        assertThat(CountryContext.isArgentina(phoneNumber = "+54 9 11 2345-6789")).isTrue()
        assertThat(CountryContext.isBrazil(phoneNumber = "+54 9 11 2345-6789")).isFalse()
    }

    @Test
    fun `locale pt or BR identifies Brazil`() {
        val ptBrLocale = Locale("pt", "BR")
        assertThat(CountryContext.isBrazil(locale = ptBrLocale)).isTrue()
        assertThat(CountryContext.isArgentina(locale = ptBrLocale)).isFalse()

        val ptLocale = Locale("pt")
        assertThat(CountryContext.isBrazil(locale = ptLocale)).isTrue()
        assertThat(CountryContext.isArgentina(locale = ptLocale)).isFalse()
    }

    @Test
    fun `locale es AR identifies Argentina`() {
        val esArLocale = Locale("es", "AR")
        assertThat(CountryContext.isArgentina(locale = esArLocale)).isTrue()
        assertThat(CountryContext.isBrazil(locale = esArLocale)).isFalse()
    }

    @Test
    fun `getLocale resolves correct locale by country and phone`() {
        assertThat(CountryContext.getLocale(countryCode = "BR")).isEqualTo(Locale("pt", "BR"))
        assertThat(CountryContext.getLocale(phoneNumber = "+55 55 9995-7301")).isEqualTo(Locale("pt", "BR"))
        assertThat(CountryContext.getLocale(countryCode = "AR")).isEqualTo(Locale("es", "AR"))
        assertThat(CountryContext.getLocale(phoneNumber = "+54 9 11 1234-5678")).isEqualTo(Locale("es", "AR"))
    }

    @Test
    fun `formatCurrency formats in R$ for Brazil and $ for Argentina`() {
        val brCurrency = CountryContext.formatCurrency(amount = 49.9, maxFractionDigits = 2, countryCode = "BR")
        assertThat(brCurrency).contains("R$")

        val arCurrency = CountryContext.formatCurrency(amount = 15000.0, maxFractionDigits = 0, countryCode = "AR")
        assertThat(arCurrency).contains("$")

        val brCents = CountryContext.formatCurrencyFromCents(cents = 4990, maxFractionDigits = 2, countryCode = "BR")
        assertThat(brCents).contains("R$")
    }
}
