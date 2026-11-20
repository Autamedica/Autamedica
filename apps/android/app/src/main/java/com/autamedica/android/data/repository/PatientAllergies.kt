package com.autamedica.android.data.repository

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Normalizes JSONB allergy arrays, structured objects and legacy strings for the patient chart. */
internal fun normalizePatientAllergies(value: JsonElement?): String? {
    if (value == null) return null
    val normalized = linkedSetOf<String>()
    fun collect(element: JsonElement) {
        when (element) {
            is JsonArray -> element.forEach(::collect)
            is JsonObject -> {
                val preferred = listOf("name", "allergen", "allergy", "label", "value", "description", "text")
                    .firstNotNullOfOrNull { key -> element[key] }
                if (preferred != null) collect(preferred) else element.values.forEach(::collect)
            }
            is JsonPrimitive -> if (element.isString) {
                element.content.trim().takeIf(String::isNotEmpty)?.let(normalized::add)
            }
        }
    }
    collect(value)
    return normalized.joinToString(", ").ifBlank { null }
}
