package com.autamedica.core.util

import com.google.common.truth.Truth.assertWithMessage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Suite de pruebas adversariales independientes para [CpfValidator].
 * Audita rigurosamente los casos de borde, mutaciones de dígitos verificadores,
 * secuencias prohibidas de la Receita Federal y caracteres anómalos.
 */
class AdversarialCpfValidatorTest {

    private val validCpfs = listOf(
        "10433218100",
        "96001338914",
        "08386379499",
        "02654235114",
        "16155940789",
        "81618495950",
        "31034131656",
        "47525534144",
        "92832764851",
        "35030564160",
    )

    @Test
    fun `adversarial - all 10 formally generated CPFs pass validation`() {
        for (cpf in validCpfs) {
            assertTrue("Valid unformatted CPF $cpf", CpfValidator.isValid(cpf))

            val formatted = CpfValidator.format(cpf)
            assertTrue("Valid formatted CPF $formatted", CpfValidator.isValid(formatted))
        }
    }

    @Test
    fun `adversarial - all repeated digit sequences are strictly rejected`() {
        for (digit in 0..9) {
            val unformatted = "$digit".repeat(11)
            assertFalse("Repeated sequence $unformatted", CpfValidator.isValid(unformatted))

            val formatted = "${unformatted.substring(0, 3)}.${unformatted.substring(3, 6)}.${unformatted.substring(6, 9)}-${unformatted.substring(9, 11)}"
            assertFalse("Repeated sequence formatted $formatted", CpfValidator.isValid(formatted))
        }
    }

    @Test
    fun `adversarial - altering first check digit by any other digit is strictly rejected`() {
        for (cpf in validCpfs) {
            val originalDv1 = cpf[9].digitToInt()
            for (alteredDv1 in 0..9) {
                if (alteredDv1 == originalDv1) continue
                val mutated = cpf.substring(0, 9) + alteredDv1 + cpf[10]
                assertFalse("Mutated DV1 from $cpf -> $mutated", CpfValidator.isValid(mutated))
            }
        }
    }

    @Test
    fun `adversarial - altering second check digit by any other digit is strictly rejected`() {
        for (cpf in validCpfs) {
            val originalDv2 = cpf[10].digitToInt()
            for (alteredDv2 in 0..9) {
                if (alteredDv2 == originalDv2) continue
                val mutated = cpf.substring(0, 10) + alteredDv2
                assertFalse("Mutated DV2 from $cpf -> $mutated", CpfValidator.isValid(mutated))
            }
        }
    }

    @Test
    fun `adversarial - swapping DV1 and DV2 when distinct is strictly rejected`() {
        for (cpf in validCpfs) {
            if (cpf[9] != cpf[10]) {
                val swapped = cpf.substring(0, 9) + cpf[10] + cpf[9]
                assertFalse("Swapped DVs $swapped", CpfValidator.isValid(swapped))
            }
        }
    }

    @Test
    fun `adversarial - strings with letters, symbols, or invalid lengths are rejected`() {
        val anomalies = listOf(
            null,
            "",
            "   ",
            "1",
            "12",
            "1234567890", // 10 digits
            "123456789012", // 12 digits
            "104332181001", // 12 digits
            "1043321810", // 10 digits
            "104.332.181-0A",
            "104.332.18A-00",
            "A04.332.181-00",
            "!@#.###.###-##",
            "10433218100\n",
            " 10433218100 ",
            "SELECT * FROM users",
            "<script>alert(1)</script>",
        )

        for (anomaly in anomalies) {
            if (anomaly != null && CpfValidator.clean(anomaly) in validCpfs) {
                assertTrue("Expected valid for cleaned valid $anomaly", CpfValidator.isValid(anomaly))
            } else {
                assertFalse("Anomaly should be rejected: $anomaly", CpfValidator.isValid(anomaly))
            }
        }
    }

    @Test
    fun `adversarial - formatting maintains official Brazilian standard`() {
        val regex = Regex("^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$")
        for (cpf in validCpfs) {
            val formatted = CpfValidator.format(cpf)
            assertTrue("Formatted mask valid: $formatted", regex.matches(formatted))
            assertEquals(cpf, CpfValidator.clean(formatted))
            assertEquals(formatted, CpfValidator.format(formatted))
        }
    }
}
