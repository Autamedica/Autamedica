package com.autamedica.android.presentation.health

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.LocalHospital
import androidx.compose.material.icons.outlined.Vaccines
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.AuWarning
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PrimaryContainer
import com.autamedica.android.presentation.theme.PrimaryLight
import com.autamedica.android.presentation.theme.Secondary
import com.autamedica.android.presentation.theme.SecondaryContainer
import com.autamedica.android.presentation.theme.SuccessContainer
import com.autamedica.android.presentation.theme.Tertiary
import com.autamedica.android.presentation.theme.TertiaryContainer
import com.autamedica.android.presentation.theme.WarningContainer

private enum class PreventiveHealthTab {
    Calculator,
    Timeline,
    Education;

    fun localizedLabel(isPortuguese: Boolean): String = when (this) {
        Calculator -> "Calculadora"
        Timeline -> if (isPortuguese) "Cronologia" else "Cronología"
        Education -> if (isPortuguese) "Educação" else "Educación"
    }
}

private data class PreventiveStatCard(
    val title: String,
    val value: String,
    val helper: String,
    val accentColor: Color,
    val containerColor: Color,
)

private data class PreventivePalette(
    val container: Color,
    val border: Color,
    val accent: Color,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PreventiveHealthScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: PreventiveHealthViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var selectedTab by rememberSaveable { mutableStateOf(PreventiveHealthTab.Calculator.name) }
    var draftAge by rememberSaveable { mutableStateOf("") }
    var draftGenderKey by rememberSaveable { mutableStateOf("") }
    var calculatedAge by rememberSaveable { mutableStateOf<Int?>(null) }
    var calculatedGenderKey by rememberSaveable { mutableStateOf("") }
    var isFormCollapsed by rememberSaveable { mutableStateOf(false) }
    var didBootstrapFromProfile by rememberSaveable { mutableStateOf(false) }

    val expandedScreenings = remember { mutableStateMapOf<String, Boolean>() }
    val expandedMilestones = remember { mutableStateMapOf<Int, Boolean>() }

    LaunchedEffect(uiState.connectedAge, uiState.connectedGender, didBootstrapFromProfile) {
        val connectedAge = uiState.connectedAge
        val connectedGender = uiState.connectedGender
        if (!didBootstrapFromProfile &&
            connectedAge != null &&
            connectedGender != null &&
            draftAge.isBlank() &&
            draftGenderKey.isBlank()
        ) {
            draftAge = connectedAge.toString()
            draftGenderKey = connectedGender.key
            calculatedAge = connectedAge
            calculatedGenderKey = connectedGender.key
            isFormCollapsed = true
            didBootstrapFromProfile = true
        }
    }

    val isPortuguese = isPortugueseUi()
    val activeTab = PreventiveHealthTab.valueOf(selectedTab)
    val calculatedGender = PreventiveGender.fromKey(calculatedGenderKey)
    val draftGender = PreventiveGender.fromKey(draftGenderKey)
    val recommendedScreenings = if (calculatedAge != null && calculatedGender != null) {
        getRecommendedPreventiveScreenings(calculatedAge ?: 0, calculatedGender)
    } else {
        emptyList()
    }

    val urgentCount = recommendedScreenings.count { it.urgency == PreventiveUrgency.High }
    val mediumCount = recommendedScreenings.count { it.urgency == PreventiveUrgency.Medium }
    val referenceAge = calculatedAge ?: draftAge.toIntOrNull()
    val referenceGender = calculatedGender ?: draftGender
    val nextMilestone = getNextPreventiveMilestone(referenceAge, referenceGender)

    val stats = listOf(
        PreventiveStatCard(
            title = healthText("Controles sugeridos", "Exames sugeridos"),
            value = if (recommendedScreenings.isEmpty()) "--" else recommendedScreenings.size.toString(),
            helper = healthText("Según edad y género", "Conforme idade e sexo"),
            accentColor = AuAccent,
            containerColor = AuSurface,
        ),
        PreventiveStatCard(
            title = healthText("Prioritarios", "Prioritários"),
            value = if (recommendedScreenings.isEmpty()) "--" else urgentCount.toString(),
            helper = healthText("Requieren más atención", "Requerem mais atenção"),
            accentColor = AuDanger,
            containerColor = ErrorContainer,
        ),
        PreventiveStatCard(
            title = healthText("Próximo hito", "Próximo marco"),
            value = nextMilestone?.let {
                if (isPortuguese) "$it anos" else "$it años"
            } ?: "--",
            helper = healthText("Siguiente cambio de screening", "Próxima mudança de rastreamento"),
            accentColor = AuWarning,
            containerColor = WarningContainer,
        ),
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = healthText("Salud Preventiva", "Saúde Preventiva"),
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = healthText("Volver", "Voltar"),
                            tint = AuTextPrimary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AuBackground),
            )
        },
        containerColor = AuBackground,
        modifier = modifier,
    ) { innerPadding ->
        if (uiState.isLoading && uiState.profile == null && uiState.error == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = AuAccent, strokeWidth = 2.dp)
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                HeroCard()
            }

            item {
                when {
                    uiState.error != null -> ErrorBanner(
                        message = uiState.error ?: healthText(
                            es = "No se pudo cargar el perfil preventivo.",
                            pt = "Não foi possível carregar o perfil preventivo.",
                        ),
                        onRetry = viewModel::refresh,
                    )
                    uiState.isProfileReady -> InfoBanner(
                        title = healthText("Perfil conectado", "Perfil conectado"),
                        message = healthText(
                            es = "Chequeos calculados a partir de tu fecha de nacimiento y género.",
                            pt = "Exames calculados a partir da sua data de nascimento e sexo.",
                        ),
                    )
                    else -> InfoBanner(
                        title = healthText("Completá tu perfil", "Complete seu perfil"),
                        message = healthText(
                            es = "Completá tu fecha de nacimiento y género para personalizar tus chequeos, o calculalos manualmente.",
                            pt = "Preencha sua data de nascimento e sexo para personalizar seus exames ou calcule manualmente.",
                        ),
                    )
                }
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    stats.chunked(2).forEach { row ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            row.forEach { stat ->
                                PreventiveStatCardView(
                                    card = stat,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            if (row.size == 1) {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }

            item {
                TabSelector(
                    selectedTab = activeTab,
                    onSelect = { selectedTab = it.name },
                )
            }

            item {
                when (activeTab) {
                    PreventiveHealthTab.Calculator -> CalculatorTabContent(
                        draftAge = draftAge,
                        draftGender = draftGender,
                        calculatedAge = calculatedAge,
                        calculatedGender = calculatedGender,
                        isFormCollapsed = isFormCollapsed,
                        recommendedScreenings = recommendedScreenings,
                        urgentCount = urgentCount,
                        mediumCount = mediumCount,
                        expandedScreenings = expandedScreenings,
                        onAgeChange = { draftAge = it.filter(Char::isDigit).take(3) },
                        onGenderSelected = { draftGenderKey = it.key },
                        onCalculate = {
                            val safeAge = draftAge.toIntOrNull()
                            val safeGender = PreventiveGender.fromKey(draftGenderKey)
                            if (safeAge != null && safeAge in 1..120 && safeGender != null) {
                                calculatedAge = safeAge
                                calculatedGenderKey = safeGender.key
                                isFormCollapsed = true
                            }
                        },
                        onToggleForm = { isFormCollapsed = !isFormCollapsed },
                    )

                    PreventiveHealthTab.Timeline -> TimelineTabContent(
                        currentAge = referenceAge,
                        gender = referenceGender,
                        expandedMilestones = expandedMilestones,
                    )

                    PreventiveHealthTab.Education -> EducationTabContent()
                }
            }
        }
    }
}

@Composable
private fun HeroCard(modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                modifier = Modifier.size(56.dp),
                shape = CircleShape,
                color = SuccessContainer,
            ) {
                Icon(
                    imageVector = Icons.Outlined.HealthAndSafety,
                    contentDescription = null,
                    tint = AuAccent,
                    modifier = Modifier.padding(14.dp),
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = healthText(
                        es = "Chequeos y vacunas según tu edad",
                        pt = "Exames e vacinas de acordo com sua idade",
                    ),
                    style = MaterialTheme.typography.headlineMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = healthText(
                        es = "Revisá los controles de salud recomendados para tu edad y género.",
                        pt = "Confira os controles de saúde recomendados para sua idade e sexo.",
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextSecondary,
                )
            }
        }
    }
}

@Composable
private fun InfoBanner(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = PrimaryContainer,
        border = BorderStroke(1.dp, PrimaryLight.copy(alpha = 0.35f)),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = Icons.Outlined.Info,
                contentDescription = null,
                tint = PrimaryLight,
            )
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
            }
        }
    }
}

@Composable
private fun ErrorBanner(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = ErrorContainer,
        border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.35f)),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = healthText(
                    es = "No pudimos conectar tu perfil preventivo",
                    pt = "Não foi possível conectar seu perfil preventivo",
                ),
                style = MaterialTheme.typography.titleSmall,
                color = AuTextPrimary,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
            TextButton(onClick = onRetry) {
                Text(stringResource(com.autamedica.android.R.string.common_retry))
            }
        }
    }
}

@Composable
private fun PreventiveStatCardView(
    card: PreventiveStatCard,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = card.containerColor,
        border = BorderStroke(1.dp, card.accentColor.copy(alpha = 0.2f)),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = card.title,
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
            Text(
                text = card.value,
                style = MaterialTheme.typography.headlineMedium,
                color = card.accentColor,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = card.helper,
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
            )
        }
    }
}

@Composable
private fun TabSelector(
    selectedTab: PreventiveHealthTab,
    onSelect: (PreventiveHealthTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val isPortuguese = isPortugueseUi()
    LazyRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(PreventiveHealthTab.entries) { tab ->
            val isSelected = selectedTab == tab
            Surface(
                onClick = { onSelect(tab) },
                shape = RoundedCornerShape(999.dp),
                color = if (isSelected) AuAccent else AuSurface,
                border = BorderStroke(
                    1.dp,
                    if (isSelected) AuAccent else AuBorder,
                ),
            ) {
                Text(
                    text = tab.localizedLabel(isPortuguese),
                    style = MaterialTheme.typography.labelLarge,
                    color = if (isSelected) AuBackground else AuTextSecondary,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                )
            }
        }
    }
}

@Composable
private fun CalculatorTabContent(
    draftAge: String,
    draftGender: PreventiveGender?,
    calculatedAge: Int?,
    calculatedGender: PreventiveGender?,
    isFormCollapsed: Boolean,
    recommendedScreenings: List<PreventiveScreening>,
    urgentCount: Int,
    mediumCount: Int,
    expandedScreenings: MutableMap<String, Boolean>,
    onAgeChange: (String) -> Unit,
    onGenderSelected: (PreventiveGender) -> Unit,
    onCalculate: () -> Unit,
    onToggleForm: () -> Unit,
) {
    val isPortuguese = isPortugueseUi()
    val groupedScreenings = groupRecommendedScreeningsByCategory(recommendedScreenings)
    val canCalculate = draftAge.toIntOrNull()?.let { it in 1..120 } == true && draftGender != null

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = AuSurface,
            border = BorderStroke(1.dp, AuBorder),
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = healthText("Calculadora personalizada", "Calculadora personalizada"),
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = if (calculatedAge != null && calculatedGender != null) {
                                val yearsLabel = if (isPortuguese) "anos" else "años"
                                "$calculatedAge $yearsLabel · ${calculatedGender.localizedLabel(isPortuguese)}"
                            } else {
                                healthText(
                                    es = "Descubre qué controles te corresponden según tu edad y género.",
                                    pt = "Descubra quais exames são indicados para sua idade e sexo.",
                                )
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                    }

                    if (calculatedAge != null && calculatedGender != null) {
                        TextButton(onClick = onToggleForm) {
                            Text(if (isFormCollapsed) "Editar" else "Ocultar")
                        }
                    }
                }

                AnimatedVisibility(visible = !isFormCollapsed || calculatedAge == null || calculatedGender == null) {
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        val textFieldColors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = AuTextPrimary,
                            unfocusedTextColor = AuTextPrimary,
                            focusedContainerColor = AuSurfaceHover,
                            unfocusedContainerColor = AuSurfaceHover,
                            focusedBorderColor = AuAccent,
                            unfocusedBorderColor = AuBorder,
                            focusedLabelColor = AuAccent,
                            unfocusedLabelColor = AuTextTertiary,
                            cursorColor = AuAccent,
                        )

                        OutlinedTextField(
                            value = draftAge,
                            onValueChange = onAgeChange,
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text(stringResource(com.autamedica.android.R.string.health_your_age)) },
                            placeholder = { Text(stringResource(com.autamedica.android.R.string.health_age_example)) },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            shape = RoundedCornerShape(14.dp),
                            colors = textFieldColors,
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            PreventiveChoiceChip(
                                label = PreventiveGender.Male.localizedLabel(isPortuguese),
                                selected = draftGender == PreventiveGender.Male,
                                onClick = { onGenderSelected(PreventiveGender.Male) },
                                modifier = Modifier.weight(1f),
                            )
                            PreventiveChoiceChip(
                                label = PreventiveGender.Female.localizedLabel(isPortuguese),
                                selected = draftGender == PreventiveGender.Female,
                                onClick = { onGenderSelected(PreventiveGender.Female) },
                                modifier = Modifier.weight(1f),
                            )
                        }

                        Button(
                            onClick = onCalculate,
                            enabled = canCalculate,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = AuAccent,
                                contentColor = AuBackground,
                                disabledContainerColor = AuSurfaceHover,
                                disabledContentColor = AuTextTertiary,
                            ),
                        ) {
                            Text(
                                text = healthText(
                                    es = "Ver mis controles recomendados",
                                    pt = "Ver meus exames recomendados",
                                ),
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(vertical = 4.dp),
                            )
                        }
                    }
                }
            }
        }

        if (recommendedScreenings.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                CompactSummaryCard(
                    title = healthText("Prioritarios", "Prioritários"),
                    value = urgentCount.toString(),
                    accent = AuDanger,
                    container = ErrorContainer,
                    modifier = Modifier.weight(1f),
                )
                CompactSummaryCard(
                    title = "Importantes",
                    value = mediumCount.toString(),
                    accent = AuWarning,
                    container = WarningContainer,
                    modifier = Modifier.weight(1f),
                )
                CompactSummaryCard(
                    title = "Total",
                    value = recommendedScreenings.size.toString(),
                    accent = Secondary,
                    container = SecondaryContainer,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        if (urgentCount > 0) {
            InfoBanner(
                title = healthText("Tenés controles prioritarios", "Você tem exames prioritários"),
                message = healthText(
                    es = "Hay estudios que merecen seguimiento temprano. Coordinarlos con tu médico mejora el valor preventivo del plan.",
                    pt = "Há exames que merecem acompanhamento precoce. Coordená-los com seu médico melhora o valor preventivo do plano.",
                ),
            )
        }

        if (recommendedScreenings.isEmpty() && calculatedAge != null && calculatedGender != null) {
            InfoBanner(
                title = healthText(
                    es = "No hay controles cargados para esta combinación",
                    pt = "Não há exames cadastrados para esta combinação",
                ),
                message = healthText(
                    es = "Consultá con tu médico si necesitás una recomendación más específica o si tenés factores de riesgo particulares.",
                    pt = "Consulte seu médico se precisar de uma recomendação mais específica ou tiver fatores de risco particulares.",
                ),
            )
        }

        groupedScreenings.forEach { (category, screenings) ->
            val palette = paletteFor(category)
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = AuSurface,
                border = BorderStroke(1.dp, AuBorder),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        text = "${category.localizedLabel(isPortuguese)} (${screenings.size})",
                        style = MaterialTheme.typography.titleMedium,
                        color = palette.accent,
                        fontWeight = FontWeight.Bold,
                    )

                    screenings.forEach { screening ->
                        ScreeningCard(
                            screening = screening,
                            expanded = expandedScreenings[screening.id] == true,
                            onToggleExpanded = {
                                expandedScreenings[screening.id] = expandedScreenings[screening.id] != true
                            },
                        )
                    }
                }
            }
        }

        if (recommendedScreenings.isNotEmpty()) {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = AuSurface,
                border = BorderStroke(1.dp, AuBorder),
            ) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = healthText("Siguiente paso", "Próximo passo"),
                        style = MaterialTheme.typography.titleSmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = healthText(
                            es = "Llevá este resumen a tu médico y agendá los estudios pendientes desde tu canal habitual de atención.",
                            pt = "Leve este resumo ao seu médico e agende os exames pendentes pelo seu canal habitual de atendimento.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }
            }
        }
    }
}

@Composable
private fun PreventiveChoiceChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = if (selected) AuAccent else AuSurface,
        border = BorderStroke(1.dp, if (selected) AuAccent else AuBorder),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = if (selected) AuBackground else AuTextSecondary,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
        )
    }
}

@Composable
private fun CompactSummaryCard(
    title: String,
    value: String,
    accent: Color,
    container: Color,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = container,
        border = BorderStroke(1.dp, accent.copy(alpha = 0.2f)),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.headlineMedium,
                color = accent,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun ScreeningCard(
    screening: PreventiveScreening,
    expanded: Boolean,
    onToggleExpanded: () -> Unit,
) {
    val isPortuguese = isPortugueseUi()
    val localized = screening.localized(isPortuguese)
    val palette = paletteFor(localized.category)
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = palette.container,
        border = BorderStroke(1.dp, palette.border),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CategoryBadge(category = localized.category)
                    Column {
                        Text(
                            text = localized.name,
                            style = MaterialTheme.typography.titleSmall,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = localized.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                    }
                }

                if (localized.urgency == PreventiveUrgency.High) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = ErrorContainer,
                    ) {
                        Text(
                            text = healthText("PRIORITARIO", "PRIORITÁRIO"),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuDanger,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                ScreeningMeta(text = localized.frequency, modifier = Modifier.weight(1f))
                ScreeningMeta(
                    text = if (isPortuguese) {
                        "A partir dos ${localized.startAge} anos"
                    } else {
                        "Desde ${localized.startAge} años"
                    },
                    modifier = Modifier.weight(1f),
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = when (localized.coverage) {
                        PreventiveCoverage.Total -> "Cobertura 100%"
                        PreventiveCoverage.Partial -> "Cobertura parcial"
                        PreventiveCoverage.Variable -> healthText("Cobertura variable", "Cobertura variável")
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = palette.accent,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = if (expanded) "Ver menos" else healthText("Ver detalles", "Ver detalhes"),
                    style = MaterialTheme.typography.labelMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable(onClick = onToggleExpanded),
                )
            }

            AnimatedVisibility(visible = expanded) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    localized.benefits.take(3).forEach { benefit ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Box(
                                modifier = Modifier
                                    .padding(top = 6.dp)
                                    .size(6.dp)
                                    .background(color = palette.accent, shape = CircleShape),
                            )
                            Text(
                                text = benefit,
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary,
                            )
                        }
                    }

                    localized.specialCase?.let { note ->
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = AuSurface.copy(alpha = 0.65f),
                            border = BorderStroke(1.dp, AuBorder),
                        ) {
                            Text(
                                text = "Nota: $note",
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary,
                                modifier = Modifier.padding(12.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryBadge(
    category: PreventiveCategory,
    modifier: Modifier = Modifier,
) {
    val palette = paletteFor(category)
    val icon = iconFor(category)
    Surface(
        modifier = modifier.size(42.dp),
        shape = CircleShape,
        color = AuSurface,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = palette.accent,
            modifier = Modifier.padding(10.dp),
        )
    }
}

@Composable
private fun ScreeningMeta(
    text: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = AuSurface.copy(alpha = 0.7f),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = AuTextSecondary,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun TimelineTabContent(
    currentAge: Int?,
    gender: PreventiveGender?,
    expandedMilestones: MutableMap<Int, Boolean>,
) {
    val isPortuguese = isPortugueseUi()
    val milestones = getPreventiveAgeMilestones().filter { age ->
        getScreeningsStartingAtAge(age, gender).isNotEmpty() || getScreeningsEndingAtAge(age, gender).isNotEmpty()
    }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = AuSurface,
            border = BorderStroke(1.dp, AuBorder),
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = healthText(
                            es = "Línea de tiempo preventiva",
                            pt = "Linha do tempo preventiva",
                        ),
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = healthText(
                            es = "Muestra cuándo empiezan o finalizan estudios clave. Si completás la calculadora, destacamos tu edad actual.",
                            pt = "Mostra quando começam ou terminam exames importantes. Se preencher a calculadora, destacamos sua idade atual.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }

                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(PreventiveCategory.entries) { category ->
                        val palette = paletteFor(category)
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = palette.container,
                            border = BorderStroke(1.dp, palette.border),
                        ) {
                            Text(
                                text = category.localizedLabel(isPortuguese),
                                style = MaterialTheme.typography.labelSmall,
                                color = palette.accent,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            )
                        }
                    }
                }
            }
        }

        milestones.forEach { age ->
            val starting = getScreeningsStartingAtAge(age, gender)
            val ending = getScreeningsEndingAtAge(age, gender)
            val isExpanded = expandedMilestones[age] == true
            val isCurrentAge = currentAge == age
            val isPastAge = currentAge != null && age < currentAge

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.width(60.dp),
                ) {
                    Surface(
                        modifier = Modifier.size(52.dp),
                        shape = CircleShape,
                        color = when {
                            isCurrentAge -> AuAccent
                            isPastAge -> AuSurfaceHover
                            else -> AuSurface
                        },
                        border = BorderStroke(1.dp, if (isCurrentAge) AuAccent else AuBorder),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = age.toString(),
                                style = MaterialTheme.typography.titleMedium,
                                color = if (isCurrentAge) AuBackground else AuTextPrimary,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                    Box(
                        modifier = Modifier
                            .width(2.dp)
                            .height(56.dp)
                            .background(AuBorder),
                    )
                }

                Surface(
                    modifier = Modifier.weight(1f),
                    onClick = {
                        expandedMilestones[age] = expandedMilestones[age] != true
                    },
                    shape = RoundedCornerShape(18.dp),
                    color = AuSurface,
                    border = BorderStroke(1.dp, AuBorder),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(
                            text = buildString {
                                append(if (isPortuguese) "$age anos" else "$age años")
                                if (isCurrentAge) append(if (isPortuguese) " · sua idade" else " · tu edad")
                            },
                            style = MaterialTheme.typography.titleMedium,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = buildString {
                                if (starting.isNotEmpty()) {
                                    append(
                                        if (isPortuguese) {
                                            "+${starting.size} exame(s) começam"
                                        } else {
                                            "+${starting.size} estudio(s) empiezan"
                                        },
                                    )
                                }
                                if (starting.isNotEmpty() && ending.isNotEmpty()) append(" · ")
                                if (ending.isNotEmpty()) {
                                    append(
                                        if (isPortuguese) {
                                            "${ending.size} exame(s) terminam"
                                        } else {
                                            "${ending.size} estudio(s) finalizan"
                                        },
                                    )
                                }
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                        Text(
                            text = if (isExpanded) {
                                healthText("Ocultar detalle", "Ocultar detalhes")
                            } else {
                                healthText("Ver detalle", "Ver detalhes")
                            },
                            style = MaterialTheme.typography.labelMedium,
                            color = AuAccent,
                            fontWeight = FontWeight.SemiBold,
                        )

                        AnimatedVisibility(visible = isExpanded) {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                if (starting.isNotEmpty()) {
                                    TimelineGroup(
                                        title = healthText("Comienzan a esta edad", "Começam nesta idade"),
                                        screenings = starting,
                                    )
                                }
                                if (ending.isNotEmpty()) {
                                    TimelineGroup(
                                        title = healthText("Finalizan a esta edad", "Terminam nesta idade"),
                                        screenings = ending,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        Text(
            text = healthText(
                es = "Tip: tocá cada edad para ver qué estudios comienzan o finalizan en ese momento.",
                pt = "Dica: toque em cada idade para ver quais exames começam ou terminam nesse momento.",
            ),
            style = MaterialTheme.typography.bodySmall,
            color = AuTextTertiary,
        )
    }
}

@Composable
private fun TimelineGroup(
    title: String,
    screenings: List<PreventiveScreening>,
) {
    val isPortuguese = isPortugueseUi()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            color = AuTextPrimary,
            fontWeight = FontWeight.SemiBold,
        )
        screenings.forEach { rawScreening ->
            val screening = rawScreening.localized(isPortuguese)
            val palette = paletteFor(screening.category)
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = palette.container,
                border = BorderStroke(1.dp, palette.border),
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = screening.shortName,
                        style = MaterialTheme.typography.titleSmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = screening.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                    Text(
                        text = buildString {
                            val freqLabel = if (isPortuguese) "Frequência" else "Frecuencia"
                            append("$freqLabel: ${screening.frequency}")
                            screening.endAge?.let {
                                val untilLabel = if (isPortuguese) "Até $it anos" else "Hasta $it años"
                                append(" · $untilLabel")
                            }
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.accent,
                    )
                }
            }
        }
    }
}

@Composable
private fun EducationTabContent() {
    val isPortuguese = isPortugueseUi()
    val items = getPreventiveEducationItems(isPortuguese)
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = AuSurface,
            border = BorderStroke(1.dp, AuBorder),
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = healthText("Educación preventiva", "Educação preventiva"),
                    style = MaterialTheme.typography.titleLarge,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = healthText(
                        es = "Guía práctica de prevención para organizar tus chequeos de rutina, vacunas y factores de riesgo con tu médico.",
                        pt = "Guia prático de prevenção para organizar seus exames de rotina, vacinas e fatores de risco com seu médico.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
            }
        }

        items.forEach { item ->
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = AuSurface,
                border = BorderStroke(1.dp, AuBorder),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = item.title,
                        style = MaterialTheme.typography.titleMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = item.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }
            }
        }
    }
}

private fun paletteFor(category: PreventiveCategory): PreventivePalette = when (category) {
    PreventiveCategory.Cardiovascular -> PreventivePalette(
        container = Color(0xFF2B1517),
        border = Color(0xFF5F2026),
        accent = Color(0xFFFCA5A5),
    )
    PreventiveCategory.Cancer -> PreventivePalette(
        container = TertiaryContainer,
        border = Tertiary.copy(alpha = 0.45f),
        accent = Color(0xFFD8B4FE),
    )
    PreventiveCategory.Metabolic -> PreventivePalette(
        container = SecondaryContainer,
        border = Secondary.copy(alpha = 0.45f),
        accent = Color(0xFF7DD3FC),
    )
    PreventiveCategory.Bone -> PreventivePalette(
        container = WarningContainer,
        border = AuWarning.copy(alpha = 0.45f),
        accent = Color(0xFFFDE68A),
    )
    PreventiveCategory.Preventive -> PreventivePalette(
        container = SuccessContainer,
        border = Color(0xFF065F46),
        accent = Color(0xFF6EE7B7),
    )
    PreventiveCategory.Other -> PreventivePalette(
        container = AuSurfaceHover,
        border = AuBorder,
        accent = AuTextSecondary,
    )
}

private fun iconFor(category: PreventiveCategory): ImageVector = when (category) {
    PreventiveCategory.Cardiovascular -> Icons.Outlined.FavoriteBorder
    PreventiveCategory.Cancer -> Icons.Outlined.Description
    PreventiveCategory.Metabolic -> Icons.Outlined.LocalHospital
    PreventiveCategory.Bone -> Icons.Outlined.CalendarMonth
    PreventiveCategory.Preventive -> Icons.Outlined.Vaccines
    PreventiveCategory.Other -> Icons.Outlined.Info
}
