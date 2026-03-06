package com.autamedica.android.presentation.health

import com.autamedica.android.domain.model.AnamnesisSection
import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.domain.repository.HealthRepository
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
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
    var sections = AnamnesisSection.SECTION_ORDER.mapIndexed { index, section ->
        AnamnesisSection(
            id = "section-$index",
            anamnesisId = summary.id,
            section = section,
            data = emptyMap(),
            completed = false,
            completedAt = null,
            updatedAt = summary.updatedAt,
        )
    }
    var saveCallCount = 0
    var completeCallCount = 0
    var submitCallCount = 0

    override suspend fun getAnamnesisSummary(): Result<AnamnesisSummary?> = Result.success(summary)

    override suspend fun getOrCreateAnamnesis(): Result<AnamnesisSummary> = Result.success(summary)

    override suspend fun getAnamnesisSections(anamnesisId: String): Result<List<AnamnesisSection>> =
        Result.success(sections.filter { it.anamnesisId == anamnesisId })

    override suspend fun saveSection(
        anamnesisId: String,
        section: String,
        data: Map<String, String>,
    ): Result<Unit> = Result.success(Unit).also {
        saveCallCount++
        sections = sections.map {
            if (it.anamnesisId == anamnesisId && it.section == section) {
                it.copy(data = data, updatedAt = "2026-03-06T10:01:00Z")
            } else {
                it
            }
        }
    }

    override suspend fun completeSection(anamnesisId: String, section: String): Result<Unit> = Result.success(Unit).also {
        completeCallCount++
        sections = sections.map {
            if (it.anamnesisId == anamnesisId && it.section == section) {
                it.copy(
                    completed = true,
                    completedAt = "2026-03-06T10:02:00Z",
                    updatedAt = "2026-03-06T10:02:00Z",
                )
            } else {
                it
            }
        }
    }

    override suspend fun submitAnamnesis(anamnesisId: String): Result<Unit> = Result.success(Unit).also {
        submitCallCount++
        summary = summary.copy(
            status = "under_review",
            locked = true,
            completionPercentage = 100,
            updatedAt = "2026-03-06T10:03:00Z",
        )
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class AnamnesisFormViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var fakeRepository: FakeHealthRepository

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        fakeRepository = FakeHealthRepository()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `invalid personal info does not save section`() = runTest(testDispatcher.scheduler) {
        val viewModel = AnamnesisFormViewModel(fakeRepository)

        viewModel.saveAndNext()

        assertThat(fakeRepository.saveCallCount).isEqualTo(0)
        assertThat(viewModel.uiState.value.fieldErrors).containsKey("emergency_contact_name")
        assertThat(viewModel.uiState.value.fieldErrors).containsKey("emergency_contact_phone")
        assertThat(viewModel.uiState.value.error).contains("contacto de emergencia")
    }

    @Test
    fun `valid personal info saves and advances to next section`() = runTest(testDispatcher.scheduler) {
        val viewModel = AnamnesisFormViewModel(fakeRepository)

        viewModel.updateField("emergency_contact_name", "Maria Perez")
        viewModel.updateField("emergency_contact_phone", "+54 11 5555 1111")
        viewModel.saveAndNext()

        assertThat(fakeRepository.saveCallCount).isEqualTo(1)
        assertThat(fakeRepository.completeCallCount).isEqualTo(1)
        assertThat(viewModel.uiState.value.currentSectionIndex).isEqualTo(1)
        assertThat(viewModel.uiState.value.sections.first().completed).isTrue()
    }

    @Test
    fun `read only anamnesis blocks editing and saving`() = runTest(testDispatcher.scheduler) {
        fakeRepository.summary = fakeRepository.summary.copy(status = "under_review", locked = true)
        val viewModel = AnamnesisFormViewModel(fakeRepository)
        val initialValues = viewModel.uiState.value.fieldValues

        viewModel.updateField("emergency_contact_name", "Otro Nombre")
        viewModel.saveAndNext()

        assertThat(viewModel.uiState.value.fieldValues).isEqualTo(initialValues)
        assertThat(fakeRepository.saveCallCount).isEqualTo(0)
        assertThat(viewModel.uiState.value.error).contains("revision")
    }

    @Test
    fun `submit blocks when a completed section is clinically empty`() = runTest(testDispatcher.scheduler) {
        fakeRepository.sections = fakeRepository.sections.map {
            it.copy(
                completed = true,
                data = validDataForSection(it.section),
                completedAt = "2026-03-06T10:02:00Z",
            )
        }.map {
            if (it.section == "personal_info") it.copy(data = emptyMap()) else it
        }

        val viewModel = AnamnesisFormViewModel(fakeRepository)
        viewModel.submitAnamnesis()

        assertThat(fakeRepository.submitCallCount).isEqualTo(0)
        assertThat(viewModel.uiState.value.error).contains("Datos Personales")
    }

    @Test
    fun `submit sends anamnesis only when all sections remain valid`() = runTest(testDispatcher.scheduler) {
        fakeRepository.sections = fakeRepository.sections.map {
            it.copy(
                completed = true,
                data = validDataForSection(it.section),
                completedAt = "2026-03-06T10:02:00Z",
            )
        }
        fakeRepository.summary = fakeRepository.summary.copy(completionPercentage = 100)

        val viewModel = AnamnesisFormViewModel(fakeRepository)
        viewModel.submitAnamnesis()

        assertThat(fakeRepository.submitCallCount).isEqualTo(1)
        assertThat(viewModel.uiState.value.submitted).isTrue()
        assertThat(viewModel.uiState.value.summary?.status).isEqualTo("under_review")
        assertThat(viewModel.uiState.value.summary?.locked).isTrue()
    }

    private fun validDataForSection(section: String): Map<String, String> = when (section) {
        "personal_info" -> mapOf(
            "emergency_contact_name" to "Maria Perez",
            "emergency_contact_phone" to "+54 11 5555 1111",
        )
        "allergies" -> mapOf("medication_allergies" to "Ninguna")
        "current_medications" -> mapOf("medications" to "Ninguno")
        "medical_conditions" -> mapOf("chronic_conditions" to "Ninguna")
        "surgical_history" -> mapOf("surgeries" to "Ninguna")
        "family_history" -> mapOf("cardiovascular" to "Sin antecedentes familiares conocidos")
        "lifestyle" -> mapOf(
            "smoking" to "No fumador",
            "alcohol" to "No consume",
            "exercise" to "Camina 3 veces por semana",
            "sleep" to "7 horas por noche",
        )
        else -> mapOf("notes" to "Completo")
    }
}
