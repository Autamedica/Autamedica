package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.PatientProfileSnapshot
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.ProfileRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
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
        SecureLog.error("[Profile] Failed fetching profile", it)
    }

    override suspend fun getPatientProfileSnapshot(): Result<PatientProfileSnapshot?> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No user ID found")

        supabaseClient.postgrest
            .from("patients")
            .select(Columns.ALL) {
                filter { eq("user_id", userId) }
            }
            .decodeList<PatientProfileDto>()
            .firstOrNull()
            ?.toDomain()
    }.onFailure {
        SecureLog.error("[Profile] Failed fetching patient snapshot", it)
    }

    override suspend fun updatePatientAddress(address: String): Result<PatientProfileSnapshot?> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No user ID found")
        val sanitized = address.trim()
        require(sanitized.isNotEmpty() && sanitized.length <= 240) { "Invalid address" }
        val current = supabaseClient.postgrest.from("patients").select(Columns.ALL) {
            filter { eq("user_id", userId) }
        }.decodeSingle<PatientProfileDto>()
        require(current.careCountry == "AR" && current.renaperConfirmedAt != null) {
            "Patient identity must be confirmed in Argentina"
        }
        supabaseClient.postgrest.from("patients").update({
            set("address", sanitized)
        }) {
            filter { eq("user_id", userId) }
            select(Columns.ALL)
        }.decodeSingle<PatientProfileDto>().toDomain()
    }.onFailure {
        // Do not log full address values.
        SecureLog.error("[Profile] Patient address update failed", it)
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
                set("phone", phone)
            }) {
                filter { eq("user_id", userId) }
                select(Columns.ALL)
            }
            .decodeSingle<ProfileDto>()

        dto.toDomain()
    }.onFailure {
        SecureLog.error("[Profile] Failed updating profile", it)
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
        phone = phone,
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

@Serializable
private data class PatientProfileDto(
    val dni: String? = null,
    @SerialName("care_country") val careCountry: String? = null,
    @SerialName("birth_date") val birthDate: String? = null,
    val gender: String? = null,
    @SerialName("blood_type") val bloodType: String? = null,
    val heightCm: Double? = null,
    val weightKg: Double? = null,
    @SerialName("emergency_contact") val emergencyContact: JsonObject? = null,
) {
    fun toDomain() = PatientProfileSnapshot(
        dni = dni,
        careCountry = careCountry,
        birthDate = birthDate,
        gender = gender,
        bloodType = bloodType,
        heightCm = heightCm,
        weightKg = weightKg,
        emergencyContactName = emergencyContact?.stringValue("name"),
        emergencyContactRelationship = emergencyContact?.stringValue("relationship")
            ?: emergencyContact?.stringValue("relation"),
        emergencyContactPhone = emergencyContact?.stringValue("phone"),
        emergencyContactEmail = emergencyContact?.stringValue("email"),
    )
}

private fun JsonObject.stringValue(key: String): String? {
    return this[key]
        ?.jsonPrimitive
        ?.contentOrNull
        ?.takeIf { it.isNotBlank() }
}
