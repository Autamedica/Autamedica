package com.autamedica.android.data.repository

import com.autamedica.android.BuildConfig
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
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URI
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MedicalCertificateRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
    private val prescriptionRepository: PrescriptionRepository,
) : MedicalCertificateRepository {

    private val downloadClient = OkHttpClient.Builder()
        .callTimeout(15, TimeUnit.SECONDS)
        .build()

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

        val memedRows = runCatching {
            supabaseClient.postgrest.rpc("patient_memed_prescriptions_get")
                .decodeList<MemedPatientCertificateRowDto>()
        }.onFailure {
            SecureLog.error("[Certificates] Failed fetching patient Memed atestados", it)
        }.getOrDefault(emptyList())
        if (rows.isEmpty() && memedRows.isEmpty()) return@runCatching emptyList()

        val doctorIds = (rows.mapNotNull { it.doctorId } + memedRows.mapNotNull { it.doctorId }).distinct()
        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(doctorIds)

        val coreCertificates = rows.map { row ->
            val docId = row.doctorId
            MedicalCertificate(
                id = row.id,
                cuir = row.cuir,
                status = row.status,
                certificateType = CertificateType.fromCode(row.certificateType),
                daysOfRest = row.daysOfRest,
                restHours = row.restHours,
                startDate = row.startDate,
                endDate = row.endDate,
                diagnosis = if (row.hideDiagnosis) null else row.diagnosis,
                hideDiagnosis = row.hideDiagnosis,
                observations = row.observations,
                doctorName = docId?.let { doctorNameMap[it] },
                doctorLicense = docId?.let { doctorLicenseMap[it] },
                signedPdfUrl = row.signedPdfUrl,
                signatureVerifiedAt = row.signatureVerifiedAt,
                signatureHash = row.signatureHash,
                signatureMethod = row.signatureMethod,
                qrCodeContent = row.qrCodeContent ?: "https://autamedica.com/verify/${row.cuir}",
                countryCode = row.countryCode,
                createdAt = row.createdAt,
            )
        }

        val memedCertificates = memedRows.mapNotNull { row ->
            val provider = row.providerData ?: return@mapNotNull null
            val digital = row.digitalLinkData
            val providerReportedSigned = provider["provider_reported_signed"]?.jsonPrimitive?.booleanOrNull == true
            val patientDeliveryEligible = provider["patient_delivery_eligible"]?.jsonPrimitive?.booleanOrNull == true
            val structuredAtestado = runCatching {
                provider["structured_documents"]?.jsonArray?.any { document ->
                    val item = document.jsonObject
                    item["tipo"]?.jsonPrimitive?.contentOrNull == "custom" &&
                        item["custom_categoria"]?.jsonPrimitive?.contentOrNull == "atestado"
                } == true
            }.getOrDefault(false)
            val hasAtestado = provider["has_atestado"]?.jsonPrimitive?.booleanOrNull == true ||
                provider["document_type"]?.jsonPrimitive?.contentOrNull == "atestado" || structuredAtestado
            val pdfAvailable = listOf("pdf_url", "document_url").any { key ->
                digital?.get(key)?.jsonPrimitive?.contentOrNull?.startsWith("https://", ignoreCase = true) == true
            }
            if (!hasAtestado || !providerReportedSigned || !patientDeliveryEligible || !pdfAvailable) {
                return@mapNotNull null
            }
            val routeId = "memed-" + row.id
            MedicalCertificate(
                id = routeId,
                cuir = "",
                status = "signed",
                certificateType = CertificateType.ATESTADO,
                startDate = row.createdAt?.take(10).orEmpty(),
                doctorName = row.doctorId?.let { doctorNameMap[it] },
                signedPdfUrl = "/api/patients/prescriptions/" + routeId + "/pdf",
                countryCode = "BR",
                createdAt = row.createdAt.orEmpty(),
                signatureMethod = "memed_provider_reported",
                source = "memed_br",
                providerSignatureReported = true,
                patientDeliveryEligible = true,
                hideDiagnosis = true,
            )
        }
        coreCertificates + memedCertificates
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
            restHours = row.restHours,
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
            signatureVerifiedAt = row.signatureVerifiedAt,
            signatureHash = row.signatureHash,
            signatureMethod = row.signatureMethod,
            qrCodeContent = row.qrCodeContent ?: "https://autamedica.com/verify/${row.cuir}",
            countryCode = row.countryCode,
            createdAt = row.createdAt,
        )
    }.onFailure {
        SecureLog.error("[Certificates] Failed fetching certificate $id", it)
    }

    override suspend fun getCertificatePdfDownloadUrl(certificate: MedicalCertificate): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            require(certificate.isActive) { "El atestado no tiene una emisión verificable" }
            val accessToken = supabaseClient.auth.currentSessionOrNull()?.accessToken
                ?: throw IllegalStateException("Sesión autenticada requerida para descargar el atestado")

            val endpoint = BuildConfig.WEB_API_URL.trimEnd('/') +
                "/api/doctors/certificates/${certificate.id}/pdf?downloadUrl=true"
            val request = Request.Builder()
                .url(endpoint)
                .header("Authorization", "Bearer $accessToken")
                .header("Accept", "application/json")
                .get()
                .build()

            downloadClient.newCall(request).execute().use { response ->
                val responseBody = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    throw IllegalStateException("No se pudo autorizar la descarga del atestado (HTTP ${response.code})")
                }

                val envelope = JSONObject(responseBody)
                if (!envelope.optBoolean("success", false)) {
                    throw IllegalStateException("El servidor no autorizó la descarga del atestado")
                }
                val signedUrl = envelope.optJSONObject("data")?.optString("url").orEmpty()
                val signedUri = runCatching { URI(signedUrl) }.getOrNull()
                    ?: throw IllegalStateException("El servidor devolvió una URL de descarga inválida")
                val expectedHost = URI(BuildConfig.SUPABASE_URL).host
                require(signedUri.scheme.equals("https", ignoreCase = true) &&
                    signedUri.host.equals(expectedHost, ignoreCase = true) &&
                    signedUri.userInfo == null) {
                    "El servidor devolvió una URL de Storage no confiable"
                }
                signedUri.toASCIIString()
            }
        }.onFailure {
            SecureLog.error("[Certificates] Failed resolving authenticated PDF download URL", it)
        }
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
                restHours = row.restHours,
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
                signatureVerifiedAt = row.signatureVerifiedAt,
                signatureHash = row.signatureHash,
                signatureMethod = row.signatureMethod,
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
        require(request.daysOfRest in 0..365) { "Días de dispensa fuera del rango permitido" }
        require(request.restHours in 0..8760) { "Horas de dispensa fuera del rango permitido" }
        require(request.daysOfRest == 0 || request.restHours == 0) {
            "La dispensa debe expresarse en días o en horas, no en ambas unidades"
        }
        val expectedEndDate = InCallDocumentPolicy.inclusiveEndDate(startDate, request.daysOfRest)?.toString()
        require(request.endDate == expectedEndDate) { "Período de reposo inconsistente" }
        require(request.restHours == 0 || request.endDate == null) {
            "Una dispensa por horas no debe definir una fecha de reintegro por días"
        }
        require(
            (request.daysOfRest == 0 && request.restHours == 0) || !request.diagnosis.isNullOrBlank()
        ) {
            "El diagnóstico clínico es obligatorio para justificar la dispensa"
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
        val resolvedCountry = doctorCountry
            ?: throw IllegalStateException("No se pudo determinar el país a partir de la matrícula profesional")
        check(request.countryCode.isBlank() || resolvedCountry == request.countryCode) {
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
        InCallDocumentPolicy.requireMatchingPatientCountry(patientCountry, resolvedCountry)

        val timestampHex = java.lang.Long.toHexString(System.currentTimeMillis()).uppercase()
        val randomHex = UUID.randomUUID().toString().replace("-", "").take(6).uppercase()
        // Internal reference only. A draft has no public verification QR.
        val cuir = "${resolvedCountry}-CERT-$timestampHex-$randomHex"
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
            put("rest_hours", request.restHours)
            put("start_date", request.startDate)
            request.endDate?.let { put("end_date", it) }
            request.diagnosis?.let { put("diagnosis", it) }
            put("hide_diagnosis", request.hideDiagnosis || resolvedCountry == "BR")
            request.cid10Code?.takeIf { it.isNotBlank() }?.let { put("cid10_code", it) }
            request.observations?.let { put("observations", it) }
            put("country_code", resolvedCountry)
            put("created_at", now)
            put("updated_at", now)
        }

        supabaseClient.postgrest.from("medical_certificates").insert(insertPayload)

        val issued = if (resolvedCountry == "AR") {
            val accessToken = supabaseClient.auth.currentSessionOrNull()?.accessToken
                ?: throw IllegalStateException("Sesión autenticada requerida para firmar y emitir el certificado")
            withContext(Dispatchers.IO) {
                executeElectronicCertificateIssuance(
                    httpClient = downloadClient,
                    baseUrl = BuildConfig.WEB_API_URL,
                    certId = certId,
                    accessToken = accessToken,
                )
            }
        } else {
            null
        }

        val (patientNameMap, patientDniMap) = resolvePatientsInfo(listOf(request.patientId))
        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(listOf(doctor.id))

        MedicalCertificate(
            id = certId,
            cuir = issued?.cuir?.ifBlank { cuir } ?: cuir,
            status = issued?.status ?: "draft",
            certificateType = request.certificateType,
            daysOfRest = request.daysOfRest,
            restHours = request.restHours,
            startDate = request.startDate,
            endDate = request.endDate,
            diagnosis = if (resolvedCountry == "BR" || request.hideDiagnosis) null else request.diagnosis,
            hideDiagnosis = resolvedCountry == "BR" || request.hideDiagnosis,
            observations = request.observations,
            doctorName = doctorNameMap[doctor.id],
            doctorLicense = doctorLicenseMap[doctor.id] ?: doctor.licenseNumber,
            patientName = patientNameMap[request.patientId],
            patientDni = patientDniMap[request.patientId],
            signedPdfUrl = issued?.signedPdfUrl,
            signatureVerifiedAt = issued?.signatureVerifiedAt,
            signatureHash = issued?.signatureHash,
            signatureMethod = issued?.signatureMethod,
            qrCodeContent = issued?.qrCodeContent,
            countryCode = resolvedCountry,
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
    private data class MemedPatientCertificateRowDto(
        val id: String,
        @SerialName("doctor_id") val doctorId: String? = null,
        @SerialName("created_at") val createdAt: String? = null,
        @SerialName("provider_data") val providerData: JsonObject? = null,
        @SerialName("digital_link_data") val digitalLinkData: JsonObject? = null,
    )

    @Serializable
    private data class RecordIdDto(val id: String)

    @Serializable
    private data class CertificateRowDto(
        val id: String,
        val cuir: String,
        val status: String = "draft",
        @SerialName("certificate_type") val certificateType: String = "reposo_laboral",
        @SerialName("days_of_rest") val daysOfRest: Int = 0,
        @SerialName("rest_hours") val restHours: Int = 0,
        @SerialName("start_date") val startDate: String,
        @SerialName("end_date") val endDate: String? = null,
        val diagnosis: String? = null,
        @SerialName("hide_diagnosis") val hideDiagnosis: Boolean = false,
        val observations: String? = null,
        @SerialName("doctor_id") val doctorId: String? = null,
        @SerialName("patient_id") val patientId: String? = null,
        @SerialName("signed_pdf_url") val signedPdfUrl: String? = null,
        @SerialName("signature_verified_at") val signatureVerifiedAt: String? = null,
        @SerialName("signature_hash") val signatureHash: String? = null,
        @SerialName("signature_method") val signatureMethod: String? = null,
        @SerialName("qr_code_content") val qrCodeContent: String? = null,
        @SerialName("created_at") val createdAt: String,
        @SerialName("country_code") val countryCode: String = "",
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

internal data class IssuedElectronicCertificate(
    val cuir: String,
    val status: String,
    val signedPdfUrl: String,
    val signatureVerifiedAt: String,
    val signatureHash: String,
    val signatureMethod: String,
    val qrCodeContent: String?,
)

internal fun executeElectronicCertificateIssuance(
    httpClient: OkHttpClient,
    baseUrl: String,
    certId: String,
    accessToken: String,
): IssuedElectronicCertificate {
    require(accessToken.isNotBlank()) { "Sesión autenticada requerida para emitir el certificado" }
    val endpoint = "${baseUrl.trimEnd('/')}/api/doctors/certificates/$certId/issue"

    // Step 1: GET canonical snapshotHash from server
    val getRequest = Request.Builder()
        .url(endpoint)
        .header("Authorization", "Bearer $accessToken")
        .header("Accept", "application/json")
        .header("Cache-Control", "no-store")
        .get()
        .build()

    val snapshotHash = httpClient.newCall(getRequest).execute().use { response ->
        val raw = response.body?.string().orEmpty()
        if (!response.isSuccessful) {
            throw IllegalStateException(mapCertificateIssueError(raw, response.code))
        }
        val root = runCatching { Json.parseToJsonElement(raw).jsonObject }.getOrNull()
            ?: throw IllegalStateException("Respuesta inválida al preparar la firma del certificado")
        if (root["success"]?.jsonPrimitive?.booleanOrNull != true) {
            throw IllegalStateException(mapCertificateIssueError(raw, response.code))
        }
        val data = root["data"]?.let { runCatching { it.jsonObject }.getOrNull() }
            ?: throw IllegalStateException("Faltan datos de revisión para firmar el certificado")
        if (data["status"]?.jsonPrimitive?.contentOrNull == "signed") {
            val existing = data["certificate"]?.let { runCatching { it.jsonObject }.getOrNull() }
                ?: throw IllegalStateException("El servidor reportó certificado firmado sin adjuntar el registro")
            return parseIssuedCertificateJson(existing)
        }
        val hash = data["snapshotHash"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        require(hash.matches(Regex("^[a-f0-9]{64}$"))) {
            "El servidor no devolvió un hash SHA-256 válido para confirmar el certificado"
        }
        hash
    }

    // Step 2: POST explicit doctor confirmation + snapshotHash to generate PDF & evidence in private bucket
    val postBody = buildJsonObject {
        put("confirmed", true)
        put("snapshotHash", snapshotHash)
    }.toString().toRequestBody("application/json; charset=utf-8".toMediaType())

    val postRequest = Request.Builder()
        .url(endpoint)
        .header("Authorization", "Bearer $accessToken")
        .header("Accept", "application/json")
        .header("Cache-Control", "no-store")
        .post(postBody)
        .build()

    return httpClient.newCall(postRequest).execute().use { response ->
        val raw = response.body?.string().orEmpty()
        if (!response.isSuccessful) {
            throw IllegalStateException(mapCertificateIssueError(raw, response.code))
        }
        val root = runCatching { Json.parseToJsonElement(raw).jsonObject }.getOrNull()
            ?: throw IllegalStateException("Respuesta inválida al emitir el certificado firmado")
        if (root["success"]?.jsonPrimitive?.booleanOrNull != true) {
            throw IllegalStateException(mapCertificateIssueError(raw, response.code))
        }
        val data = root["data"]?.let { runCatching { it.jsonObject }.getOrNull() }
            ?: throw IllegalStateException("El servidor no devolvió el certificado emitido")
        parseIssuedCertificateJson(data)
    }
}

private fun parseIssuedCertificateJson(data: JsonObject): IssuedElectronicCertificate {
    fun str(key: String): String = data[key]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
    val status = str("status")
    val signedPdfUrl = str("signed_pdf_url")
    val signatureVerifiedAt = str("signature_verified_at")
    val signatureHash = str("signature_hash")
    val signatureMethod = str("signature_method").ifBlank { "electronic_verified" }
    val cuir = str("cuir")
    val qr = str("qr_code_content").ifBlank {
        if (cuir.isNotBlank()) "https://autamedica.com/verify/$cuir" else ""
    }.takeIf { it.isNotBlank() }

    check(
        status == "signed" &&
            signedPdfUrl.isNotBlank() &&
            signatureVerifiedAt.isNotBlank() &&
            signatureHash.matches(Regex("^[a-f0-9]{64}$")),
    ) {
        "El servidor no confirmó la firma electrónica ni el PDF del certificado"
    }
    return IssuedElectronicCertificate(
        cuir = cuir,
        status = status,
        signedPdfUrl = signedPdfUrl,
        signatureVerifiedAt = signatureVerifiedAt,
        signatureHash = signatureHash,
        signatureMethod = signatureMethod,
        qrCodeContent = qr,
    )
}

private fun mapCertificateIssueError(raw: String, httpCode: Int): String {
    val parsedError = runCatching {
        val obj = Json.parseToJsonElement(raw).jsonObject
        val nested = obj["error"]?.let { elem ->
            runCatching { elem.jsonObject["message"]?.jsonPrimitive?.contentOrNull }.getOrNull()
                ?: runCatching { elem.jsonPrimitive.contentOrNull }.getOrNull()
        }
        nested?.takeIf { it.isNotBlank() }
            ?: obj["message"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
    }.getOrNull()

    return when (parsedError) {
        "certificate_signature_and_stamp_required" ->
            "Cargá tu firma y sello profesional en Perfil → Firma digital antes de emitir certificados."
        "certificate_doctor_not_validated" ->
            "Tu matrícula profesional debe estar validada en SISA/REFEPS para emitir certificados firmados."
        "certificate_identity_incomplete" ->
            "El paciente debe tener nombre completo y DNI registrados para emitir el certificado."
        "certificate_period_invalid", "certificate_period_or_diagnosis_invalid" ->
            "Verificá el período de reposo y el diagnóstico antes de emitir."
        else -> parsedError ?: "No se pudo firmar y emitir el certificado (HTTP $httpCode)"
    }
}
