package com.autamedica.android.data.repository

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AuthoritativeUiRoleTest {
    @Test
    fun missingDatabaseRoleNeverGrantsDoctorPrivileges() {
        // Login role preference or forged user_metadata must not become authority.
        for (role in listOf(null, "", "   ", "unknown")) {
            assertThat(runCatching { authoritativeUiRole(role) }.exceptionOrNull())
                .isInstanceOf(IllegalArgumentException::class.java)
        }
    }

    @Test
    fun databaseRoleIsPreserved() {
        assertThat(authoritativeUiRole("doctor")).isEqualTo("doctor")
        assertThat(authoritativeUiRole("patient")).isEqualTo("patient")
        assertThat(authoritativeUiRole("  admin  ")).isEqualTo("admin")
    }
}
