package com.autamedica.android.data.repository

import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.domain.model.CreatePrescriptionRequest
import com.autamedica.android.domain.model.DoctorEligibility
import com.autamedica.android.domain.model.InCallDocumentPolicy
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.model.PrescriptionItem
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.domain.repository.PrescriptionRepository
import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.ktor.client.statement.bodyAsText
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
                duration = clinical.duration,
                diagnosis = clinical.diagnosis,
                notes = clinical.notes,
                prescribedDate = clinical.prescribedDate ?: row.createdAt,
                items = clinical.items,
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
        require(request.items.size <= 3) { "Máximo 3 medicamentos por receta según normativa" }
        require(request.diagnosis.isNotBlank()) { "Diagnóstico clínico requerido" }
        require(InCallDocumentPolicy.canUseNativePrescriptionIssuer(request.countryCode)) {
            "La emisión de recetas BR requiere Memed; no se puede utilizar el emisor Android genérico"
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
        check(doctor.active && InCallDocumentPolicy.doctorCountry(
            doctor.licenseType, doctor.careCountry, doctor.ufBrazil,
        ) == request.countryCode) {
            "País y matrícula profesional no coinciden o el médico está inactivo"
        }
        val professionalEligibility = getDoctorEligibility().getOrElse {
            throw IllegalStateException("No se pudo verificar la habilitación profesional", it)
        }
        check(professionalEligibility.isEligible) {
            professionalEligibility.reason ?: "El profesional no está habilitado para registrar recetas"
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
                    put("trade_name", item.medicationName)
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
        val response = supabaseClient.functions("issue-prescription", issuePayload)
        val responseText = response.bodyAsText()
        val responseObj = Json.parseToJsonElement(responseText) as? JsonObject
            ?: throw IllegalStateException("El servicio de recetas devolvió una respuesta inválida")
        if (responseObj["success"]?.jsonPrimitive?.contentOrNull != "true") {
            throw IllegalStateException("El servicio de recetas no confirmó el registro")
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
        require(finalStatus == "sent" && !finalPdfUrl.isNullOrBlank()) {
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

    override suspend fun cancelPrescription(prescriptionId: String, reason: String): Result<Unit> = runCatching {
        require(reason.isNotBlank()) { "Motivo clínico de cancelación obligatorio" }

        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No authenticated user ID found")

        val now = Instant.now().toString()

        val updatePayload = buildJsonObject {
            put("status", "cancelled")
            put("updated_at", now)
        }

        supabaseClient.postgrest
            .from("prescriptions")
            .update(updatePayload) {
                filter { eq("id", prescriptionId) }
            }

        runCatching {
            val auditPayload = buildJsonObject {
                put("id", UUID.randomUUID().toString())
                put("prescription_id", prescriptionId)
                put("event_type", "cancelled")
                put("user_id", userId)
                put("timestamp", now)
                put("user_agent", "AutaMedica-Android/1.2.7")
            }
            supabaseClient.postgrest.from("prescription_audit_events").insert(auditPayload)
        }
        Unit
    }.onFailure {
        SecureLog.error("[Prescriptions] Failed cancelling prescription $prescriptionId", it)
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
                    .select(Columns.list("user_id", "first_name", "last_name")) {
                        filter { isIn("user_id", userIds) }
                    }
                    .decodeList<DoctorProfileDto>()
                    .associateBy { it.userId }
            } catch (e: Exception) {
                emptyMap()
            }
        } else emptyMap()

        patients.map { pat ->
            val prof = pat.userId?.let { profiles[it] }
            val fullName = if (prof != null) {
                listOfNotNull(prof.firstName?.trim(), prof.lastName?.trim())
                    .filter { it.isNotEmpty() }
                    .joinToString(" ")
            } else ""
            PrescriptionPatientItem(
                patientId = pat.id,
                fullName = fullName.ifBlank { "Paciente #${pat.id.take(6)}" },
                dni = pat.dni,
                birthDate = pat.birthDate,
            )
        }.sortedBy { it.fullName }
    }.onFailure {
        SecureLog.error("[Prescriptions] Failed fetching eligible patients", it)
    }

    override suspend fun getDoctorEligibility(): Result<DoctorEligibility> = runCatching {
        val userId = securePreferences.getString(SecurePreferences.KEY_USER_ID)
            ?: throw IllegalStateException("No authenticated user ID found")

        val doctor = supabaseClient.postgrest
            .from("doctors")
            .select(Columns.list("id", "license_number")) {
                filter { eq("user_id", userId) }
            }
            .decodeSingleOrNull<DoctorRecordDto>()
            ?: throw IllegalStateException("Perfil médico no encontrado")

        val validationStatus = runCatching {
            supabaseClient.postgrest
                .from("profiles")
                .select(Columns.list("sss_validation_status")) {
                    filter { eq("user_id", userId) }
                }
                .decodeSingleOrNull<DoctorProfileValidationDto>()
                ?.sssValidationStatus
        }.getOrNull()

        val hasLicense = !doctor.licenseNumber.isNullOrBlank()
        val isStatusValid = validationStatus.equals("valid", ignoreCase = true) ||
                validationStatus.equals("exempt", ignoreCase = true)

        val isEligible = hasLicense && isStatusValid

        val reason = when {
            !hasLicense -> "Matrícula profesional no registrada en el perfil"
            !isStatusValid -> "Validación profesional SISA / REFEPS pendiente (Decreto 63/2024)"
            else -> null
        }

        DoctorEligibility(
            isEligible = isEligible,
            doctorLicense = doctor.licenseNumber,
            validationStatus = validationStatus,
            reason = reason,
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
