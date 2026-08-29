package com.autamedica.android.presentation.health

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.autamedica.android.domain.model.AnamnesisSection
import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.domain.repository.HealthRepository
import org.junit.Rule
import org.junit.Test

private class FakeHealthRepository : HealthRepository {
    var summary = AnamnesisSummary(
        id = "anamnesis-1",
        status = "in_progress",
        completionPercentage = 0,
        locked = false,
        updatedAt = "2026-03-06T10:00:00Z",
        completedSections = 0,
        totalSections = AnamnesisSection.SECTION_ORDER.size,
    )
    var sections = AnamnesisSection.SECTION_ORDER.mapIndexed { index, sectionName ->
        AnamnesisSection(
            id = "section-$index",
            anamnesisId = summary.id,
            section = sectionName,
            data = emptyMap(),
            completed = false,
            completedAt = null,
            updatedAt = summary.updatedAt,
        )
    }

    override suspend fun getAnamnesisSummary(): Result<AnamnesisSummary?> = Result.success(summary)
    override suspend fun getPreventiveProfile(): Result<com.autamedica.android.domain.model.PatientPreventiveProfile> =
        Result.success(com.autamedica.android.domain.model.PatientPreventiveProfile(patientId = "patient-1", birthDate = "1996-06-10", gender = "male"))
    override suspend fun getOrCreateAnamnesis(): Result<AnamnesisSummary> = Result.success(summary)
    override suspend fun getAnamnesisSections(anamnesisId: String): Result<List<AnamnesisSection>> =
        Result.success(sections.filter { it.anamnesisId == anamnesisId })

    override suspend fun saveSection(
        anamnesisId: String,
        section: String,
        data: Map<String, String>,
    ): Result<Unit> {
        sections = sections.map {
            if (it.anamnesisId == anamnesisId && it.section == section) {
                it.copy(data = data)
            } else {
                it
            }
        }
        return Result.success(Unit)
    }

    override suspend fun completeSection(anamnesisId: String, section: String): Result<Unit> {
        sections = sections.map {
            if (it.anamnesisId == anamnesisId && it.section == section) {
                it.copy(completed = true)
            } else {
                it
            }
        }
        return Result.success(Unit)
    }

    override suspend fun submitAnamnesis(anamnesisId: String): Result<Unit> {
        summary = summary.copy(
            status = "under_review",
            locked = true,
            completionPercentage = 100,
        )
        return Result.success(Unit)
    }
}

class AnamnesisFormScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun testAnamnesisScreen_initialLoad_showsPersonalInfo() {
        val fakeRepo = FakeHealthRepository()
        val viewModel = AnamnesisFormViewModel(fakeRepo)

        composeTestRule.setContent {
            AnamnesisFormScreen(
                onBack = {},
                viewModel = viewModel
            )
        }

        // Verify the title of the first section "Datos Personales" (personal_info) is displayed
        composeTestRule.onNodeWithText("Datos Personales").assertIsDisplayed()
        composeTestRule.onNodeWithText("Contacto de Emergencia *").assertIsDisplayed()
        composeTestRule.onNodeWithText("Telefono de Emergencia *").assertIsDisplayed()
    }

    @Test
    fun testAnamnesisScreen_invalidFields_showsValidationErrorsOnNext() {
        val fakeRepo = FakeHealthRepository()
        val viewModel = AnamnesisFormViewModel(fakeRepo)

        composeTestRule.setContent {
            AnamnesisFormScreen(
                onBack = {},
                viewModel = viewModel
            )
        }

        // Tap "Siguiente" without filling emergency contact name or phone
        composeTestRule.onNodeWithText("Siguiente").performClick()

        // Verify validation error is displayed
        composeTestRule.onNodeWithText("Complete al menos el contacto de emergencia antes de continuar.").assertIsDisplayed()
    }

    @Test
    fun testAnamnesisScreen_validFields_savesAndAdvances() {
        val fakeRepo = FakeHealthRepository()
        val viewModel = AnamnesisFormViewModel(fakeRepo)

        composeTestRule.setContent {
            AnamnesisFormScreen(
                onBack = {},
                viewModel = viewModel
            )
        }

        // Fill required fields
        composeTestRule.onNodeWithText("Contacto de Emergencia *").performTextInput("Maria Perez")
        composeTestRule.onNodeWithText("Telefono de Emergencia *").performTextInput("+541155551111")

        // Tap "Siguiente"
        composeTestRule.onNodeWithText("Siguiente").performClick()

        // Verify it advanced to the next section: "Alergias" (allergies)
        composeTestRule.onNodeWithText("Alergias").assertIsDisplayed()
        // Verify we can go back
        composeTestRule.onNodeWithText("Anterior").assertIsDisplayed()
    }

    @Test
    fun testAnamnesisScreen_saveOnBack_preservesEnteredData() {
        val fakeRepo = FakeHealthRepository()
        val viewModel = AnamnesisFormViewModel(fakeRepo)

        composeTestRule.setContent {
            AnamnesisFormScreen(
                onBack = {},
                viewModel = viewModel
            )
        }

        // Fill required fields and advance to Step 2 (Alergias)
        composeTestRule.onNodeWithText("Contacto de Emergencia *").performTextInput("Maria Perez")
        composeTestRule.onNodeWithText("Telefono de Emergencia *").performTextInput("+541155551111")
        composeTestRule.onNodeWithText("Siguiente").performClick()

        composeTestRule.onNodeWithText("Alergias").assertIsDisplayed()

        // Input allergies
        composeTestRule.onNodeWithText("Alergias a Medicamentos").performTextInput("Penicilina")

        // Go back (Anterior)
        composeTestRule.onNodeWithText("Anterior").performClick()

        // Verify we are back to "Datos Personales"
        composeTestRule.onNodeWithText("Datos Personales").assertIsDisplayed()

        // Go forward again to see if the allergen data was preserved (saved on back)
        composeTestRule.onNodeWithText("Siguiente").performClick()
        composeTestRule.onNodeWithText("Alergias").assertIsDisplayed()
        composeTestRule.onNodeWithText("Penicilina").assertIsDisplayed()
    }

    @Test
    fun testAnamnesisScreen_readOnlyMode_disablesEditing() {
        val fakeRepo = FakeHealthRepository().apply {
            summary = summary.copy(status = "under_review", locked = true)
        }
        val viewModel = AnamnesisFormViewModel(fakeRepo)

        composeTestRule.setContent {
            AnamnesisFormScreen(
                onBack = {},
                viewModel = viewModel
            )
        }

        // Verify read-only notice is displayed
        composeTestRule.onNodeWithText("La anamnesis ya fue enviada y esta en revision. No se permiten cambios.").assertIsDisplayed()

        // Verify input fields are disabled/not enabled
        composeTestRule.onNodeWithText("Contacto de Emergencia *").assertIsNotEnabled()
        composeTestRule.onNodeWithText("Telefono de Emergencia *").assertIsNotEnabled()

        // Verify bottom actions indicate read-only status instead of action button
        composeTestRule.onNodeWithText("Solo lectura").assertIsDisplayed()
    }
}
