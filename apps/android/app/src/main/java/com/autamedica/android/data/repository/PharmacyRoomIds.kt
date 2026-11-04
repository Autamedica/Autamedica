package com.autamedica.android.data.repository

import java.util.UUID

/**
 * Opaque, unguessable room identifiers. Never embed a DNI, CPF, phone number
 * or any other patient-supplied identifier in the room name.
 */
internal fun opaquePharmacyRoomId(tier: String): String {
    val allowedTiers = setOf(
        "general", "cardiologia", "salud_mental", "pediatria", "dermatologia",
        "traumatologia", "salud_femenina", "oftalmo_otorrino", "neumonologia",
        "gastroenterologia", "urologia", "endocrinologia",
    )
    val safeTier = tier.lowercase().takeIf { it in allowedTiers } ?: "general"
    return "cf-room-$safeTier-${UUID.randomUUID().toString().replace("-", "")}"
}
