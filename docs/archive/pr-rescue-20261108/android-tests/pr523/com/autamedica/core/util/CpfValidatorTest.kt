package com.autamedica.core.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CpfValidatorTest {

    @Test
    fun `isValid returns true for valid unformatted CPFs`() {
        assertThat(CpfValidator.isValid("52998224725")).isTrue()
        assertThat(CpfValidator.isValid("12345678909")).isTrue()
        assertThat(CpfValidator.isValid("00000000191")).isTrue()
        assertThat(CpfValidator.isValid("11144477735")).isTrue()
    }

    @Test
    fun `isValid returns true for valid formatted CPFs`() {
        assertThat(CpfValidator.isValid("529.982.247-25")).isTrue()
        assertThat(CpfValidator.isValid("123.456.789-09")).isTrue()
        assertThat(CpfValidator.isValid("000.000.001-91")).isTrue()
        assertThat(CpfValidator.isValid("111.444.777-35")).isTrue()
    }

    @Test
    fun `isValid returns false for known repeated digit sequences`() {
        val repeatedSequences = listOf(
            "00000000000", "000.000.000-00",
            "11111111111", "111.111.111-11",
            "22222222222", "222.222.222-22",
            "33333333333", "333.333.333-33",
            "44444444444", "444.444.444-44",
            "55555555555", "555.555.555-55",
            "66666666666", "666.666.666-66",
            "77777777777", "777.777.777-77",
            "88888888888", "888.888.888-88",
            "99999999999", "999.999.999-99",
        )
        for (seq in repeatedSequences) {
            assertThat(CpfValidator.isValid(seq)).isFalse()
        }
    }

    @Test
    fun `isValid returns false for CPFs with invalid check digits`() {
        assertThat(CpfValidator.isValid("52998224726")).isFalse() // second check digit wrong
        assertThat(CpfValidator.isValid("52998224715")).isFalse() // first check digit wrong
        assertThat(CpfValidator.isValid("12345678900")).isFalse()
        assertThat(CpfValidator.isValid("529.982.247-99")).isFalse()
    }

    @Test
    fun `isValid returns false for invalid lengths and letters`() {
        assertThat(CpfValidator.isValid("")).isFalse()
        assertThat(CpfValidator.isValid("   ")).isFalse()
        assertThat(CpfValidator.isValid("123")).isFalse()
        assertThat(CpfValidator.isValid("1234567890")).isFalse() // 10 digits
        assertThat(CpfValidator.isValid("123456789012")).isFalse() // 12 digits
        assertThat(CpfValidator.isValid("abc.def.ghi-jk")).isFalse()
        assertThat(CpfValidator.isValid("529.982.24A-25")).isFalse()
        assertThat(CpfValidator.isValid(null)).isFalse()
    }

    @Test
    fun `clean removes all non-numeric characters`() {
        assertThat(CpfValidator.clean("529.982.247-25")).isEqualTo("52998224725")
        assertThat(CpfValidator.clean("529 982 247 25")).isEqualTo("52998224725")
        assertThat(CpfValidator.clean("abc123def456ghi78909")).isEqualTo("12345678909")
        assertThat(CpfValidator.clean("")).isEqualTo("")
        assertThat(CpfValidator.clean(null)).isEqualTo("")
    }

    @Test
    fun `format applies official mask to valid length CPFs`() {
        assertThat(CpfValidator.format("52998224725")).isEqualTo("529.982.247-25")
        assertThat(CpfValidator.format("529.982.247-25")).isEqualTo("529.982.247-25")
        assertThat(CpfValidator.format("12345678909")).isEqualTo("123.456.789-09")
    }

    @Test
    fun `format returns unmasked cleaned string when length is not 11`() {
        assertThat(CpfValidator.format("123")).isEqualTo("123")
        assertThat(CpfValidator.format("")).isEqualTo("")
        assertThat(CpfValidator.format(null)).isEqualTo("")
    }
}
