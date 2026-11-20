package com.autamedica.android.data.repository

/** medical_chats.specialist_id references reproductive_health_specialists.id. */
internal data class MedicalChatRecordFilter(val columnName: String, val recordId: String)

internal object MedicalChatQueryFilter {
    fun forChats(role: String, patientId: String?, specialistId: String?) = resolve(role, patientId, specialistId)
    fun forUnreadCount(role: String, patientId: String?, specialistId: String?) = resolve(role, patientId, specialistId)

    private fun resolve(role: String, patientId: String?, specialistId: String?): MedicalChatRecordFilter? {
        val id = if (role == "doctor") specialistId else patientId
        if (id.isNullOrBlank()) return null
        return MedicalChatRecordFilter(if (role == "doctor") "specialist_id" else "patient_id", id)
    }
}
