package com.autamedica.android.domain.model

data class User(
    val id: String,
    val email: String,
    val role: UserRole,
    val firstName: String = "",
    val lastName: String = "",
    val phone: String? = null,
    val avatarUrl: String? = null,
) {
    val displayName: String
        get() = listOf(firstName, lastName)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .ifBlank { email }
}
