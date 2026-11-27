package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.CreatePrescriptionRequest
import com.autamedica.android.domain.model.DownloadedPrescriptionPdf
import com.autamedica.android.domain.model.DoctorEligibility
import com.autamedica.android.domain.model.InCallDocumentPolicy
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.model.PrescriptionItem
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.domain.repository.PrescriptionRepository
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PrescriptionRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securePreferences: SecurePreferences,
    private val pdfDownloader: PrescriptionPdfDownloader,
) : PrescriptionRepository {

    override suspend fun downloadPatientPrescriptionPdf(
        prescriptionId: String,
    ): Result<DownloadedPrescriptionPdf> = pdfDownloader.download(prescriptionId)

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

        // Read the service-owned Memed feed as well as the normalized prescription
        // feed so Brazilian patients see provider records without a mirror dependency.
        val memedRows = supabaseClient.postgrest
            .rpc("patient_memed_prescriptions_get")
            .decodeList<MemedPrescriptionRowDto>()

        val doctorIds = (rows.mapNotNull { it.doctorId } + memedRows.map { it.doctorId }).distinct()
        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(doctorIds)

        val normalized = rows.map { row ->
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
                duration = clinical.duration,
                diagnosis = clinical.diagnosis,
                notes = clinical.notes,
                prescribedDate = clinical.prescribedDate ?: row.createdAt,
                items = clinical.items,
            )
        }

        val memed = memedRows.mapNotNull { row ->
            val provider = row.providerData as? JsonObject
            val links = row.digitalLinkData as? JsonObject
            val medications = provider?.get("medications") as? JsonArray
            val isPureAtestado = (
                provider?.memedString("document_type") == "atestado" ||
                    provider?.get("has_atestado")?.jsonPrimitive?.contentOrNull == "true"
                ) && (medications == null || medications.isEmpty()) &&
                provider?.memedString("medication_name", "medicationName") == null
            if (isPureAtestado) return@mapNotNull null
            val clinical = parseClinicalData(provider)
            val documentUrl = links?.memedString("pdf_url", "document_url", "url", "link")
                ?: provider?.memedString("pdf_url", "document_url", "digital_link", "url")
            val providerReportedSigned =
                provider?.get("provider_reported_signed")?.jsonPrimitive?.contentOrNull == "true"
            val deliveryEligible =
                provider?.get("patient_delivery_eligible")?.jsonPrimitive?.contentOrNull == "true"
            val canDownloadPdf = documentUrl != null && providerReportedSigned && deliveryEligible
            Prescription(
                id = "memed:${row.id}",
                status = if (row.status == "deleted") "cancelled" else "verified_at_provider",
                cuir = null,
                signedPdfUrl = if (canDownloadPdf) "/api/patients/prescriptions/memed-${row.id}/pdf" else null,
                qrCodeContent = links?.memedString("qr_code", "qrCode"),
                medicationName = clinical.medicationName.ifBlank { "Prescripción Memed" },
                dosage = clinical.dosage,
                frequency = clinical.frequency,
                instructions = clinical.instructions,
                doctorName = doctorNameMap[row.doctorId],
                doctorLicense = doctorLicenseMap[row.doctorId],
                createdAt = row.createdAt,
                countryCode = "BR",
                duration = clinical.duration,
                diagnosis = clinical.diagnosis,
                notes = clinical.notes,
                prescribedDate = clinical.prescribedDate ?: row.createdAt,
                items = clinical.items,
                providerId = row.memedId,
                accessCode = links?.memedString("unlock_code", "access_code", "password", "senha"),
            )
        }

        val mirroredMemedIds = rows.mapNotNull { row ->
            (row.clinicalData as? JsonObject)?.memedString("memed_prescription_id", "vendor_id")
        }.toSet()
        (normalized + memed.filterNot { it.providerId != null && it.providerId in mirroredMemedIds })
            .distinctBy { it.id }
            .sortedByDescending { runCatching { Instant.parse(it.createdAt) }.getOrNull() ?: Instant.EPOCH }
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
        val (patientNameMap, patientDniMap) = resolvePatientsInfo(listOfNotNull(row.patientId))
        val clinical = parseClinicalData(row.clinicalData)
        val docId = row.doctorId
        val patId = row.patientId

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
            duration = clinical.duration,
            diagnosis = clinical.diagnosis,
            notes = clinical.notes,
            prescribedDate = clinical.prescribedDate ?: row.createdAt,
            patientName = patId?.let { patientNameMap[it] },
            patientDni = patId?.let { patientDniMap[it] },
            items = clinical.items,
        )
    }.onFailure {
        SecureLog.error("[Prescriptions] Failed fetching prescription $id", it)
    }

    override suspend fun getDoctorPrescriptions(
        patientId: String?,
        status: String?,
    ): Result<List<Prescription>> = runCatching {
        val doctorId = resolveDoctorId()

        val rows = supabaseClient.postgrest
            .from("prescriptions")
            .select(Columns.ALL) {
                filter {
                    eq("doctor_id", doctorId)
                    if (!patientId.isNullOrBlank()) {
                        eq("patient_id", patientId)
                    }
                    if (!status.isNullOrBlank()) {
                        when (status.lowercase()) {
                            "activa", "active", "signed" -> isIn("status", listOf("signed", "sent", "activa", "active"))
                            "dispensada", "dispensed" -> isIn("status", listOf("dispensed", "dispensada", "dispensed_total", "dispensed_partial"))
                            "cancelada", "cancelled" -> isIn("status", listOf("cancelled", "cancelada"))
                            else -> eq("status", status)
                        }
                    }
                }
                order("created_at", Order.DESCENDING)
            }
            .decodeList<PrescriptionRowDto>()

        if (rows.isEmpty()) {
            return@runCatching emptyList()
        }

        val patientIds = rows.mapNotNull { it.patientId }.distinct()
        val (patientNameMap, patientDniMap) = resolvePatientsInfo(patientIds)
        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(listOf(doctorId))

        rows.map { row ->
            val clinical = parseClinicalData(row.clinicalData)
            val patId = row.patientId
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
                doctorName = doctorNameMap[doctorId],
                doctorLicense = doctorLicenseMap[doctorId],
                createdAt = row.createdAt,
                countryCode = row.countryCode,
                duration = clinical.duration,
                diagnosis = clinical.diagnosis,
                notes = clinical.notes,
                prescribedDate = clinical.prescribedDate ?: row.createdAt,
                patientName = patId?.let { patientNameMap[it] },
                patientDni = patId?.let { patientDniMap[it] },
                items = clinical.items,
            )
        }
    }.onFailure {
        SecureLog.error("[Prescriptions] Failed fetching doctor prescriptions", it)
    }

    override suspend fun createPrescription(request: CreatePrescriptionRequest): Result<Prescription> = runCatching {
        require(request.patientId.isNotBlank()) { "ID de paciente requerido" }
        require(request.items.isNotEmpty()) { "Debe especificar al menos un medicamento" }
        val maxItems = if (request.countryCode.equals("AR", ignoreCase = true)) 1 else 3
        require(request.items.size <= maxItems) {
            if (maxItems == 1) {
                "En Argentina Farmalink admite 1 medicamento por receta. Emite cada medicamento en una receta separada."
            } else {
                "Máximo $maxItems medicamentos por receta según normativa"
            }
        }
        require(request.diagnosis.isNotBlank()) { "Diagnóstico clínico requerido" }
        InCallDocumentPolicy.requireCountry(request.countryCode)

        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No authenticated user ID found")

        val doctor = supabaseClient.postgrest
            .from("doctors")
            .select(Columns.list("id", "license_number", "license_type", "uf_brazil", "care_country", "active")) {
                filter { eq("user_id", userId) }
            }
            .decodeSingleOrNull<DoctorRecordDto>()
            ?: throw IllegalStateException("Perfil médico no encontrado")
        check(doctor.active && InCallDocumentPolicy.doctorCountry(
            doctor.licenseType, doctor.careCountry, doctor.ufBrazil,
        ) == request.countryCode) {
            "País y matrícula profesional no coinciden o el médico está inactivo"
        }

        // The trusted issuer creates the reference. Never fabricate a CUIR in Android
        // or present a storage signed URL as proof of professional signature.
        val now = Instant.now().toString()

        // Resolver ID real en tabla patients si se paso user_id o dni
        val actualPatientId = runCatching {
            val byId = supabaseClient.postgrest.from("patients")
                .select(Columns.list("id")) { filter { eq("id", request.patientId) } }
                .decodeSingleOrNull<RecordIdDto>()?.id
            if (byId != null) return@runCatching byId

            val byUserId = supabaseClient.postgrest.from("patients")
                .select(Columns.list("id")) { filter { eq("user_id", request.patientId) } }
                .decodeSingleOrNull<RecordIdDto>()?.id
            if (byUserId != null) return@runCatching byUserId

            request.patientId
        }.getOrDefault(request.patientId)
        requireDoctorPatientAccess(doctor.id, actualPatientId)
        val patientCountry = supabaseClient.postgrest.from("patients")
            .select(Columns.list("id", "care_country")) {
                filter { eq("id", actualPatientId) }
            }.decodeSingleOrNull<PatientCountryDto>()?.countryCode
        InCallDocumentPolicy.requireMatchingPatientCountry(patientCountry, request.countryCode)

        // 2. Build structured clinical_data JSONB
        val firstItem = request.items.first()
        val itemsArray = buildJsonArray {
            for (item in request.items) {
                add(buildJsonObject {
                    put("name", item.medicationName)
                    put("generic_name", item.genericName.ifBlank { item.medicationName })
                    put("commercial_name", item.medicationName)
                    put("trade_name", item.medicationName)
                    put("quantity", 1)
                    put("dosage", item.dosage)
                    put("frequency", item.frequency)
                    put("duration", item.duration)
                    put("instructions", item.instructions)
                })
            }
        }

        val clinicalData = buildJsonObject {
            put("medication_name", firstItem.medicationName)
            put("dosage", firstItem.dosage)
            put("frequency", firstItem.frequency)
            put("duration", firstItem.duration)
            put("instructions", firstItem.instructions)
            put("diagnosis", request.diagnosis)
            request.notes?.takeIf { it.isNotBlank() }?.let { put("notes", it) }
            put("items", itemsArray)
            put("prescribed_date", now)
            put("country_code", request.countryCode)
        }

        // 3. Invocar Edge Function issue-prescription
        // NO enviar prescriptionId para que la Edge Function cree un borrador nuevo con permisos service_role
        val issuePayload = buildJsonObject {
            put("doctorId", doctor.id)
            put("doctor_id", doctor.id)
            put("patientId", actualPatientId)
            put("patient_id", actualPatientId)
            put("clinicalData", clinicalData)
            put("clinical_data", clinicalData)
            put("items", itemsArray)
            put("diagnosis", request.diagnosis)
            request.notes?.takeIf { it.isNotBlank() }?.let { put("notes", it) }
            put("countryCode", request.countryCode)
            put("country_code", request.countryCode)
        }

        // Fail closed: a timeout, non-JSON response or incomplete issuance
        // must not be replaced with a locally signed/issued prescription.
        val accessToken = supabaseClient.auth.currentSessionOrNull()?.accessToken
            ?: throw IllegalStateException("Sesión autenticada requerida para emitir la receta")
        val endpoint = BuildConfig.SUPABASE_URL.trimEnd('/') + "/functions/v1/issue-prescription"
        val (httpCode, responseText) = withContext(Dispatchers.IO) {
            val body = issuePayload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            val req = Request.Builder()
                .url(endpoint)
                .header("Authorization", "Bearer $accessToken")
                .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                .header("Accept", "application/json")
                .post(body)
                .build()
            eventualHttpClient.newCall(req).execute().use { resp ->
                resp.code to resp.body?.string().orEmpty()
            }
        }
        val responseObj = runCatching { Json.parseToJsonElement(responseText) as? JsonObject }.getOrNull()
            ?: throw IllegalStateException("El servicio de recetas devolvió una respuesta inválida (HTTP $httpCode)")
        if (httpCode !in 200..299 || responseObj["success"]?.jsonPrimitive?.contentOrNull != "true") {
            val errorObj = responseObj["error"]
            val errorCode = responseObj["code"]?.jsonPrimitive?.contentOrNull
                ?: (errorObj as? JsonObject)?.get("message")?.jsonPrimitive?.contentOrNull
                ?: (errorObj as? JsonObject)?.get("code")?.jsonPrimitive?.contentOrNull
                ?: (errorObj as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull
            val details = responseObj["details"]?.jsonPrimitive?.contentOrNull
                ?: (errorObj as? JsonObject)?.get("details")?.jsonPrimitive?.contentOrNull
            val friendlyMessage = when (errorCode) {
                "REFEPS_REQUIRED" -> "Complete su código REFEPS en el perfil médico para emitir recetas en Argentina."
                "DOCTOR_COUNTRY_MISMATCH", "ARGENTINE_LICENSE_REQUIRED", "doctor_country_mismatch" ->
                    "La matrícula y país del profesional no habilitan esta emisión."
                "br_doctor_cpf_required", "BR_DOCTOR_CPF_REQUIRED" ->
                    "Registre um CPF válido no seu perfil médico para emitir receitas no Brasil."
                "br_cfm_license_required", "CRM_UF_REQUIRED" ->
                    "Valide seu CRM e UF junto ao CFM para emitir receitas no Brasil."
                "br_special_prescription_provider_required" ->
                    "Este medicamento ou modelo exige emissão via Memed (ICP-Brasil)."
                "br_patient_cpf_required" ->
                    "Se requiere un CPF válido del paciente para emitir en Brasil."
                "patient_identity_consent_required" ->
                    "Registre o consentimento LGPD do paciente antes de emitir."
                "missing_professional_address" ->
                    "Complete su domicilio profesional en Perfil → Firma digital."
                "missing_patient_identification", "missing_patient_address" ->
                    "Faltan datos de identificación o domicilio del paciente."
                "digital_signature_required", "digital_signature_failed" ->
                    "Active o renueve su certificado de firma digital profesional antes de emitir."
                "farmalink_mapping_failed" ->
                    if (!details.isNullOrBlank()) {
                        "Faltan datos requeridos para Farmalink ($details). Verificá tu perfil médico y los datos del paciente."
                    } else {
                        "Faltan datos requeridos para Farmalink. Verificá tu perfil médico y los datos del paciente."
                    }
                "farmalink_rejected" -> "Farmalink rechazó la solicitud de alta de receta."
                "farmalink_registration_failed" -> "No se pudo registrar la receta en Farmalink; intentá nuevamente."
                "farmalink_missing_config", "farmalink_governance_disabled" ->
                    "La emisión vía Farmalink no está habilitada en el servidor."
                "farmalink_pending_reconciliation" ->
                    "Emisión pendiente de conciliación con Farmalink; no reintente sin verificar."
                null -> "El servicio de recetas no confirmó el registro (HTTP $httpCode)"
                else -> "El servicio de recetas rechazó la emisión ($errorCode)"
            }
            throw IllegalStateException(friendlyMessage)
        }
        val targetObj = responseObj["data"] as? JsonObject
            ?: throw IllegalStateException("El servicio de recetas no devolvió un documento")
        val prescriptionId = targetObj["id"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Falta el identificador del documento")
        val finalCuir = targetObj["cuir"]?.jsonPrimitive?.contentOrNull
            ?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Falta la referencia del servidor")
        val finalPdfUrl = targetObj["signed_pdf_url"]?.jsonPrimitive?.contentOrNull
        val finalStatus = targetObj["status"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Falta el estado del documento")
        require(finalStatus in setOf("sent", "active") && !finalPdfUrl.isNullOrBlank()) {
            "La receta no tiene una emisión confirmada por el servicio"
        }
        val finalQr = targetObj["qr_code_content"]?.jsonPrimitive?.contentOrNull

        // 6. Resolve patient info for returning the fully hydrated Prescription
        val (patientNameMap, patientDniMap) = resolvePatientsInfo(listOf(actualPatientId))
        val (doctorNameMap, doctorLicenseMap) = resolveDoctorsInfo(listOf(doctor.id))

        Prescription(
            id = prescriptionId,
            status = finalStatus,
            cuir = finalCuir,
            signedPdfUrl = finalPdfUrl,
            qrCodeContent = finalQr,
            medicationName = firstItem.medicationName,
            dosage = firstItem.dosage,
            frequency = firstItem.frequency,
            instructions = firstItem.instructions,
            doctorName = doctorNameMap[doctor.id],
            doctorLicense = doctorLicenseMap[doctor.id] ?: doctor.licenseNumber,
            createdAt = now,
            countryCode = request.countryCode,
            duration = firstItem.duration,
            diagnosis = request.diagnosis,
            notes = request.notes,
            prescribedDate = now,
            patientName = patientNameMap[actualPatientId],
            patientDni = patientDniMap[actualPatientId],
            items = request.items,
        )
    }.onFailure {
        SecureLog.error("[Prescriptions] Failed creating prescription", it)
    }

    override suspend fun cancelPrescription(prescriptionId: String, reason: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val trimmedReason = reason.trim()
            require(trimmedReason.isNotBlank()) { "Motivo clínico de cancelación obligatorio" }
            require(prescriptionId.isNotBlank()) { "Identificador de receta inválido" }

            val accessToken = supabaseClient.auth.currentSessionOrNull()?.accessToken
                ?: throw IllegalStateException("Sesión autenticada requerida")
            val baseUrl = BuildConfig.WEB_API_URL.trimEnd('/')
            val url = "$baseUrl/api/doctors/prescriptions/${java.net.URLEncoder.encode(prescriptionId, "UTF-8")}"
            val payload = buildJsonObject {
                put("status", "cancelada")
                put("cancellation_reason", trimmedReason)
            }.toString()

            val req = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $accessToken")
                .header("Origin", baseUrl)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .patch(payload.toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()

            eventualHttpClient.newCall(req).execute().use { resp ->
                val raw = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    val root = runCatching { Json.parseToJsonElement(raw).jsonObject }.getOrNull()
                    val errorObj = root?.get("error")
                    val message = (errorObj as? JsonObject)?.get("message")?.jsonPrimitive?.contentOrNull
                        ?: (errorObj as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull
                        ?: root?.get("message")?.jsonPrimitive?.contentOrNull
                        ?: "No se pudo cancelar la receta (HTTP ${resp.code})"
                    throw IllegalStateException(message)
                }
            }
            Unit
        }.onFailure {
            SecureLog.error("[Prescriptions] Failed cancelling prescription $prescriptionId", it)
        }
    }

    override suspend fun getEligiblePatients(): Result<List<PrescriptionPatientItem>> = runCatching {
        val doctorId = resolveDoctorId()

        // 1. From doctor_patient table
        val linkedPatientIds = runCatching {
            supabaseClient.postgrest
                .from("doctor_patient")
                .select(Columns.list("patient_id")) {
                    filter { eq("doctor_id", doctorId) }
                }
                .decodeList<DoctorPatientLinkDto>()
                .map { it.patientId }
        }.getOrElse { emptyList() }

        // 2. From recent appointments
        val appointmentPatientIds = runCatching {
            supabaseClient.postgrest
                .from("appointments")
                .select(Columns.list("patient_id")) {
                    filter { eq("doctor_id", doctorId) }
                    limit(50)
                }
                .decodeList<AppointmentPatientLinkDto>()
                .mapNotNull { it.patientId }
        }.getOrElse { emptyList() }

        // 3. From patient_care_team
        val careTeamPatientIds = runCatching {
            supabaseClient.postgrest
                .from("patient_care_team")
                .select(Columns.list("patient_id")) {
                    filter { eq("doctor_id", doctorId) }
                    limit(50)
                }
                .decodeList<CareTeamPatientLinkDto>()
                .map { it.patientId }
        }.getOrElse { emptyList() }

        // 4. Only server-linked pharmacy patients, never guesses by DNI/CPF.
        val dispatchPatientIds = runCatching {
            supabaseClient.postgrest.from("pharmacy_dispatch_requests")
                .select(Columns.list("patient_id")) {
                    filter {
                        eq("assigned_doctor_id", doctorId)
                        isIn("status", listOf("matched", "in_call", "transferring", "transferred", "completed"))
                    }
                    limit(30)
                }.decodeList<DispatchPatientLinkDto>().mapNotNull { it.patientId }
        }.getOrDefault(emptyList())

        val allPatientIds = (linkedPatientIds + appointmentPatientIds + careTeamPatientIds + dispatchPatientIds).distinct()

        // Never expose arbitrary patients when there are no care relationships.
        if (allPatientIds.isEmpty()) return@runCatching emptyList()
        val patients = supabaseClient.postgrest
            .from("patients")
            .select(Columns.list("id", "user_id", "dni", "birth_date")) {
                filter { isIn("id", allPatientIds) }
            }.decodeList<PatientRecordDto>()

        if (patients.isEmpty()) return@runCatching emptyList()

        val userIds = patients.mapNotNull { it.userId }.distinct()
        val profiles = if (userIds.isNotEmpty()) {
            try {
                supabaseClient.postgrest
                    .from("profiles")
                    .select(Columns.list("user_id", "first_name", "last_name", "avatar_url", "phone", "email")) {
                        filter { isIn("user_id", userIds) }
                    }
                    .decodeList<DoctorProfileDto>()
                    .associateBy { it.userId }
            } catch (e: Exception) {
                emptyMap()
            }
        } else emptyMap()

        val eventualByPatientId = fetchEventualPatientsMap()

        patients.map { pat ->
            val prof = pat.userId?.let { profiles[it] }
            val ev = eventualByPatientId[pat.id]
            val fullName = if (prof != null) {
                listOfNotNull(prof.firstName?.trim(), prof.lastName?.trim())
                    .filter { it.isNotEmpty() }
                    .joinToString(" ")
            } else {
                ev?.fullName.orEmpty()
            }
            val contact = prof?.phone?.takeIf { it.isNotBlank() }
                ?: prof?.email?.takeIf { it.isNotBlank() }
                ?: ev?.contact
            PrescriptionPatientItem(
                patientId = pat.id,
                fullName = fullName.ifBlank { "Paciente #${pat.id.take(6)}" },
                dni = pat.dni?.takeIf { it.isNotBlank() } ?: ev?.dni,
                birthDate = pat.birthDate?.takeIf { it.isNotBlank() } ?: ev?.birthDate,
                avatarUrl = prof?.avatarUrl?.takeIf { it.isNotBlank() } ?: ev?.avatarUrl,
                contact = contact,
                coverageName = ev?.coverageName,
            )
        }.sortedBy { it.fullName }
    }.onFailure {
        SecureLog.error("[Prescriptions] Failed fetching eligible patients", it)
    }

    private val eventualHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    private suspend fun fetchEventualPatientsMap(): Map<String, PrescriptionPatientItem> = withContext(Dispatchers.IO) {
        runCatching {
            val accessToken = supabaseClient.auth.currentSessionOrNull()?.accessToken ?: return@withContext emptyMap()
            val url = BuildConfig.WEB_API_URL.trimEnd('/') + "/api/doctors/patients/eventual"
            val req = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $accessToken")
                .header("Accept", "application/json")
                .get()
                .build()
            eventualHttpClient.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@use emptyMap()
                val raw = resp.body?.string().orEmpty()
                val root = Json.parseToJsonElement(raw).jsonObject
                val arr = root["data"] as? JsonArray ?: return@use emptyMap()
                arr.mapNotNull { el ->
                    val obj = el as? JsonObject ?: return@mapNotNull null
                    val pid = obj["patientId"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                    val name = obj["fullName"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                    PrescriptionPatientItem(
                        patientId = pid,
                        fullName = name,
                        dni = obj["dni"]?.jsonPrimitive?.contentOrNull,
                        birthDate = obj["birthDate"]?.jsonPrimitive?.contentOrNull,
                        contact = obj["contact"]?.jsonPrimitive?.contentOrNull,
                        coverageName = obj["coverageName"]?.jsonPrimitive?.contentOrNull,
                        avatarUrl = obj["avatarUrl"]?.jsonPrimitive?.contentOrNull,
                    )
                }.associateBy { it.patientId }
            }
        }.getOrDefault(emptyMap())
    }

    override suspend fun registerOrLookupEventualPatient(
        documentNumber: String,
        gender: String,
        contact: String,
        fullNameFallback: String?,
    ): Result<PrescriptionPatientItem> = withContext(Dispatchers.IO) {
        runCatching {
            val cleanDoc = documentNumber.filter(Char::isDigit)
            require(cleanDoc.length in 7..11) {
                "Ingrese un DNI (7-8 dígitos) o CPF (11 dígitos) válido"
            }
            val cleanContact = contact.trim()
            require(cleanContact.isNotBlank()) {
                "Ingrese el WhatsApp o correo electrónico de la persona para enviarle el documento"
            }
            val accessToken = supabaseClient.auth.currentSessionOrNull()?.accessToken
                ?: throw IllegalStateException("Sesión autenticada requerida")
            val baseUrl = BuildConfig.WEB_API_URL.trimEnd('/')
            val url = "$baseUrl/api/doctors/patients/eventual"
            val payload = buildJsonObject {
                put("documentNumber", cleanDoc)
                put("gender", gender)
                put("contact", cleanContact)
                if (!fullNameFallback.isNullOrBlank()) {
                    put("fullName", fullNameFallback.trim())
                }
                put("consentAccepted", true)
                put("careCountryConfirmed", true)
            }.toString()

            val req = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $accessToken")
                .header("Origin", baseUrl)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .post(payload.toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()

            eventualHttpClient.newCall(req).execute().use { resp ->
                val raw = resp.body?.string().orEmpty()
                val root = runCatching { Json.parseToJsonElement(raw).jsonObject }.getOrNull()
                if (!resp.isSuccessful) {
                    val errObj = root?.get("error")
                    val code = when (errObj) {
                        is JsonObject -> errObj["code"]?.jsonPrimitive?.contentOrNull
                            ?: errObj["message"]?.jsonPrimitive?.contentOrNull
                        else -> errObj?.jsonPrimitive?.contentOrNull
                            ?: root?.get("message")?.jsonPrimitive?.contentOrNull
                    }.orEmpty()
                    if (code.contains("eventual_patient_name_invalid") || code.contains("eventual_patient_name_required")) {
                        throw IllegalArgumentException("NEED_MANUAL_NAME")
                    }
                    if (code.contains("eventual_patient_dni_invalid")) {
                        throw IllegalArgumentException("El DNI debe tener 7 u 8 dígitos numéricos")
                    }
                    if (code.contains("eventual_patient_cpf_invalid")) {
                        throw IllegalArgumentException("El CPF ingresado no es válido")
                    }
                    if (code.contains("eventual_patient_contact_invalid")) {
                        throw IllegalArgumentException("Ingrese un número de WhatsApp (ej: +54911...) o correo válido")
                    }
                    throw IllegalStateException("No se pudo vincular por DNI ($code)")
                }
                val data = root?.get("data")?.jsonObject
                    ?: throw IllegalStateException("Respuesta inválida del servidor")
                val patientId = data["patientId"]?.jsonPrimitive?.contentOrNull
                    ?: throw IllegalStateException("Falta patientId en la respuesta")
                val resolvedName = data["fullName"]?.jsonPrimitive?.contentOrNull
                    ?.takeIf { it.isNotBlank() }
                    ?: fullNameFallback?.trim()?.takeIf { it.isNotBlank() }
                    ?: "Paciente DNI $cleanDoc"
                PrescriptionPatientItem(
                    patientId = patientId,
                    fullName = resolvedName,
                    dni = data["dni"]?.jsonPrimitive?.contentOrNull ?: cleanDoc,
                    birthDate = data["birthDate"]?.jsonPrimitive?.contentOrNull,
                    avatarUrl = data["avatarUrl"]?.jsonPrimitive?.contentOrNull,
                    contact = data["contact"]?.jsonPrimitive?.contentOrNull ?: cleanContact,
                    coverageName = data["coverageName"]?.jsonPrimitive?.contentOrNull,
                )
            }
        }
    }

    override suspend fun getDoctorEligibility(): Result<DoctorEligibility> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No authenticated user ID found")

        val doctor = supabaseClient.postgrest
            .from("doctors")
            .select(Columns.list("id", "license_number", "license_type", "uf_brazil", "care_country", "active")) {
                filter { eq("user_id", userId) }
            }
            .decodeSingleOrNull<DoctorRecordDto>()
            ?: throw IllegalStateException("Perfil médico no encontrado")

        val countryCode = InCallDocumentPolicy.doctorCountry(
            doctor.licenseType, doctor.careCountry, doctor.ufBrazil,
        )
        val hasLicense = !doctor.licenseNumber.isNullOrBlank() && doctor.active
        if (countryCode == "BR") {
            val crmNumber = doctor.licenseNumber.orEmpty().filter(Char::isDigit)
            val uf = doctor.ufBrazil?.uppercase().orEmpty()
            val licenses = supabaseClient.postgrest.from("doctor_licenses")
                .select(Columns.list(
                    "license_number", "license_type", "uf_brazil", "status",
                    "cfm_validation_status", "cfm_evidence_path", "cfm_review_notes",
                    "cfm_reviewed_by", "cfm_reviewed_at", "cfm_last_checked_at",
                )) {
                    filter {
                        eq("doctor_id", doctor.id)
                        eq("license_type", "CRM")
                        eq("status", "active")
                        eq("cfm_validation_status", "valid")
                    }
                }.decodeList<CfmLicenseEligibilityDto>()
            val verified = hasLicense && doctor.licenseType.equals("CRM", ignoreCase = true) &&
                crmNumber.isNotBlank() && uf.matches(Regex("^[A-Z]{2}$")) &&
                licenses.any { license ->
                    license.licenseNumber.orEmpty().filter(Char::isDigit) == crmNumber &&
                        license.ufBrazil?.uppercase() == uf &&
                        !license.evidencePath.isNullOrBlank() &&
                        (license.reviewNotes?.trim()?.length ?: 0) >= 10 &&
                        !license.reviewedBy.isNullOrBlank() &&
                        !license.reviewedAt.isNullOrBlank() &&
                        !license.lastCheckedAt.isNullOrBlank()
                }
            return@runCatching DoctorEligibility(
                isEligible = verified,
                doctorLicense = doctor.licenseNumber,
                validationStatus = if (verified) "valid" else "pending_review",
                reason = if (verified) null else "Validação CRM/UF no CFM pendente",
                countryCode = "BR",
            )
        }

        if (countryCode != "AR") {
            return@runCatching DoctorEligibility(
                isEligible = false,
                doctorLicense = doctor.licenseNumber,
                validationStatus = "unsupported_jurisdiction",
                reason = "Jurisdição profissional não habilitada para atestados",
                countryCode = countryCode,
            )
        }

        val validationStatus = supabaseClient.postgrest
            .from("profiles")
            .select(Columns.list("sss_validation_status")) {
                filter { eq("user_id", userId) }
            }
            .decodeSingleOrNull<DoctorProfileValidationDto>()
            ?.sssValidationStatus
        val isStatusValid = validationStatus.equals("valid", ignoreCase = true) ||
            validationStatus.equals("exempt", ignoreCase = true)
        val isEligible = hasLicense && isStatusValid
        DoctorEligibility(
            isEligible = isEligible,
            doctorLicense = doctor.licenseNumber,
            validationStatus = validationStatus,
            reason = when {
                !hasLicense -> "Matrícula profesional no registrada en el perfil"
                !isStatusValid -> "Validación profesional SISA / REFEPS pendiente (Decreto 63/2024)"
                else -> null
            },
            countryCode = "AR",
        )
    }.onFailure {
        SecureLog.error("[Prescriptions] Failed checking doctor eligibility", it)
    }

    /**
     * A pharmacy guest's name/DNI alone never grants access. The link must
     * already exist on the server before the doctor attempts a document.
     */
    private suspend fun requireDoctorPatientAccess(doctorId: String, patientId: String) {
        val linked = runCatching {
            supabaseClient.postgrest.from("doctor_patient")
                .select(Columns.list("patient_id")) {
                    filter { eq("doctor_id", doctorId); eq("patient_id", patientId) }
                    limit(1)
                }.decodeSingleOrNull<DoctorPatientLinkDto>() != null
        }.getOrDefault(false)
        val careTeam = runCatching {
            supabaseClient.postgrest.from("patient_care_team")
                .select(Columns.list("patient_id")) {
                    filter { eq("doctor_id", doctorId); eq("patient_id", patientId); eq("active", true) }
                    limit(1)
                }.decodeSingleOrNull<CareTeamPatientLinkDto>() != null
        }.getOrDefault(false)
        val appointment = runCatching {
            supabaseClient.postgrest.from("appointments")
                .select(Columns.list("patient_id")) {
                    filter { eq("doctor_id", doctorId); eq("patient_id", patientId) }
                    limit(1)
                }.decodeSingleOrNull<AppointmentPatientLinkDto>() != null
        }.getOrDefault(false)
        val verifiedDispatch = runCatching {
            supabaseClient.postgrest.from("pharmacy_dispatch_requests")
                .select(Columns.list("patient_id")) {
                    filter {
                        eq("assigned_doctor_id", doctorId)
                        eq("patient_id", patientId)
                        isIn("status", listOf("matched", "in_call", "transferring", "transferred", "completed"))
                    }
                    limit(1)
                }.decodeSingleOrNull<CareTeamPatientLinkDto>() != null
        }.getOrDefault(false)
        check(linked || careTeam || appointment || verifiedDispatch) {
            "No existe relación asistencial verificada con este paciente"
        }
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
            SecureLog.error("[Prescriptions] Failed loading patients info", e)
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
                SecureLog.error("[Prescriptions] Failed loading patient profiles", e)
                emptyList()
            }
        } else {
            emptyList()
        }

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

    private fun parseClinicalData(element: JsonElement?): ParsedClinicalData {
        if (element == null) {
            return ParsedClinicalData(medicationName = "Prescripción Médica")
        }

        val obj = element as? JsonObject ?: return ParsedClinicalData(medicationName = "Prescripción Médica")

        val directName = obj["medication_name"]?.jsonPrimitive?.contentOrNull
            ?: obj["medicationName"]?.jsonPrimitive?.contentOrNull
            ?: obj["drug_name"]?.jsonPrimitive?.contentOrNull
            ?: obj["name"]?.jsonPrimitive?.contentOrNull
        val directDosage = obj["dosage"]?.jsonPrimitive?.contentOrNull ?: ""
        val directFrequency = obj["frequency"]?.jsonPrimitive?.contentOrNull ?: ""
        val directDuration = obj["duration"]?.jsonPrimitive?.contentOrNull ?: ""
        val directInstructions = obj["instructions"]?.jsonPrimitive?.contentOrNull
            ?: obj["directions"]?.jsonPrimitive?.contentOrNull ?: ""
        val directDiagnosis = obj["diagnosis"]?.jsonPrimitive?.contentOrNull
        val directNotes = obj["notes"]?.jsonPrimitive?.contentOrNull
        val directPrescribedDate = obj["prescribed_date"]?.jsonPrimitive?.contentOrNull
            ?: obj["start_date"]?.jsonPrimitive?.contentOrNull

        // Parse items array if present
        val parsedItems = mutableListOf<PrescriptionItem>()
        val itemsArray = obj["items"] as? JsonArray
        if (itemsArray != null) {
            for (itemElem in itemsArray) {
                val itemObj = itemElem as? JsonObject ?: continue
                val medName = itemObj["name"]?.jsonPrimitive?.contentOrNull
                    ?: itemObj["generic_name"]?.jsonPrimitive?.contentOrNull
                    ?: itemObj["trade_name"]?.jsonPrimitive?.contentOrNull
                    ?: ""
                val generic = itemObj["generic_name"]?.jsonPrimitive?.contentOrNull ?: ""
                val dosage = itemObj["dosage"]?.jsonPrimitive?.contentOrNull ?: ""
                val freq = itemObj["frequency"]?.jsonPrimitive?.contentOrNull ?: ""
                val dur = itemObj["duration"]?.jsonPrimitive?.contentOrNull ?: ""
                val instr = itemObj["instructions"]?.jsonPrimitive?.contentOrNull ?: ""
                if (medName.isNotBlank()) {
                    parsedItems.add(
                        PrescriptionItem(
                            medicationName = medName.trim(),
                            genericName = generic.trim(),
                            dosage = dosage.trim(),
                            frequency = freq.trim(),
                            duration = dur.trim(),
                            instructions = instr.trim(),
                        )
                    )
                }
            }
        }

        if (parsedItems.isNotEmpty()) {
            val first = parsedItems.first()
            return ParsedClinicalData(
                medicationName = first.medicationName,
                dosage = first.dosage,
                frequency = first.frequency,
                duration = first.duration.ifBlank { directDuration },
                instructions = first.instructions.ifBlank { directInstructions },
                diagnosis = directDiagnosis?.trim()?.takeIf { it.isNotEmpty() },
                notes = directNotes?.trim()?.takeIf { it.isNotEmpty() },
                prescribedDate = directPrescribedDate?.trim()?.takeIf { it.isNotEmpty() },
                items = parsedItems,
            )
        }

        if (!directName.isNullOrBlank()) {
            val fallbackItem = PrescriptionItem(
                medicationName = directName.trim(),
                dosage = directDosage.trim(),
                frequency = directFrequency.trim(),
                duration = directDuration.trim(),
                instructions = directInstructions.trim(),
            )
            return ParsedClinicalData(
                medicationName = directName.trim(),
                dosage = directDosage.trim(),
                frequency = directFrequency.trim(),
                duration = directDuration.trim(),
                instructions = directInstructions.trim(),
                diagnosis = directDiagnosis?.trim()?.takeIf { it.isNotEmpty() },
                notes = directNotes?.trim()?.takeIf { it.isNotEmpty() },
                prescribedDate = directPrescribedDate?.trim()?.takeIf { it.isNotEmpty() },
                items = listOf(fallbackItem),
            )
        }

        // Medications array fallback
        val medicationsArray = obj["medications"] as? JsonArray
        val firstMed = medicationsArray?.firstOrNull() as? JsonObject
        if (firstMed != null) {
            val name = firstMed["name"]?.jsonPrimitive?.contentOrNull
                ?: firstMed["medication_name"]?.jsonPrimitive?.contentOrNull
            val dosage = firstMed["dosage"]?.jsonPrimitive?.contentOrNull ?: ""
            val frequency = firstMed["frequency"]?.jsonPrimitive?.contentOrNull ?: ""
            val duration = firstMed["duration"]?.jsonPrimitive?.contentOrNull ?: directDuration
            val instructions = firstMed["instructions"]?.jsonPrimitive?.contentOrNull ?: ""
            if (!name.isNullOrBlank()) {
                val medItem = PrescriptionItem(
                    medicationName = name.trim(),
                    dosage = dosage.trim(),
                    frequency = frequency.trim(),
                    duration = duration.trim(),
                    instructions = instructions.trim(),
                )
                return ParsedClinicalData(
                    medicationName = name.trim(),
                    dosage = dosage.trim(),
                    frequency = frequency.trim(),
                    duration = duration.trim(),
                    instructions = instructions.trim(),
                    diagnosis = directDiagnosis?.trim()?.takeIf { it.isNotEmpty() },
                    notes = directNotes?.trim()?.takeIf { it.isNotEmpty() },
                    prescribedDate = directPrescribedDate?.trim()?.takeIf { it.isNotEmpty() },
                    items = listOf(medItem),
                )
            }
        }

        return ParsedClinicalData(
            medicationName = "Prescripción Médica",
            dosage = directDosage,
            frequency = directFrequency,
            duration = directDuration,
            instructions = directInstructions,
            diagnosis = directDiagnosis?.trim()?.takeIf { it.isNotEmpty() },
            notes = directNotes?.trim()?.takeIf { it.isNotEmpty() },
            prescribedDate = directPrescribedDate?.trim()?.takeIf { it.isNotEmpty() },
        )
    }

    private data class ParsedClinicalData(
        val medicationName: String,
        val dosage: String = "",
        val frequency: String = "",
        val duration: String = "",
        val instructions: String = "",
        val diagnosis: String? = null,
        val notes: String? = null,
        val prescribedDate: String? = null,
        val items: List<PrescriptionItem> = emptyList(),
    )

    @Serializable
    private data class RecordIdDto(val id: String)

    @Serializable
    private data class MemedPrescriptionRowDto(
        val id: String,
        @SerialName("doctor_id") val doctorId: String,
        @SerialName("patient_id") val patientId: String,
        @SerialName("memed_id") val memedId: String,
        val status: String = "verified_at_provider",
        @SerialName("provider_data") val providerData: JsonElement? = null,
        @SerialName("digital_link_data") val digitalLinkData: JsonElement? = null,
        @SerialName("created_at") val createdAt: String,
    )

    private fun JsonObject.memedString(vararg keys: String): String? =
        keys.firstNotNullOfOrNull { key -> this[key]?.jsonPrimitive?.contentOrNull?.takeIf(String::isNotBlank) }

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
        @SerialName("avatar_url") val avatarUrl: String? = null,
        val phone: String? = null,
        val email: String? = null,
    )

    @Serializable
    private data class CfmLicenseEligibilityDto(
        @SerialName("license_number") val licenseNumber: String? = null,
        @SerialName("uf_brazil") val ufBrazil: String? = null,
        @SerialName("cfm_evidence_path") val evidencePath: String? = null,
        @SerialName("cfm_review_notes") val reviewNotes: String? = null,
        @SerialName("cfm_reviewed_by") val reviewedBy: String? = null,
        @SerialName("cfm_reviewed_at") val reviewedAt: String? = null,
        @SerialName("cfm_last_checked_at") val lastCheckedAt: String? = null,
    )

    @Serializable
    private data class DoctorProfileValidationDto(
        @SerialName("sss_validation_status") val sssValidationStatus: String? = null,
    )

    @Serializable
    private data class DoctorPatientLinkDto(
        @SerialName("patient_id") val patientId: String,
    )

    @Serializable
    private data class AppointmentPatientLinkDto(
        @SerialName("patient_id") val patientId: String? = null,
    )

    @Serializable
    private data class CareTeamPatientLinkDto(
        @SerialName("patient_id") val patientId: String,
    )

    @Serializable
    private data class DispatchPatientLinkDto(
        @SerialName("patient_id") val patientId: String? = null,
    )

    @Serializable
    private data class PatientRecordDto(
        val id: String,
        @SerialName("user_id") val userId: String? = null,
        val dni: String? = null,
        @SerialName("birth_date") val birthDate: String? = null,
    )
}
