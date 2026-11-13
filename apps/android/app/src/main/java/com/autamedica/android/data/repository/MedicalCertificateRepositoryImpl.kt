package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.CertificateType
import com.autamedica.android.domain.model.CreateCertificateRequest
import com.autamedica.android.domain.model.InCallDocumentPolicy
import com.autamedica.android.domain.model.MedicalCertificate
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.domain.repository.MedicalCertificateRepository
import com.autamedica.android.domain.repository.PrescriptionRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MedicalCertificateRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
    private val prescriptionRepository: PrescriptionRepository,
) : MedicalCertificateRepository {

    override suspend fun getPatientCertificates(): Result<List<MedicalCertificate>> = runCatching {
        val patientId = resolvePatientId()

        val rows = supabaseClient.postgrest
            .from("medical_certificates")
            .select(Columns.ALL) {
                filter {
                    eq("patient_id", patientId)
                    neq("status", "draft")
                }
                order("created_at", Order.DESCENDING)
            }
            .decodeList<CertificateRowDto>()

        if (rows.isEmpty()) return@runCatching emptyList()

        val doctorIds = rows.mapNotNull { it.doctorId }.distinct()
        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(doctorIds)

        rows.map { row ->
            val docId = row.doctorId
            MedicalCertificate(
                id = row.id,
                cuir = row.cuir,
                status = row.status,
                certificateType = CertificateType.fromCode(row.certificateType),
                daysOfRest = row.daysOfRest,
                startDate = row.startDate,
                endDate = row.endDate,
                diagnosis = if (row.hideDiagnosis) null else row.diagnosis,
                hideDiagnosis = row.hideDiagnosis,
                observations = row.observations,
                doctorName = docId?.let { doctorNameMap[it] },
                doctorLicense = docId?.let { doctorLicenseMap[it] },
                signedPdfUrl = row.signedPdfUrl,
                qrCodeContent = row.qrCodeContent ?: "https://autamedica.com/verify/${row.cuir}",
                countryCode = row.countryCode,
                createdAt = row.createdAt,
            )
        }
    }.onFailure {
        SecureLog.error("[Certificates] Failed fetching patient certificates", it)
    }

    override suspend fun getCertificateById(id: String): Result<MedicalCertificate> = runCatching {
        val row = supabaseClient.postgrest
            .from("medical_certificates")
            .select(Columns.ALL) {
                filter { eq("id", id) }
                limit(1)
            }
            .decodeSingle<CertificateRowDto>()

        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(listOfNotNull(row.doctorId))
        val (patientNameMap, patientDniMap) = resolvePatientsInfo(listOfNotNull(row.patientId))
        val docId = row.doctorId
        val patId = row.patientId

        MedicalCertificate(
            id = row.id,
            cuir = row.cuir,
            status = row.status,
            certificateType = CertificateType.fromCode(row.certificateType),
            daysOfRest = row.daysOfRest,
            startDate = row.startDate,
            endDate = row.endDate,
            diagnosis = if (row.hideDiagnosis) null else row.diagnosis,
            hideDiagnosis = row.hideDiagnosis,
            observations = row.observations,
            doctorName = docId?.let { doctorNameMap[it] },
            doctorLicense = docId?.let { doctorLicenseMap[it] },
            patientName = patId?.let { patientNameMap[it] },
            patientDni = patId?.let { patientDniMap[it] },
            signedPdfUrl = row.signedPdfUrl,
            qrCodeContent = row.qrCodeContent ?: "https://autamedica.com/verify/${row.cuir}",
            countryCode = row.countryCode,
            createdAt = row.createdAt,
        )
    }.onFailure {
        SecureLog.error("[Certificates] Failed fetching certificate $id", it)
    }

    override suspend fun getDoctorCertificates(patientId: String?): Result<List<MedicalCertificate>> = runCatching {
        val doctorId = resolveDoctorId()

        val rows = supabaseClient.postgrest
            .from("medical_certificates")
            .select(Columns.ALL) {
                filter {
                    eq("doctor_id", doctorId)
                    if (!patientId.isNullOrBlank()) {
                        eq("patient_id", patientId)
                    }
                }
                order("created_at", Order.DESCENDING)
            }
            .decodeList<CertificateRowDto>()

        if (rows.isEmpty()) return@runCatching emptyList()

        val patientIds = rows.mapNotNull { it.patientId }.distinct()
        val (patientNameMap, patientDniMap) = resolvePatientsInfo(patientIds)
        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(listOf(doctorId))

        rows.map { row ->
            val patId = row.patientId
            MedicalCertificate(
                id = row.id,
                cuir = row.cuir,
                status = row.status,
                certificateType = CertificateType.fromCode(row.certificateType),
                daysOfRest = row.daysOfRest,
                startDate = row.startDate,
                endDate = row.endDate,
                diagnosis = if (row.hideDiagnosis) null else row.diagnosis,
                hideDiagnosis = row.hideDiagnosis,
                observations = row.observations,
                doctorName = doctorNameMap[doctorId],
                doctorLicense = doctorLicenseMap[doctorId],
                patientName = patId?.let { patientNameMap[it] },
                patientDni = patId?.let { patientDniMap[it] },
                signedPdfUrl = row.signedPdfUrl,
                qrCodeContent = row.qrCodeContent ?: "https://autamedica.com/verify/${row.cuir}",
                countryCode = row.countryCode,
                createdAt = row.createdAt,
            )
        }
    }.onFailure {
        SecureLog.error("[Certificates] Failed fetching doctor certificates", it)
    }

    override suspend fun createCertificate(request: CreateCertificateRequest): Result<MedicalCertificate> = runCatching {
        require(request.patientId.isNotBlank()) { "ID de paciente requerido" }
        val startDate = LocalDate.parse(request.startDate)
        val expectedEndDate = InCallDocumentPolicy.inclusiveEndDate(startDate, request.daysOfRest)?.toString()
        require(request.endDate == expectedEndDate) { "Período de reposo inconsistente" }
        require(request.daysOfRest == 0 || !request.diagnosis.isNullOrBlank()) {
            "El diagnóstico clínico es obligatorio para un certificado de reposo"
        }

        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No authenticated user ID found")

        val doctor = supabaseClient.postgrest
            .from("doctors")
            .select(Columns.list("id", "license_number", "license_type", "uf_brazil", "care_country", "active")) {
                filter { eq("user_id", userId) }
            }
            .decodeSingleOrNull<DoctorRecordDto>()
            ?: throw IllegalStateException("Perfil médico no encontrado")

        check(doctor.active) { "El médico debe tener un perfil activo" }
        val doctorCountry = InCallDocumentPolicy.doctorCountry(
            doctor.licenseType, doctor.careCountry, doctor.ufBrazil,
        )
        check(doctorCountry == request.countryCode && doctorCountry != null) {
            "El país del certificado no coincide con la matrícula médica"
        }
        val eligiblePatients = prescriptionRepository.getEligiblePatients().getOrElse {
            throw IllegalStateException("No se pudo verificar la relación médico-paciente", it)
        }
        check(eligiblePatients.any { it.patientId == request.patientId }) {
            "El médico no tiene acceso clínico verificado al paciente"
        }
        val patientCountry = supabaseClient.postgrest.from("patients")
            .select(Columns.list("id", "care_country")) {
                filter { eq("id", request.patientId) }
            }.decodeSingleOrNull<PatientCountryDto>()?.countryCode
        InCallDocumentPolicy.requireMatchingPatientCountry(patientCountry, request.countryCode)

        val timestampHex = java.lang.Long.toHexString(System.currentTimeMillis()).uppercase()
        val randomHex = UUID.randomUUID().toString().replace("-", "").take(6).uppercase()
        // Internal reference only. A draft has no public verification QR.
        val cuir = "${request.countryCode}-CERT-$timestampHex-$randomHex"
        val certId = UUID.randomUUID().toString()
        val now = Instant.now().toString()

        val insertPayload = buildJsonObject {
            put("id", certId)
            put("doctor_id", doctor.id)
            put("patient_id", request.patientId)
            put("cuir", cuir)
            put("status", "draft")
            put("certificate_type", request.certificateType.code)
            put("days_of_rest", request.daysOfRest)
            put("start_date", request.startDate)
            request.endDate?.let { put("end_date", it) }
            request.diagnosis?.let { put("diagnosis", it) }
            put("hide_diagnosis", request.countryCode == "BR" || request.hideDiagnosis)
            request.observations?.let { put("observations", it) }
            put("country_code", request.countryCode)
            put("created_at", now)
            put("updated_at", now)
        }

        supabaseClient.postgrest.from("medical_certificates").insert(insertPayload)

        val (patientNameMap, patientDniMap) = resolvePatientsInfo(listOf(request.patientId))
        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(listOf(doctor.id))

        MedicalCertificate(
            id = certId,
            cuir = cuir,
            status = "draft",
            certificateType = request.certificateType,
            daysOfRest = request.daysOfRest,
            startDate = request.startDate,
            endDate = request.endDate,
            diagnosis = if (request.hideDiagnosis) null else request.diagnosis,
            hideDiagnosis = request.countryCode == "BR" || request.hideDiagnosis,
            observations = request.observations,
            doctorName = doctorNameMap[doctor.id],
            doctorLicense = doctorLicenseMap[doctor.id] ?: doctor.licenseNumber,
            patientName = patientNameMap[request.patientId],
            patientDni = patientDniMap[request.patientId],
            signedPdfUrl = null,
            qrCodeContent = null,
            countryCode = request.countryCode,
            createdAt = now,
        )
    }.onFailure {
        SecureLog.error("[Certificates] Failed creating medical certificate", it)
    }

    override suspend fun getEligiblePatients(): Result<List<PrescriptionPatientItem>> {
        return prescriptionRepository.getEligiblePatients()
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

    private suspend fun resolveDoctorId(): String {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No authenticated user ID found")

        return supabaseClient.postgrest
            .from("doctors")
            .select(Columns.list("id")) {
                filter { eq("user_id", userId) }
            }
            .decodeSingleOrNull<RecordIdDto>()
            ?.id
            ?: throw IllegalStateException("No doctor profile found for user $userId")
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
            SecureLog.error("[Certificates] Failed loading doctors info", e)
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
                SecureLog.error("[Certificates] Failed loading doctor profiles", e)
                emptyList()
            }
        } else emptyList()

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
            } else "Dr. Médico Tratante"
            nameMap[doc.id] = fullName
            doc.licenseNumber?.takeIf { it.isNotBlank() }?.let {
                licenseMap[doc.id] = it
            }
        }

        return nameMap to licenseMap
    }

    private suspend fun resolvePatientsInfo(
        patientIds: List<String>
    ): Pair<Map<String, String>, Map<String, String>> {
        if (patientIds.isEmpty()) return emptyMap<String, String>() to emptyMap<String, String>()

        val patients = try {
            supabaseClient.postgrest
                .from("patients")
                .select(Columns.list("id", "user_id", "dni")) {
                    filter { isIn("id", patientIds) }
                }
                .decodeList<PatientRecordDto>()
        } catch (e: Exception) {
            SecureLog.error("[Certificates] Failed loading patients info", e)
            emptyList()
        }

        val userIds = patients.mapNotNull { it.userId }.distinct()
        val profiles = if (userIds.isNotEmpty()) {
            try {
                supabaseClient.postgrest
                    .from("profiles")
                    .select(Columns.list("user_id", "first_name", "last_name")) {
                        filter { isIn("user_id", userIds) }
                    }
                    .decodeList<DoctorProfileDto>()
            } catch (e: Exception) {
                SecureLog.error("[Certificates] Failed loading patient profiles", e)
                emptyList()
            }
        } else emptyList()

        val profileByUser = profiles.associateBy { it.userId }
        val nameMap = mutableMapOf<String, String>()
        val dniMap = mutableMapOf<String, String>()

        for (pat in patients) {
            val prof = pat.userId?.let { profileByUser[it] }
            val fullName = if (prof != null) {
                listOfNotNull(prof.firstName?.trim(), prof.lastName?.trim())
                    .filter { it.isNotEmpty() }
                    .joinToString(" ")
            } else ""
            nameMap[pat.id] = fullName.ifBlank { "Paciente" }
            pat.dni?.takeIf { it.isNotBlank() }?.let {
                dniMap[pat.id] = it
            }
        }

        return nameMap to dniMap
    }

    @Serializable
    private data class RecordIdDto(val id: String)

    @Serializable
    private data class CertificateRowDto(
        val id: String,
        val cuir: String,
        val status: String = "draft",
        @SerialName("certificate_type") val certificateType: String = "reposo_laboral",
        @SerialName("days_of_rest") val daysOfRest: Int = 0,
        @SerialName("start_date") val startDate: String,
        @SerialName("end_date") val endDate: String? = null,
        val diagnosis: String? = null,
        @SerialName("hide_diagnosis") val hideDiagnosis: Boolean = false,
        val observations: String? = null,
        @SerialName("doctor_id") val doctorId: String? = null,
        @SerialName("patient_id") val patientId: String? = null,
        @SerialName("signed_pdf_url") val signedPdfUrl: String? = null,
        @SerialName("qr_code_content") val qrCodeContent: String? = null,
        @SerialName("created_at") val createdAt: String,
        @SerialName("country_code") val countryCode: String = "AR",
    )

    @Serializable
    private data class DoctorRecordDto(
        val id: String,
        @SerialName("user_id") val userId: String? = null,
        @SerialName("license_number") val licenseNumber: String? = null,
        @SerialName("license_type") val licenseType: String? = null,
        @SerialName("uf_brazil") val ufBrazil: String? = null,
        @SerialName("care_country") val careCountry: String? = null,
        val active: Boolean = false,
    )

    @Serializable
    private data class PatientCountryDto(
        val id: String,
        @SerialName("care_country") val countryCode: String? = null,
    )

    @Serializable
    private data class DoctorProfileDto(
        @SerialName("user_id") val userId: String,
        @SerialName("first_name") val firstName: String? = null,
        @SerialName("last_name") val lastName: String? = null,
    )

    @Serializable
    private data class PatientRecordDto(
        val id: String,
        @SerialName("user_id") val userId: String? = null,
        val dni: String? = null,
    )
}
