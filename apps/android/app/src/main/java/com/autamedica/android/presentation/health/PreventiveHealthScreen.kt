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

private enum class PreventiveHealthTab(
    val label: String,
) {
    Calculator("Calculadora"),
    Timeline("Cronologia"),
    Education("Educacion"),
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
            title = "Controles sugeridos",
            value = if (recommendedScreenings.isEmpty()) "--" else recommendedScreenings.size.toString(),
            helper = "Segun edad y genero",
            accentColor = AuAccent,
            containerColor = AuSurface,
        ),
        PreventiveStatCard(
            title = "Prioritarios",
            value = if (recommendedScreenings.isEmpty()) "--" else urgentCount.toString(),
            helper = "Requieren mas atencion",
            accentColor = AuDanger,
            containerColor = ErrorContainer,
        ),
        PreventiveStatCard(
            title = "Proximo hito",
            value = nextMilestone?.let { "$it anos" } ?: "--",
            helper = "Siguiente cambio de screening",
            accentColor = AuWarning,
            containerColor = WarningContainer,
        ),
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Salud Preventiva",
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Volver",
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
                        message = uiState.error ?: "No se pudo cargar el perfil preventivo.",
                        onRetry = viewModel::refresh,
                    )
                    uiState.isProfileReady -> InfoBanner(
                        title = "Perfil conectado",
                        message = "Usando tu fecha de nacimiento y genero guardados en Supabase para calcular chequeos preventivos automaticamente.",
                    )
                    else -> InfoBanner(
                        title = "Perfil preventivo incompleto",
                        message = "No encontramos fecha de nacimiento y genero en formato utilizable. Puedes calcular manualmente tus controles mientras conectamos la edicion de perfil en Android.",
                    )
                }
            }

            item {
                if (calculatedAge == null || calculatedGender == null) {
                    InfoBanner(
                        title = "Personaliza tus controles",
                        message = "La calculadora sigue disponible para ajustes manuales y para casos donde quieras explorar otro escenario preventivo.",
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
                    text = "Chequeos y vacunas segun tu etapa de vida",
                    style = MaterialTheme.typography.headlineMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Replica la experiencia definida en Astro/Next para que puedas revisar controles recomendados, entender cuando empiezan y sostener habitos preventivos.",
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
                text = "No pudimos conectar tu perfil preventivo",
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
                Text("Reintentar")
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
                    text = tab.label,
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
                            text = "Calculadora personalizada",
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = if (calculatedAge != null && calculatedGender != null) {
                                "${calculatedAge} anos · ${calculatedGender.label}"
                            } else {
                                "Descubre que controles te corresponden segun tu edad y genero."
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
                            label = { Text("Tu edad") },
                            placeholder = { Text("Ej: 45") },
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
                                label = "Masculino",
                                selected = draftGender == PreventiveGender.Male,
                                onClick = { onGenderSelected(PreventiveGender.Male) },
                                modifier = Modifier.weight(1f),
                            )
                            PreventiveChoiceChip(
                                label = "Femenino",
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
                                text = "Ver mis controles recomendados",
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
                    title = "Prioritarios",
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
                title = "Tenes controles prioritarios",
                message = "Hay estudios que merecen seguimiento temprano. Coordinarlos con tu medico mejora el valor preventivo del plan.",
            )
        }

        if (recommendedScreenings.isEmpty() && calculatedAge != null && calculatedGender != null) {
            InfoBanner(
                title = "No hay controles cargados para esta combinacion",
                message = "Consulta con tu medico si necesitas una recomendacion mas especifica o si tienes factores de riesgo particulares.",
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
                        text = "${category.label} (${screenings.size})",
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
                        text = "Siguiente paso",
                        style = MaterialTheme.typography.titleSmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Lleva este resumen a tu medico y agenda los estudios pendientes desde tu canal habitual de atencion.",
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
    val palette = paletteFor(screening.category)
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
                    CategoryBadge(category = screening.category)
                    Column {
                        Text(
                            text = screening.name,
                            style = MaterialTheme.typography.titleSmall,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = screening.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                    }
                }

                if (screening.urgency == PreventiveUrgency.High) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = ErrorContainer,
                    ) {
                        Text(
                            text = "PRIORITARIO",
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
                ScreeningMeta(text = screening.frequency, modifier = Modifier.weight(1f))
                ScreeningMeta(text = "Desde ${screening.startAge} anos", modifier = Modifier.weight(1f))
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = when (screening.coverage) {
                        PreventiveCoverage.Total -> "Cobertura 100%"
                        PreventiveCoverage.Partial -> "Cobertura parcial"
                        PreventiveCoverage.Variable -> "Cobertura variable"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = palette.accent,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = if (expanded) "Ver menos" else "Ver detalles",
                    style = MaterialTheme.typography.labelMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable(onClick = onToggleExpanded),
                )
            }

            AnimatedVisibility(visible = expanded) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    screening.benefits.take(3).forEach { benefit ->
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

                    screening.specialCase?.let { note ->
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
                        text = "Linea de tiempo preventiva",
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "Muestra cuando empiezan o finalizan estudios clave. Si completas la calculadora, destacamos tu edad actual.",
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
                                text = category.label,
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
                                append("$age anos")
                                if (isCurrentAge) append(" · tu edad")
                            },
                            style = MaterialTheme.typography.titleMedium,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = buildString {
                                if (starting.isNotEmpty()) append("+${starting.size} estudio(s) empiezan")
                                if (starting.isNotEmpty() && ending.isNotEmpty()) append(" · ")
                                if (ending.isNotEmpty()) append("${ending.size} estudio(s) finalizan")
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                        Text(
                            text = if (isExpanded) "Ocultar detalle" else "Ver detalle",
                            style = MaterialTheme.typography.labelMedium,
                            color = AuAccent,
                            fontWeight = FontWeight.SemiBold,
                        )

                        AnimatedVisibility(visible = isExpanded) {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                if (starting.isNotEmpty()) {
                                    TimelineGroup(
                                        title = "Comienzan a esta edad",
                                        screenings = starting,
                                    )
                                }
                                if (ending.isNotEmpty()) {
                                    TimelineGroup(
                                        title = "Finalizan a esta edad",
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
            text = "Tip: toca cada edad para ver que estudios comienzan o finalizan en ese momento.",
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
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            color = AuTextPrimary,
            fontWeight = FontWeight.SemiBold,
        )
        screenings.forEach { screening ->
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
                            append("Frecuencia: ${screening.frequency}")
                            screening.endAge?.let { append(" · Hasta $it anos") }
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
                    text = "Educacion preventiva",
                    style = MaterialTheme.typography.titleLarge,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "La web hoy deja esta seccion como base educativa. En Android la bajamos a contenido corto para que no quede vacia mientras llega la integracion completa.",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
            }
        }

        preventiveEducationItems.forEach { item ->
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
