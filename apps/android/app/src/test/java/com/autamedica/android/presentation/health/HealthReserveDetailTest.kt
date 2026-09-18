package com.autamedica.android.presentation.health

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class HealthReserveDetailTest {

    @Test
    fun `calculateEstimatedArs calculates realistic healthcare market equivalents`() {
        assertThat(calculateEstimatedArs(0)).isEqualTo(0)
        assertThat(calculateEstimatedArs(22)).isEqualTo(3_300)
        assertThat(calculateEstimatedArs(55)).isEqualTo(8_250)
        assertThat(calculateEstimatedArs(60)).isEqualTo(9_000)
        assertThat(calculateEstimatedArs(100)).isEqualTo(15_000)
        assertThat(calculateEstimatedArs(600)).isEqualTo(90_000)
    }

    @Test
    fun `calculateProgressFraction calculates fraction and clamps safely`() {
        assertThat(calculateProgressFraction(0, 600)).isEqualTo(0f)
        assertThat(calculateProgressFraction(300, 600)).isEqualTo(0.5f)
        assertThat(calculateProgressFraction(600, 600)).isEqualTo(1f)
        assertThat(calculateProgressFraction(750, 600)).isEqualTo(1f)
        assertThat(calculateProgressFraction(-50, 600)).isEqualTo(0f)
        assertThat(calculateProgressFraction(100, 0)).isEqualTo(0f)
    }

    @Test
    fun `getPlanByTier resolves canonical plans accurately`() {
        val freePlan = getPlanByTier("free")
        assertThat(freePlan.tierKey).isEqualTo("free")
        assertThat(freePlan.priceMonthlyArs).isEqualTo(0)
        assertThat(freePlan.monthlyCredits).isEqualTo(0)
        assertThat(freePlan.maxCapCredits).isEqualTo(0)

        val cuidadoPlan = getPlanByTier("cuidado")
        assertThat(cuidadoPlan.tierKey).isEqualTo("cuidado")
        assertThat(cuidadoPlan.priceMonthlyArs).isEqualTo(4_990)
        assertThat(cuidadoPlan.monthlyCredits).isEqualTo(22)
        assertThat(cuidadoPlan.maxCapCredits).isEqualTo(600)
        assertThat(cuidadoPlan.isPopular).isTrue()

        val familiarPlan = getPlanByTier("familiar")
        assertThat(familiarPlan.tierKey).isEqualTo("familiar")
        assertThat(familiarPlan.priceMonthlyArs).isEqualTo(12_990)
        assertThat(familiarPlan.monthlyCredits).isEqualTo(66)
        assertThat(familiarPlan.maxCapCredits).isEqualTo(1_800)

        // Case insensitivity
        assertThat(getPlanByTier("CUIDADO").tierKey).isEqualTo("cuidado")
        assertThat(getPlanByTier("Familiar").tierKey).isEqualTo("familiar")

        // Unknown defaults to first plan (Free)
        assertThat(getPlanByTier("unknown_tier").tierKey).isEqualTo("free")
    }

    @Test
    fun `defaultReservePlans contains exactly Free, Cuidado and Familiar with faithful features`() {
        assertThat(defaultReservePlans).hasSize(3)

        val tiers = defaultReservePlans.map { it.tierKey }
        assertThat(tiers).containsExactly("free", "cuidado", "familiar").inOrder()

        val free = defaultReservePlans[0]
        val cuidado = defaultReservePlans[1]
        val familiar = defaultReservePlans[2]

        // Free plan: no reserve
        val freeReserveFeature = free.features.firstOrNull { it.label.contains("Reserva") }
        assertThat(freeReserveFeature?.included).isFalse()

        // Cuidado plan: 1 consultation included + 22 monthly credits accrual
        val cuidadoAccrualFeature = cuidado.features.firstOrNull { it.label.contains("Usa o Acumula") }
        assertThat(cuidadoAccrualFeature?.included).isTrue()
        assertThat(cuidado.monthlyCredits).isEqualTo(22)

        // Familiar plan: shared coverage for up to 4 members + 66 credits
        val familiarCoverageFeature = familiar.features.firstOrNull { it.label.contains("4 integrantes") }
        assertThat(familiarCoverageFeature?.included).isTrue()
        assertThat(familiar.monthlyCredits).isEqualTo(66)
    }

    @Test
    fun `defaultBenefitCategories contains specialists, labs and pharmacy with canonical redemption costs`() {
        assertThat(defaultBenefitCategories).hasSize(3)

        val keys = defaultBenefitCategories.map { it.categoryKey }
        assertThat(keys).containsExactly("specialists", "labs", "pharmacy").inOrder()

        val specialists = defaultBenefitCategories[0]
        assertThat(specialists.creditsCost).isEqualTo(100)
        assertThat(specialists.referenceMarketPriceArs).isEqualTo(15_000)
        assertThat(specialists.title).contains("Especialistas")

        val labs = defaultBenefitCategories[1]
        assertThat(labs.creditsCost).isEqualTo(60)
        assertThat(labs.referenceMarketPriceArs).isEqualTo(9_000)
        assertThat(labs.title).contains("Laboratorios")

        val pharmacy = defaultBenefitCategories[2]
        assertThat(pharmacy.creditsCost).isEqualTo(55)
        assertThat(pharmacy.referenceMarketPriceArs).isEqualTo(8_000)
        assertThat(pharmacy.title).contains("Farmacia")
    }

    @Test
    fun `formatCredits formats numbers with thousands separators`() {
        val formatted = formatCredits(1800)
        assertThat(formatted).contains("1.800")
    }

    @Test
    fun `formatArs formats currency without decimals`() {
        val formatted = formatArs(15000)
        assertThat(formatted).contains("15.000")
        assertThat(formatted).contains("$")
    }

    @Test
    fun `calculateEstimatedBrl calculates realistic Brazilian healthcare equivalents`() {
        assertThat(calculateEstimatedBrl(0)).isEqualTo(0.0)
        assertThat(calculateEstimatedBrl(22)).isEqualTo(33.0)
        assertThat(calculateEstimatedBrl(55)).isEqualTo(82.5)
        assertThat(calculateEstimatedBrl(60)).isEqualTo(90.0)
        assertThat(calculateEstimatedBrl(100)).isEqualTo(150.0)
        assertThat(calculateEstimatedBrl(600)).isEqualTo(900.0)
    }

    @Test
    fun `formatEstimatedValue branches accurately between Argentina and Brazil`() {
        val arsFormatted = formatEstimatedValue(22, isBrazil = false)
        assertThat(arsFormatted).contains("3.300")
        assertThat(arsFormatted).contains("$")

        val brlFormatted = formatEstimatedValue(22, isBrazil = true)
        assertThat(brlFormatted).contains("R$")
        assertThat(brlFormatted).contains("33")
    }

    @Test
    fun `defaultReservePlansBrazil contains faithful Brazilian plans and features in Reais`() {
        assertThat(defaultReservePlansBrazil).hasSize(3)

        val tiers = defaultReservePlansBrazil.map { it.tierKey }
        assertThat(tiers).containsExactly("free", "cuidado", "familiar").inOrder()

        val cuidadoBrazil = defaultReservePlansBrazil[1]
        assertThat(cuidadoBrazil.priceFormatted).isEqualTo("R$ 49,90 / mês via Pix")
        assertThat(cuidadoBrazil.monthlyCredits).isEqualTo(22)
        assertThat(cuidadoBrazil.maxCapCredits).isEqualTo(600)
        assertThat(cuidadoBrazil.isPopular).isTrue()

        // Brazilian plan contains "Use ou Acumule"
        val accrualFeature = cuidadoBrazil.features.firstOrNull { it.label.contains("Use ou Acumule") }
        assertThat(accrualFeature?.included).isTrue()
    }

    @Test
    fun `getPlanByTier resolves Brazilian plans when isBrazil is true`() {
        val plan = getPlanByTier("cuidado", isBrazil = true)
        assertThat(plan.tierKey).isEqualTo("cuidado")
        assertThat(plan.priceFormatted).isEqualTo("R$ 49,90 / mês via Pix")
        assertThat(plan.badgeText).isEqualTo("Mais Escolhido")
    }

    @Test
    fun `defaultBenefitCategoriesBrazil contains specialists, labs and pharmacy in Reais`() {
        assertThat(defaultBenefitCategoriesBrazil).hasSize(3)

        val keys = defaultBenefitCategoriesBrazil.map { it.categoryKey }
        assertThat(keys).containsExactly("specialists", "labs", "pharmacy").inOrder()

        val specialists = defaultBenefitCategoriesBrazil[0]
        assertThat(specialists.creditsCost).isEqualTo(100)
        assertThat(specialists.referenceMarketPriceFormatted).isEqualTo("R$ 150,00")

        val labs = defaultBenefitCategoriesBrazil[1]
        assertThat(labs.creditsCost).isEqualTo(60)
        assertThat(labs.referenceMarketPriceFormatted).isEqualTo("R$ 90,00")

        val pharmacy = defaultBenefitCategoriesBrazil[2]
        assertThat(pharmacy.creditsCost).isEqualTo(55)
        assertThat(pharmacy.referenceMarketPriceFormatted).isEqualTo("R$ 80,00")
    }
}
