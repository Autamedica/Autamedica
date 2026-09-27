package com.autamedica.android.presentation.ondemand

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.Healing
import androidx.compose.material.icons.filled.Medication
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Thermostat
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R

// ── Official AutaMedica Brand Palette (Matching Web globals.css) ───────────
private val AuBgDark = Color(0xFF09090B)          // --logo-obsidian-bg / midnight base
private val AuBgDarkSurface = Color(0xFF0D121F)   // subtle deep elevation
private val AuCardSurface = Color(0xFF111827)     // slate-900 / gray-900
private val AuBorder = Color(0x1F0EA5E9)          // rgba(14, 165, 233, 0.12) --au-border
private val AuAccent = Color(0xFF0EA5E9)          // --au-accent (sky-500 canonical)
private val AuAccentDark = Color(0xFF0284C7)      // am-patient-600 / sky-600
private val AuSuccess = Color(0xFF22C55E)         // --au-success (green-500 canonical)
private val AuTextPrimary = Color(0xFFFFFFFF)     // High-contrast clean white
private val AuTextSecondary = Color(0xFF94A3B8)   // slate-400
private val AuTextTertiary = Color(0xFF64748B)    // slate-500
private val AuDanger = Color(0xFFEF4444)          // --au-danger (red-500)

data class ConsultationReason(
    val tier: String,
    val title: String,
    val icon: ImageVector,
)

private val CLINICAL_REASONS = listOf(
    ConsultationReason(
        tier = "general",
        title = "Dolor o malestar general",
        icon = Icons.Filled.Healing,
    ),
    ConsultationReason(
        tier = "general",
        title = "Fiebre o infección",
        icon = Icons.Filled.Thermostat,
    ),
    ConsultationReason(
        tier = "general",
        title = "Receta o medicación",
        icon = Icons.Filled.Medication,
    ),
    ConsultationReason(
        tier = "cardiologia",
        title = "Presión o dolor de pecho",
        icon = Icons.Filled.Favorite,
    ),
    ConsultationReason(
        tier = "traumatologia",
        title = "Golpe o traumatología",
        icon = Icons.Filled.FitnessCenter,
    ),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OnDemandEntryScreen(
    initialTier: String = "general",
    initialInQueue: Boolean = false,
    onBack: () -> Unit,
    onJoinCall: (roomId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: OnDemandEntryViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(initialTier) {
        viewModel.setInitialTier(initialTier)
    }

    LaunchedEffect(initialInQueue) {
        if (initialInQueue) {
            viewModel.enterQueue()
        }
    }

    LaunchedEffect(uiState.isDoctorMatched, uiState.targetRoomId) {
        val target = uiState.targetRoomId
        if (uiState.isDoctorMatched && !target.isNullOrBlank()) {
            onJoinCall(target)
        }
    }

    Scaffold(
        modifier = modifier
            .fillMaxSize()
            .background(AuBgDark),
        containerColor = AuBgDark,
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(end = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Image(
                                painter = painterResource(id = R.drawable.logo_autamedica),
                                contentDescription = "AutaMedica",
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(RoundedCornerShape(8.dp)),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = "AutaMedica",
                                color = AuTextPrimary,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = (-0.3).sp,
                            )
                        }
                        LiveRadarBadge()
                    }
                },
                navigationIcon = {
                    Surface(
                        shape = CircleShape,
                        color = Color(0x14FFFFFF),
                        border = BorderStroke(1.dp, Color(0x1AFFFFFF)),
                        modifier = Modifier
                            .padding(start = 12.dp)
                            .size(38.dp),
                    ) {
                        IconButton(onClick = onBack) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Volver",
                                tint = AuTextPrimary,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AuBgDark),
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            AuBgDarkSurface,
                            AuBgDark,
                            Color(0xFF050507),
                        )
                    )
                ),
        ) {
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(260.dp)
            ) {
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(Color(0x180EA5E9), Color.Transparent),
                        center = Offset(size.width * 0.85f, 30f),
                        radius = size.width * 0.85f,
                    ),
                    radius = size.width * 0.85f,
                    center = Offset(size.width * 0.85f, 30f),
                )
            }

            when (uiState.step) {
                OnDemandFlowStep.INTAKE_FORM -> {
                    IntakeFormContent(
                        uiState = uiState,
                        onNameChange = viewModel::updateName,
                        onDniChange = viewModel::updateDni,
                        onPhoneChange = viewModel::updatePhone,
                        onTierSelect = viewModel::selectTier,
                        onSymptomChange = viewModel::updateSymptomSummary,
                        onSubmit = viewModel::submitIntake,
                    )
                }
                OnDemandFlowStep.VIRTUAL_QUEUE -> {
                    val terminalMessage = uiState.terminalMessage
                    if (terminalMessage != null) {
                        TerminalStateContent(
                            message = terminalMessage,
                            onRetry = viewModel::retryAfterTerminal,
                            onBack = onBack,
                        )
                    } else {
                        VirtualQueueContent(
                            uiState = uiState,
                        )
                    }
                }
                OnDemandFlowStep.MATCHED -> {
                    DoctorMatchedContent(
                        roomId = uiState.targetRoomId.orEmpty(),
                    )
                }
            }
        }
    }
}

@Composable
private fun LiveRadarBadge(modifier: Modifier = Modifier) {
    val infiniteTransition = rememberInfiniteTransition(label = "liveRadar")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 2.2f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "radarDotScale",
    )
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.8f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "radarDotAlpha",
    )

    Surface(
        shape = RoundedCornerShape(20.dp),
        color = Color(0xFF0B2416),
        border = BorderStroke(1.dp, Color(0x4D22C55E)),
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .scale(pulseScale)
                        .alpha(pulseAlpha)
                        .background(AuSuccess, CircleShape)
                )
                Box(
                    modifier = Modifier
                        .size(5.dp)
                        .background(AuSuccess, CircleShape)
                )
            }
            Spacer(Modifier.width(5.dp))
            Text(
                text = "EN LÍNEA",
                color = AuSuccess,
                fontSize = 10.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 0.5.sp,
            )
        }
    }
}

@Composable
private fun IntakeFormContent(
    uiState: OnDemandEntryUiState,
    onNameChange: (String) -> Unit,
    onDniChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onTierSelect: (String) -> Unit,
    onSymptomChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    val scrollState = rememberScrollState()
    var isEditingData by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 20.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Hero Header
        Column(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "Guardia de Mostrador",
                color = AuTextPrimary,
                fontSize = 24.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-0.5).sp,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = "Atención médica inmediata por videollamada",
                color = AuTextSecondary,
                fontSize = 13.5.sp,
            )
        }

        // Banner de Farmacia — SIN siglas técnicas como SISA, directo y útil para el paciente
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = Color(0xFF0E1626),
            border = BorderStroke(1.dp, AuBorder),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Image(
                    painter = painterResource(id = R.drawable.logo_autamedica),
                    contentDescription = null,
                    modifier = Modifier
                        .size(22.dp)
                        .clip(RoundedCornerShape(6.dp)),
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = "Receta digital válida en esta farmacia",
                    color = AuTextPrimary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        // Sección Datos del Paciente: Autocompletado estilo Uber / Nubank
        if (uiState.isDataAutofilled && !isEditingData) {
            // Card de Paciente Verificado (Zero fricción: ya está identificado)
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = AuCardSurface,
                border = BorderStroke(1.dp, AuBorder),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .background(Color(0xFF13283E), RoundedCornerShape(10.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Person,
                            contentDescription = null,
                            tint = AuAccent,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = uiState.patientName,
                                color = AuTextPrimary,
                                fontSize = 14.5.sp,
                                fontWeight = FontWeight.Bold,
                            )
                            Spacer(Modifier.width(6.dp))
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .background(AuSuccess, CircleShape)
                            )
                        }
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = "DNI ${uiState.patientDni} · ${uiState.patientPhone}",
                            color = AuTextSecondary,
                            fontSize = 12.sp,
                        )
                    }
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0x14FFFFFF),
                        border = BorderStroke(1.dp, Color(0x18FFFFFF)),
                        modifier = Modifier.clickable { isEditingData = true },
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Edit,
                                contentDescription = "Editar",
                                tint = AuAccent,
                                modifier = Modifier.size(13.dp),
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = "Cambiar",
                                color = AuAccent,
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
            }
        } else {
            // Modo edición o ingreso manual
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "1. TUS DATOS",
                        color = AuAccent,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 11.5.sp,
                        letterSpacing = 0.8.sp,
                    )
                    if (uiState.isDataAutofilled) {
                        Text(
                            text = "Listo",
                            color = AuAccent,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.clickable { isEditingData = false },
                        )
                    }
                }

                AutamedicaTextField(
                    value = uiState.patientName,
                    onValueChange = onNameChange,
                    label = "Nombre y apellido",
                    placeholder = "Marina Gómez",
                    leadingIcon = Icons.Filled.Person,
                )

                AutamedicaTextField(
                    value = uiState.patientDni,
                    onValueChange = onDniChange,
                    label = "DNI",
                    placeholder = "12345678",
                    leadingIcon = Icons.Filled.Badge,
                    keyboardType = KeyboardType.Number,
                )

                AutamedicaTextField(
                    value = uiState.patientPhone,
                    onValueChange = onPhoneChange,
                    label = "WhatsApp",
                    placeholder = "11 5555 1234",
                    leadingIcon = Icons.Filled.Phone,
                    keyboardType = KeyboardType.Phone,
                )
            }
        }

        // Sección Motivo de Consulta: Protagonista de la pantalla
        Text(
            text = "MOTIVO DE CONSULTA",
            color = AuAccent,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 11.5.sp,
            letterSpacing = 0.8.sp,
            modifier = Modifier.padding(top = 2.dp),
        )

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CLINICAL_REASONS.forEach { item ->
                val isSelected = uiState.selectedTier == item.tier &&
                    (uiState.symptomSummary == item.title || (uiState.symptomSummary.isBlank() && item.tier == "general" && item == CLINICAL_REASONS.first()))
                CompactReasonSelectorCard(
                    item = item,
                    isSelected = isSelected,
                    onClick = {
                        onTierSelect(item.tier)
                        onSymptomChange(item.title)
                    },
                )
            }
        }

        AnimatedVisibility(
            visible = uiState.error != null,
            enter = fadeIn() + scaleIn(),
            exit = fadeOut() + scaleOut(),
        ) {
            uiState.error?.let { err ->
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFF261014),
                    border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.5f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = err,
                        color = AuDanger,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(12.dp),
                    )
                }
            }
        }

        Spacer(Modifier.height(2.dp))

        // Botón CTA Principal
        Button(
            onClick = onSubmit,
            enabled = !uiState.isSubmitting,
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color.Transparent,
                disabledContainerColor = Color(0xFF1E293B),
            ),
            contentPadding = PaddingValues(0.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        if (uiState.isSubmitting) {
                            Brush.horizontalGradient(listOf(Color(0xFF1E293B), Color(0xFF334155)))
                        } else {
                            Brush.horizontalGradient(listOf(AuAccentDark, AuAccent))
                        },
                        RoundedCornerShape(14.dp),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                if (uiState.isSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        color = AuTextPrimary,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            text = "Iniciar Consulta",
                            color = AuTextPrimary,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 15.5.sp,
                            letterSpacing = 0.2.sp,
                        )
                        Spacer(Modifier.width(8.dp))
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = null,
                            tint = AuTextPrimary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(14.dp))
    }
}

@Composable
private fun AutamedicaTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    leadingIcon: ImageVector,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = {
            Text(
                text = label,
                fontSize = 13.sp,
            )
        },
        placeholder = {
            Text(
                text = placeholder,
                color = AuTextTertiary,
                fontSize = 14.sp,
            )
        },
        leadingIcon = {
            Box(
                modifier = Modifier
                    .padding(start = 10.dp, end = 4.dp)
                    .size(32.dp)
                    .background(Color(0xFF1A2234), RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = leadingIcon,
                    contentDescription = null,
                    tint = if (value.isNotBlank()) AuAccent else AuTextSecondary,
                    modifier = Modifier.size(16.dp),
                )
            }
        },
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = AuCardSurface,
            unfocusedContainerColor = AuCardSurface,
            focusedBorderColor = AuAccent,
            unfocusedBorderColor = AuBorder,
            focusedTextColor = AuTextPrimary,
            unfocusedTextColor = AuTextPrimary,
            focusedLabelColor = AuAccent,
            unfocusedLabelColor = AuTextSecondary,
            cursorColor = AuAccent,
        ),
        singleLine = true,
    )
}

@Composable
private fun CompactReasonSelectorCard(
    item: ConsultationReason,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val borderColor = if (isSelected) AuAccent else AuBorder
    val backgroundBrush = if (isSelected) {
        Brush.horizontalGradient(
            colors = listOf(
                Color(0xFF0E2238),
                Color(0xFF0B1B2C),
            )
        )
    } else {
        Brush.horizontalGradient(
            colors = listOf(AuCardSurface, AuCardSurface)
        )
    }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = Color.Transparent,
        border = BorderStroke(if (isSelected) 1.5.dp else 1.dp, borderColor),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(backgroundBrush)
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(
                        if (isSelected) {
                            Brush.linearGradient(listOf(AuAccentDark, AuAccent))
                        } else {
                            Brush.linearGradient(listOf(Color(0xFF1E293B), Color(0xFF172030)))
                        },
                        RoundedCornerShape(10.dp),
                    )
                    .border(
                        1.dp,
                        if (isSelected) AuAccent else Color(0x18FFFFFF),
                        RoundedCornerShape(10.dp),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = item.icon,
                    contentDescription = null,
                    tint = if (isSelected) AuTextPrimary else AuTextSecondary,
                    modifier = Modifier.size(18.dp),
                )
            }

            Spacer(Modifier.width(12.dp))

            Text(
                text = item.title,
                color = AuTextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )

            Box(
                modifier = Modifier
                    .size(20.dp)
                    .border(
                        1.5.dp,
                        if (isSelected) AuAccent else AuTextTertiary,
                        CircleShape,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                if (isSelected) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .background(AuAccent, CircleShape)
                    )
                }
            }
        }
    }
}

@Composable
private fun VirtualQueueContent(
    uiState: OnDemandEntryUiState,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "sonar")

    val wave1Scale by infiniteTransition.animateFloat(
        initialValue = 0.7f,
        targetValue = 1.9f,
        animationSpec = infiniteRepeatable(
            animation = tween(2400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "wave1Scale",
    )
    val wave1Alpha by infiniteTransition.animateFloat(
        initialValue = 0.5f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(2400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "wave1Alpha",
    )

    val wave2Scale by infiniteTransition.animateFloat(
        initialValue = 0.5f,
        targetValue = 1.5f,
        animationSpec = infiniteRepeatable(
            animation = tween(2400, delayMillis = 600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "wave2Scale",
    )
    val wave2Alpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(2400, delayMillis = 600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "wave2Alpha",
    )

    val sweepAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "radarSweep",
    )

    val centerPulse by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "centerPulse",
    )

    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Spacer(Modifier.height(4.dp))

        // Sonar con Logo Oficial de AutaMedica en el núcleo
        Box(
            modifier = Modifier.size(200.dp),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(170.dp)
                    .scale(wave1Scale)
                    .alpha(wave1Alpha)
                    .background(
                        Brush.radialGradient(
                            colors = listOf(AuAccent.copy(alpha = 0.45f), Color.Transparent)
                        ),
                        CircleShape,
                    )
            )

            Box(
                modifier = Modifier
                    .size(150.dp)
                    .scale(wave2Scale)
                    .alpha(wave2Alpha)
                    .background(
                        Brush.radialGradient(
                            colors = listOf(AuAccentDark.copy(alpha = 0.35f), Color.Transparent)
                        ),
                        CircleShape,
                    )
            )

            Canvas(modifier = Modifier.size(170.dp)) {
                val center = Offset(size.width / 2f, size.height / 2f)
                val radius = size.width / 2f

                drawCircle(
                    color = Color(0x240EA5E9),
                    radius = radius,
                    style = Stroke(width = 1.dp.toPx())
                )
                drawCircle(
                    color = Color(0x180EA5E9),
                    radius = radius * 0.65f,
                    style = Stroke(width = 1.dp.toPx())
                )

                drawLine(
                    color = Color(0x1A0EA5E9),
                    start = Offset(0f, center.y),
                    end = Offset(size.width, center.y),
                    strokeWidth = 1.dp.toPx()
                )
                drawLine(
                    color = Color(0x1A0EA5E9),
                    start = Offset(center.x, 0f),
                    end = Offset(center.x, size.height),
                    strokeWidth = 1.dp.toPx()
                )

                rotate(degrees = sweepAngle, pivot = center) {
                    drawArc(
                        brush = Brush.sweepGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color(0x000EA5E9),
                                Color(0x220EA5E9),
                                Color(0x550EA5E9)
                            ),
                            center = center
                        ),
                        startAngle = 0f,
                        sweepAngle = 60f,
                        useCenter = true
                    )
                }
            }

            // Radar Center Core con Logo Oficial de AutaMedica
            Surface(
                modifier = Modifier
                    .size(86.dp)
                    .scale(centerPulse),
                shape = RoundedCornerShape(20.dp),
                color = AuCardSurface,
                border = BorderStroke(2.dp, AuAccent),
                shadowElevation = 8.dp,
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.radialGradient(
                                colors = listOf(Color(0xFF0E2238), AuCardSurface)
                            )
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.logo_autamedica),
                        contentDescription = "AutaMedica",
                        modifier = Modifier
                            .size(52.dp)
                            .clip(RoundedCornerShape(12.dp)),
                    )
                }
            }
        }

        // Título directo sin relleno
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "Buscando médico...",
                color = AuTextPrimary,
                fontSize = 22.sp,
                fontWeight = FontWeight.ExtraBold,
                textAlign = TextAlign.Center,
                letterSpacing = (-0.4).sp,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Espera estimada: menos de 2 min",
                color = AuAccent,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
        }

        // Resumen de Admisión
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = Color(0xFF0C1322),
            border = BorderStroke(1.dp, AuBorder),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "RESUMEN",
                    color = AuAccent,
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 1.sp,
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = "Paciente",
                        color = AuTextSecondary,
                        fontSize = 13.sp,
                    )
                    Text(
                        text = uiState.patientName.ifBlank { "Marina Gómez" },
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = "DNI",
                        color = AuTextSecondary,
                        fontSize = 13.sp,
                    )
                    Text(
                        text = uiState.patientDni.ifBlank { "—" },
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = "Motivo",
                        color = AuTextSecondary,
                        fontSize = 13.sp,
                    )
                    Text(
                        text = uiState.symptomSummary.ifBlank { "Guardia General" },
                        color = AuAccent,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                    )
                }
            }
        }

        Text(
            text = "La videollamada iniciará automáticamente al conectar.",
            color = AuTextTertiary,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun TerminalStateContent(
    message: String,
    onRetry: () -> Unit,
    onBack: () -> Unit,
) {
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier.size(96.dp),
            contentAlignment = Alignment.Center,
        ) {
            Surface(
                shape = CircleShape,
                color = AuDanger.copy(alpha = 0.12f),
                border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.35f)),
                modifier = Modifier.size(96.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Filled.CheckCircle,
                        contentDescription = "Solicitud finalizada",
                        tint = AuDanger,
                        modifier = Modifier.size(44.dp),
                    )
                }
            }
        }

        Spacer(Modifier.height(24.dp))

        Text(
            text = message,
            color = AuTextPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            lineHeight = 26.sp,
        )

        Spacer(Modifier.height(16.dp))

        Button(
            onClick = onRetry,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = AuAccent,
                contentColor = Color.White,
            ),
        ) {
            Text(
                "Volver a intentar",
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
            )
        }

        Spacer(Modifier.height(8.dp))

        Button(
            onClick = onBack,
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0x14FFFFFF),
                contentColor = AuTextPrimary,
            ),
        ) {
            Text(
                "Salir",
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
            )
        }

        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun DoctorMatchedContent(
    roomId: String,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "matchedSuccess")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 0.9f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "matchedScale",
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(100.dp)
                .scale(pulseScale),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(90.dp)
                    .background(Color(0x2222C55E), CircleShape)
            )
            Icon(
                imageVector = Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = AuSuccess,
                modifier = Modifier.size(70.dp),
            )
        }

        Spacer(Modifier.height(20.dp))

        Text(
            text = "¡Médico Conectado!",
            color = AuTextPrimary,
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold,
            textAlign = TextAlign.Center,
            letterSpacing = (-0.5).sp,
        )

        Spacer(Modifier.height(6.dp))

        Text(
            text = "Ingresando a la videoconsulta...",
            color = AuAccent,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(24.dp))

        CircularProgressIndicator(
            color = AuAccent,
            strokeWidth = 3.dp,
            modifier = Modifier.size(32.dp),
        )
    }
}
