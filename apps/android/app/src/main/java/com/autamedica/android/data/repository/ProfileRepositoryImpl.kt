package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.PatientProfileSnapshot
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.ProfileRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.storage.storage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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

        val meta = supabaseClient.auth.currentSessionOrNull()?.user?.userMetadata
        val fallbackAvatar = (meta?.stringValue("avatar_url") ?: meta?.stringValue("picture"))
        val domainUser = dto.toDomain()
        if (domainUser.avatarUrl.isNullOrBlank() && !fallbackAvatar.isNullOrBlank()) {
            domainUser.copy(avatarUrl = fallbackAvatar)
        } else {
            domainUser
        }
    }.onFailure {
        SecureLog.error("[Profile] Failed fetching profile", it)
    }

    private suspend fun authenticatedPatientUserId(): String {
        val sessionUserId = supabaseClient.auth.currentSessionOrNull()?.user?.id
            ?: throw IllegalStateException("invalid_mobile_session")
        val storedUserId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("invalid_mobile_session")
        check(sessionUserId == storedUserId) { "invalid_mobile_session" }
        return sessionUserId
    }

    override suspend fun getCareCountry(): Result<String?> = runCatching {
        val userId = authenticatedPatientUserId()
        val row = supabaseClient.postgrest
            .from("patients")
            .select(Columns.list("care_country")) {
                filter {
                    eq("user_id", userId)
                    eq("active", true)
                }
            }
            .decodeList<PatientCareCountryDto>()
            .firstOrNull()
        row?.careCountry?.takeIf { it == "AR" || it == "BR" }
    }.onFailure {
        SecureLog.error("[Profile] Failed fetching active patient care country", it)
    }

    override suspend fun persistCareCountry(country: String): Result<String> = runCatching {
        require(country == "AR" || country == "BR") { "care_country_required" }
        val userId = authenticatedPatientUserId()
        val activePatient = supabaseClient.postgrest
            .from("patients")
            .select(Columns.list("id", "care_country")) {
                filter {
                    eq("user_id", userId)
                    eq("active", true)
                }
            }
            .decodeList<PatientCareCountryDto>()
            .firstOrNull()
            ?: throw IllegalStateException("care_country_or_patient_profile_required")
        val activePatientId = activePatient.id
            ?: throw IllegalStateException("care_country_or_patient_profile_required")

        val existingCountry = activePatient.careCountry
        if (existingCountry != null) {
            check(existingCountry == country) { "care_country_dispatch_mismatch" }
            return@runCatching existingCountry
        }

        // RLS and the existing patient-country trigger authorize this one-row update.
        val updatedCountry = supabaseClient.postgrest
            .from("patients")
            .update({
                set("care_country", country)
            }) {
                filter {
                    eq("id", activePatientId)
                    eq("user_id", userId)
                    eq("active", true)
                }
                select(Columns.list("care_country"))
            }
            .decodeList<PatientCareCountryDto>()
            .firstOrNull()
            ?.careCountry
            ?: throw IllegalStateException("care_country_persist_confirmation_failed")

        check(updatedCountry == country) { "care_country_persist_confirmation_failed" }
        updatedCountry
    }.onFailure {
        SecureLog.error("[Profile] Failed persisting active patient care country", it)
    }

    override suspend fun getPatientProfileSnapshot(): Result<PatientProfileSnapshot?> = runCatching {
        val userId = authenticatedPatientUserId()
        supabaseClient.postgrest
            .from("patients")
            .select(Columns.ALL) {
                filter {
                    eq("user_id", userId)
                    eq("active", true)
                }
            }
            .decodeList<PatientProfileDto>()
            .firstOrNull()
            ?.toDomain()
    }.onFailure {
        SecureLog.error("[Profile] Failed fetching active patient snapshot", it)
    }

    override suspend fun persistLgpdConsent(
        userId: String,
        acceptedAt: String,
        version: String,
    ): Result<Unit> = runCatching {
        val consent = supabaseClient.postgrest
            .from("patients")
            .update({
                set("lgpd_consent", true)
                set("lgpd_consent_date", acceptedAt)
                set("lgpd_consent_version", version)
            }) {
                filter {
                    eq("user_id", userId)
                    eq("active", true)
                }
                select(Columns.list("lgpd_consent", "lgpd_consent_date", "lgpd_consent_version"))
            }
            .decodeSingleOrNull<PatientLgpdConsentDto>()

        check(
            consent?.lgpdConsent == true &&
                !consent.lgpdConsentDate.isNullOrBlank() &&
                consent.lgpdConsentVersion == version
        ) { "No se pudo confirmar el consentimiento LGPD" }
    }.onFailure {
        SecureLog.error("[Profile] Failed persisting LGPD consent", it)
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

    override suspend fun uploadAvatar(bytes: ByteArray, mimeType: String): Result<String> = runCatching {
        require(bytes.isNotEmpty()) { "La imagen seleccionada está vacía." }
        require(bytes.size <= MAX_AVATAR_SIZE_BYTES) { "La imagen supera el máximo de 2 MB." }

        val normalizedMime = mimeType.trim().lowercase().substringBefore(';').trim().let {
            if (it == "image/jpg") "image/jpeg" else it
        }
        val ext = when (normalizedMime) {
            "image/jpeg" -> "jpg"
            "image/png" -> "png"
            "image/webp" -> "webp"
            else -> throw IllegalArgumentException("Formato no soportado. Usá PNG, JPEG o WebP.")
        }

        val userId = supabaseClient.auth.currentSessionOrNull()?.user?.id
            ?: securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No user ID found")
        val storagePath = "$userId/profile/avatar.$ext"

        withContext(Dispatchers.IO) {
            supabaseClient.storage.from(AVATAR_BUCKET).upload(storagePath, bytes) {
                upsert = true
            }
        }

        val publicUrl = supabaseClient.storage.from(AVATAR_BUCKET).publicUrl(storagePath)
        val versionedUrl = "$publicUrl?v=${System.currentTimeMillis()}"

        supabaseClient.postgrest
            .from("profiles")
            .update({
                set("avatar_url", versionedUrl)
            }) {
                filter { eq("user_id", userId) }
            }

        versionedUrl
    }.onFailure {
        SecureLog.error("[Profile] Failed uploading avatar", it)
    }

    private companion object {
        const val AVATAR_BUCKET = "avatars"
        const val MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024
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
private data class PatientCareCountryDto(
    val id: String? = null,
    @SerialName("care_country") val careCountry: String? = null,
)

@Serializable
private data class PatientProfileDto(
    val dni: String? = null,
    @SerialName("birth_date") val birthDate: String? = null,
    val gender: String? = null,
    @SerialName("blood_type") val bloodType: String? = null,
    val heightCm: Double? = null,
    val weightKg: Double? = null,
    @SerialName("emergency_contact") val emergencyContact: JsonObject? = null,
    @SerialName("care_country") val careCountry: String? = null,
    @SerialName("identity_status") val identityStatus: String? = null,
    @SerialName("identity_verified_at") val identityVerifiedAt: String? = null,
    @SerialName("puco_coverage_name") val pucoCoverageName: String? = null,
) {
    fun toDomain() = PatientProfileSnapshot(
        dni = dni,
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
        careCountry = careCountry?.takeIf { it == "AR" || it == "BR" },
        identityStatus = identityStatus?.takeIf { it.isNotBlank() },
        identityVerifiedAt = identityVerifiedAt?.takeIf { it.isNotBlank() },
        pucoCoverageName = pucoCoverageName?.takeIf { it.isNotBlank() },
    )
}

@Serializable
private data class PatientLgpdConsentDto(
    @SerialName("lgpd_consent") val lgpdConsent: Boolean? = null,
    @SerialName("lgpd_consent_date") val lgpdConsentDate: String? = null,
    @SerialName("lgpd_consent_version") val lgpdConsentVersion: String? = null,
)

private fun JsonObject.stringValue(key: String): String? {
    return this[key]
        ?.jsonPrimitive
        ?.contentOrNull
        ?.takeIf { it.isNotBlank() }
}
