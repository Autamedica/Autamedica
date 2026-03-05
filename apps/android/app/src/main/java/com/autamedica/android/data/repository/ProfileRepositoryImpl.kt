package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.ProfileRepository
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProfileRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
) : ProfileRepository {

    override suspend fun getProfile(): Result<User> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No user ID found")

        val dto = supabaseClient.postgrest
            .from("profiles")
            .select(Columns.ALL) {
                filter { eq("user_id", userId) }
            }
            .decodeSingle<ProfileDto>()

        dto.toDomain()
    }.onFailure {
        Timber.e(it, "[Profile] Failed fetching profile")
    }

    override suspend fun updateProfile(
        firstName: String,
        lastName: String,
        phone: String?,
    ): Result<User> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No user ID found")

        val dto = supabaseClient.postgrest
            .from("profiles")
            .update({
                set("first_name", firstName)
                set("last_name", lastName)
                if (phone != null) set("phone", phone)
            }) {
                filter { eq("user_id", userId) }
                select(Columns.ALL)
            }
            .decodeSingle<ProfileDto>()

        dto.toDomain()
    }.onFailure {
        Timber.e(it, "[Profile] Failed updating profile")
    }
}

@Serializable
private data class ProfileDto(
    @SerialName("user_id") val id: String,
    val email: String? = null,
    val role: String? = null,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val phone: String? = null,
) {
    fun toDomain() = User(
        id = id,
        email = email ?: "",
        role = parseRole(role),
        firstName = firstName ?: "",
        lastName = lastName ?: "",
        avatarUrl = avatarUrl,
    )

    private fun parseRole(raw: String?): UserRole = when (raw?.lowercase()) {
        "patient" -> UserRole.PATIENT
        "doctor" -> UserRole.DOCTOR
        "company" -> UserRole.COMPANY
        "company_admin" -> UserRole.COMPANY_ADMIN
        "organization_admin" -> UserRole.ORGANIZATION_ADMIN
        "admin" -> UserRole.ADMIN
        "platform_admin" -> UserRole.PLATFORM_ADMIN
        else -> UserRole.PATIENT
    }
}
