package com.autamedica.android.presentation.health

import com.autamedica.android.domain.model.AnamnesisSection
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AnamnesisLocalizationTest {

    @Test
    fun `canonical sections provide portuguese labels and hints while preserving keys`() {
        AnamnesisSection.CANONICAL_SECTIONS.forEach { section ->
            val ptName = AnamnesisSection.displayName(section, isPortuguese = true)
            val ptSubtitle = AnamnesisSection.subtitle(section, isPortuguese = true)
            val ptCategory = AnamnesisSection.category(section, isPortuguese = true)
            val ptShort = AnamnesisSection.shortLabel(section, isPortuguese = true)

            assertThat(ptName).isNotEmpty()
            assertThat(ptSubtitle).isNotEmpty()
            assertThat(ptCategory).isNotEmpty()
            assertThat(ptShort).isNotEmpty()

            val esFields = getSectionFieldDefinitions(section, isPortuguese = false)
            val ptFields = getSectionFieldDefinitions(section, isPortuguese = true)
            assertThat(ptFields.map { it.key }).isEqualTo(esFields.map { it.key })

            esFields.zip(ptFields).forEach { (esField, ptField) ->
                assertThat(ptField.type).isEqualTo(esField.type)
                assertThat(ptField.required).isEqualTo(esField.required)
                assertThat(ptField.dependsOnKey).isEqualTo(esField.dependsOnKey)
                assertThat(ptField.dependsOnValue).isEqualTo(esField.dependsOnValue)
                assertThat(ptField.options.map { it.value }).isEqualTo(esField.options.map { it.value })
                assertThat(ptField.label).doesNotContain("¿")
                ptField.options.forEach { option ->
                    assertThat(option.label).doesNotContain("Ningun")
                }
            }

            val ptHint = getSectionValidationHint(section, isPortuguese = true)
            assertThat(ptHint).isNotNull()
            assertThat(ptHint).doesNotContain("Completá")
            assertThat(ptHint).doesNotContain("Describí")
        }
    }

    @Test
    fun `validation returns portuguese field and section errors when isPortuguese is true`() {
        val result = validateSection("edad", emptyMap(), isPortuguese = true)
        assertThat(result.isValid).isFalse()
        assertThat(result.fieldErrors["emergency_contact_name"]).isEqualTo("Este campo é obrigatório.")
        assertThat(result.message).isEqualTo("Preencha pelo menos o contato de emergência antes de continuar.")

        val badPhone = validateSection(
            "edad",
            mapOf("emergency_contact_name" to "Maria", "emergency_contact_phone" to "123"),
            isPortuguese = true,
        )
        assertThat(badPhone.isValid).isFalse()
        assertThat(badPhone.fieldErrors["emergency_contact_phone"])
            .isEqualTo("Informe um telefone válido para emergências.")
    }

    @Test
    fun `summary section localization matches key pt-BR terms`() {
        assertThat(AnamnesisSection.displayName("resumen_final", isPortuguese = true)).isEqualTo("Resumo Final")
        assertThat(AnamnesisSection.displayName("enfermedades_previas", isPortuguese = true)).isEqualTo("Doenças Prévias")
        assertThat(AnamnesisSection.displayName("antecedentes_familiares", isPortuguese = true)).isEqualTo("Histórico Familiar")
        assertThat(AnamnesisSection.shortLabel("resumen_final", isPortuguese = true)).isEqualTo("Resumo")
    }
}
