package com.autamedica.android.data.repository

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AuthoritativeUiRoleTest {
    @Test
    fun missingDatabaseRoleNeverGrantsDoctorPrivileges() {
        // Login role preference or forged user_metadata must not become authority.
        assertThat(authoritativeUiRole(null)).isEqualTo("patient")
        assertThat(authoritativeUiRole("")).isEqualTo("patient")
        assertThat(authoritativeUiRole("   ")).isEqualTo("patient")
    }

    @Test
    fun databaseRoleIsPreserved() {
        assertThat(authoritativeUiRole("doctor")).isEqualTo("doctor")
        assertThat(authoritativeUiRole("patient")).isEqualTo("patient")
        assertThat(authoritativeUiRole("  admin  ")).isEqualTo("admin")
    }
}
