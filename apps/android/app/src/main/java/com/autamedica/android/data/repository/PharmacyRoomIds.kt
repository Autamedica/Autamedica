package com.autamedica.android.data.repository

import java.util.UUID

/**
 * Opaque, unguessable room identifiers. Never embed a DNI, CPF, phone number
 * or any other patient-supplied identifier in the room name.
 */
internal fun opaquePharmacyRoomId(tier: String): String {
    val safeTier = tier.lowercase().replace(Regex("[^a-z0-9_-]"), "")
        .take(24).ifBlank { "general" }
    return "cf-room-$safeTier-${UUID.randomUUID().toString().replace("-", "")}"
}
