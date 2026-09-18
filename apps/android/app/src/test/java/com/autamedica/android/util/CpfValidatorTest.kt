package com.autamedica.android.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CpfValidatorTest {

    @Test
    fun `android util CpfValidator alias delegates properly`() {
        assertThat(CpfValidator.isValid("52998224725")).isTrue()
        assertThat(CpfValidator.isValid("11111111111")).isFalse()
        assertThat(CpfValidator.format("52998224725")).isEqualTo("529.982.247-25")
        assertThat(CpfValidator.clean("529.982.247-25")).isEqualTo("52998224725")
    }
}
