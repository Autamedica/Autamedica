package com.autamedica.android.domain.model

data class User(
    val id: String,
    val email: String,
    val role: UserRole,
    val firstName: String = "",
    val lastName: String = "",
    val avatarUrl: String? = null,
)
