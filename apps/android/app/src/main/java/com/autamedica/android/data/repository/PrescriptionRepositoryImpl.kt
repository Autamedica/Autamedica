package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.repository.PrescriptionRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PrescriptionRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
) : PrescriptionRepository {

    override suspend fun getPatientPrescriptions(): Result<List<Prescription>> = runCatching {
        val patientId = resolvePatientId()

        val rows = supabaseClient.postgrest
            .from("prescriptions")
            .select(Columns.ALL) {
                filter {
                    eq("patient_id", patientId)
                    neq("status", "draft")
                }
                order("created_at", Order.DESCENDING)
            }
            .decodeList<PrescriptionRowDto>()

        if (rows.isEmpty()) {
            return@runCatching emptyList()
        }

        val doctorIds = rows.mapNotNull { it.doctorId }.distinct()
        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(doctorIds)

        rows.map { row ->
            val clinical = parseClinicalData(row.clinicalData)
            val docId = row.doctorId
            Prescription(
                id = row.id,
                status = row.status,
                cuir = row.cuir,
                signedPdfUrl = row.signedPdfUrl,
                qrCodeContent = row.qrCodeContent ?: row.cuir?.let { "https://autamedica.com/verify/$it" },
                medicationName = clinical.medicationName,
                dosage = clinical.dosage,
                frequency = clinical.frequency,
                instructions = clinical.instructions,
                doctorName = docId?.let { doctorNameMap[it] },
                doctorLicense = docId?.let { doctorLicenseMap[it] },
                createdAt = row.createdAt,
                countryCode = row.countryCode,
            )
        }
    }.onFailure {
        SecureLog.error("[Prescriptions] Failed fetching prescriptions", it)
    }

    override suspend fun getPrescriptionById(id: String): Result<Prescription> = runCatching {
        val row = supabaseClient.postgrest
            .from("prescriptions")
            .select(Columns.ALL) {
                filter { eq("id", id) }
                limit(1)
            }
            .decodeSingle<PrescriptionRowDto>()

        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(listOfNotNull(row.doctorId))
        val clinical = parseClinicalData(row.clinicalData)
        val docId = row.doctorId

        Prescription(
            id = row.id,
            status = row.status,
            cuir = row.cuir,
            signedPdfUrl = row.signedPdfUrl,
            qrCodeContent = row.qrCodeContent ?: row.cuir?.let { "https://autamedica.com/verify/$it" },
            medicationName = clinical.medicationName,
            dosage = clinical.dosage,
            frequency = clinical.frequency,
            instructions = clinical.instructions,
            doctorName = docId?.let { doctorNameMap[it] },
            doctorLicense = docId?.let { doctorLicenseMap[it] },
            createdAt = row.createdAt,
            countryCode = row.countryCode,
        )
    }.onFailure {
        SecureLog.error("[Prescriptions] Failed fetching prescription $id", it)
    }

    private suspend fun resolvePatientId(): String {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No authenticated user ID found")

        return supabaseClient.postgrest
            .from("patients")
            .select(Columns.list("id")) {
                filter { eq("user_id", userId) }
            }
            .decodeSingleOrNull<RecordIdDto>()
            ?.id
            ?: throw IllegalStateException("No patient profile found for user $userId")
    }

    private suspend fun resolveDoctorsInfo(
        doctorIds: List<String>
    ): Pair<Map<String, String>, Map<String, String>> {
        if (doctorIds.isEmpty()) return emptyMap<String, String>() to emptyMap<String, String>()

        val doctors = try {
            supabaseClient.postgrest
                .from("doctors")
                .select(Columns.list("id", "user_id", "license_number")) {
                    filter { isIn("id", doctorIds) }
                }
                .decodeList<DoctorRecordDto>()
        } catch (e: Exception) {
            SecureLog.error("[Prescriptions] Failed loading doctors info", e)
            emptyList()
        }

        val userIds = doctors.mapNotNull { it.userId }.distinct()
        val profiles = if (userIds.isNotEmpty()) {
            try {
                supabaseClient.postgrest
                    .from("profiles")
                    .select(Columns.list("user_id", "first_name", "last_name")) {
                        filter { isIn("user_id", userIds) }
                    }
                    .decodeList<DoctorProfileDto>()
            } catch (e: Exception) {
                SecureLog.error("[Prescriptions] Failed loading doctor profiles", e)
                emptyList()
            }
        } else {
            emptyList()
        }

        val profileByUser = profiles.associateBy { it.userId }
        val nameMap = mutableMapOf<String, String>()
        val licenseMap = mutableMapOf<String, String>()

        for (doc in doctors) {
            val prof = doc.userId?.let { profileByUser[it] }
            val fullName = if (prof != null) {
                val names = listOfNotNull(prof.firstName?.trim(), prof.lastName?.trim())
                    .filter { it.isNotEmpty() }
                    .joinToString(" ")
                if (names.isNotEmpty()) "Dr. $names" else "Dr. Médico Tratante"
            } else {
                "Dr. Médico Tratante"
            }
            nameMap[doc.id] = fullName
            doc.licenseNumber?.takeIf { it.isNotBlank() }?.let {
                licenseMap[doc.id] = it
            }
        }

        return nameMap to licenseMap
    }

    private fun parseClinicalData(element: JsonElement?): ParsedClinicalData {
        if (element == null) {
            return ParsedClinicalData(medicationName = "Prescripción Médica")
        }

        val obj = element as? JsonObject ?: return ParsedClinicalData(medicationName = "Prescripción Médica")

        // 1. Direct fields
        val directName = obj["medication_name"]?.jsonPrimitive?.contentOrNull
            ?: obj["medicationName"]?.jsonPrimitive?.contentOrNull
            ?: obj["drug_name"]?.jsonPrimitive?.contentOrNull
        val directDosage = obj["dosage"]?.jsonPrimitive?.contentOrNull ?: ""
        val directFrequency = obj["frequency"]?.jsonPrimitive?.contentOrNull ?: ""
        val directInstructions = obj["instructions"]?.jsonPrimitive?.contentOrNull
            ?: obj["directions"]?.jsonPrimitive?.contentOrNull ?: ""

        if (!directName.isNullOrBlank()) {
            return ParsedClinicalData(
                medicationName = directName.trim(),
                dosage = directDosage.trim(),
                frequency = directFrequency.trim(),
                instructions = directInstructions.trim(),
            )
        }

        // 2. Check "medications" array
        val medicationsArray = obj["medications"] as? JsonArray
        val firstMed = medicationsArray?.firstOrNull() as? JsonObject
        if (firstMed != null) {
            val name = firstMed["name"]?.jsonPrimitive?.contentOrNull
                ?: firstMed["medication_name"]?.jsonPrimitive?.contentOrNull
            val dosage = firstMed["dosage"]?.jsonPrimitive?.contentOrNull ?: ""
            val frequency = firstMed["frequency"]?.jsonPrimitive?.contentOrNull ?: ""
            val instructions = firstMed["instructions"]?.jsonPrimitive?.contentOrNull ?: ""
            if (!name.isNullOrBlank()) {
                return ParsedClinicalData(
                    medicationName = name.trim(),
                    dosage = dosage.trim(),
                    frequency = frequency.trim(),
                    instructions = instructions.trim(),
                )
            }
        }

        // 3. Check "items" array (used in electronic prescriptions)
        val itemsArray = obj["items"] as? JsonArray
        val firstItem = itemsArray?.firstOrNull() as? JsonObject
        if (firstItem != null) {
            val name = firstItem["generic_name"]?.jsonPrimitive?.contentOrNull
                ?: firstItem["trade_name"]?.jsonPrimitive?.contentOrNull
                ?: firstItem["name"]?.jsonPrimitive?.contentOrNull
            val dosage = firstItem["dosage"]?.jsonPrimitive?.contentOrNull ?: ""
            val frequency = firstItem["frequency"]?.jsonPrimitive?.contentOrNull ?: ""
            val instructions = firstItem["instructions"]?.jsonPrimitive?.contentOrNull ?: ""
            if (!name.isNullOrBlank()) {
                return ParsedClinicalData(
                    medicationName = name.trim(),
                    dosage = dosage.trim(),
                    frequency = frequency.trim(),
                    instructions = instructions.trim(),
                )
            }
        }

        return ParsedClinicalData(
            medicationName = "Prescripción Médica",
            dosage = directDosage,
            frequency = directFrequency,
            instructions = directInstructions,
        )
    }

    private data class ParsedClinicalData(
        val medicationName: String,
        val dosage: String = "",
        val frequency: String = "",
        val instructions: String = "",
    )

    @Serializable
    private data class RecordIdDto(val id: String)

    @Serializable
    private data class PrescriptionRowDto(
        val id: String,
        val status: String = "activa",
        val cuir: String? = null,
        @SerialName("signed_pdf_url") val signedPdfUrl: String? = null,
        @SerialName("qr_code_content") val qrCodeContent: String? = null,
        @SerialName("clinical_data") val clinicalData: JsonElement? = null,
        @SerialName("doctor_id") val doctorId: String? = null,
        @SerialName("patient_id") val patientId: String? = null,
        @SerialName("created_at") val createdAt: String,
        @SerialName("country_code") val countryCode: String? = null,
    )

    @Serializable
    private data class DoctorRecordDto(
        val id: String,
        @SerialName("user_id") val userId: String? = null,
        @SerialName("license_number") val licenseNumber: String? = null,
    )

    @Serializable
    private data class DoctorProfileDto(
        @SerialName("user_id") val userId: String,
        @SerialName("first_name") val firstName: String? = null,
        @SerialName("last_name") val lastName: String? = null,
    )
}
