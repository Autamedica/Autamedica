package com.autamedica.android.presentation.health

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PreventiveHealthContentTest {

    @Test
    fun `normalize preventive gender only accepts supported values`() {
        assertThat(normalizePreventiveGender("female")).isEqualTo(PreventiveGender.Female)
        assertThat(normalizePreventiveGender("Masculino")).isEqualTo(PreventiveGender.Male)
        assertThat(normalizePreventiveGender("prefer_not_to_say")).isNull()
        assertThat(normalizePreventiveGender("non_binary")).isNull()
    }

    @Test
    fun `recommended screenings include female preventive cancer controls`() {
        val screenings = getRecommendedPreventiveScreenings(
            age = 52,
            gender = PreventiveGender.Female,
        )

        assertThat(screenings.map { it.id }).contains("mammography")
        assertThat(screenings.map { it.id }).contains("colonoscopy")
        assertThat(screenings.map { it.id }).doesNotContain("psa")
        assertThat(screenings.first().urgency).isEqualTo(PreventiveUrgency.High)
    }

    @Test
    fun `recommended screenings exclude future controls for younger male patient`() {
        val screenings = getRecommendedPreventiveScreenings(
            age = 20,
            gender = PreventiveGender.Male,
        )

        assertThat(screenings.map { it.id }).contains("blood-pressure")
        assertThat(screenings.map { it.id }).contains("skin-exam")
        assertThat(screenings.map { it.id }).doesNotContain("colonoscopy")
        assertThat(screenings.map { it.id }).doesNotContain("psa")
    }

    @Test
    fun `next milestone respects gender filtered data`() {
        val nextMilestone = getNextPreventiveMilestone(
            currentAge = 48,
            gender = PreventiveGender.Female,
        )

        assertThat(nextMilestone).isEqualTo(50)
        assertThat(getScreeningsStartingAtAge(50, PreventiveGender.Female).map { it.id })
            .containsAtLeast("mammography", "colonoscopy")
    }

    @Test
    fun `normalize preventive gender accepts portuguese inputs`() {
        assertThat(normalizePreventiveGender("Feminino")).isEqualTo(PreventiveGender.Female)
        assertThat(normalizePreventiveGender("mulher")).isEqualTo(PreventiveGender.Female)
        assertThat(normalizePreventiveGender("homem")).isEqualTo(PreventiveGender.Male)
    }

    @Test
    fun `portuguese localization translates categories, screenings, and education items`() {
        assertThat(PreventiveGender.Female.localizedLabel(isPortuguese = true)).isEqualTo("Feminino")
        assertThat(PreventiveCategory.Cancer.localizedLabel(isPortuguese = true)).isEqualTo("Rastreamento de Câncer")
        assertThat(PreventiveCategory.Bone.localizedLabel(isPortuguese = true)).isEqualTo("Saúde Óssea")
        assertThat(PreventiveCoverage.Variable.localizedLabel(isPortuguese = true)).isEqualTo("Variável")

        val allScreenings = getRecommendedPreventiveScreenings(65, PreventiveGender.Female) +
            getRecommendedPreventiveScreenings(65, PreventiveGender.Male)
        allScreenings.distinctBy { it.id }.forEach { screening ->
            val pt = screening.localized(isPortuguese = true)
            assertThat(pt.description).doesNotContain("Medicion")
            assertThat(pt.description).doesNotContain("Analisis")
            assertThat(pt.frequency).doesNotContain("anos")
        }

        val papPt = getRecommendedPreventiveScreenings(35, PreventiveGender.Female)
            .first { it.id == "pap-test" }
            .localized(isPortuguese = true)
        assertThat(papPt.name).isEqualTo("Papanicolau (Preventivo)")
        assertThat(papPt.frequency).isEqualTo("A cada 3 anos")

        val eduPt = getPreventiveEducationItems(isPortuguese = true)
        assertThat(eduPt).hasSize(4)
        assertThat(eduPt.first().title).isEqualTo("Vacinas em dia")
        assertThat(eduPt.joinToString(" ") { it.title + " " + it.description }).doesNotContain("chequeos")
    }
}
