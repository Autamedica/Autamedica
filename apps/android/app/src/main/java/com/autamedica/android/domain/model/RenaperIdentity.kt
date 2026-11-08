package com.autamedica.android.domain.model

/**
 * Identity lookup is an optional, Argentina-only action initiated by the patient.
 * The server chooses whether personal fields are masked. Android must NEVER unmask
 * provider fields, persist this result, or treat it as proof of clinical eligibility.
 */
data class RenaperIdentity(
    val checkedAt: String,
    val hasPaid: Boolean,
    val firstName: String,
    val lastName: String,
    val birthDate: String,
    val gender: String,
    val coverageName: String?,
    /** Already server-redacted. Never store or display an unmasked official address. */
    val maskedAddress: String = "",
    /** Only a bool; official photo bytes are never delivered to Android. */
    val photoAvailable: Boolean = false,
)

enum class RenaperSexId(val providerId: Int) {
    FEMALE(1),
    MALE(2),
    OTHER(3),
}

class RenaperLookupException(val httpStatus: Int) : RuntimeException("Identity lookup unavailable")
