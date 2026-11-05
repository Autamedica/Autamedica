package com.autamedica.android.presentation.pharmacy

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.LocalPharmacy
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.autamedica.android.R
import com.autamedica.android.domain.model.PharmacyConsultationStatus
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import com.autamedica.android.presentation.theme.Primary
import com.autamedica.android.presentation.theme.PrimaryDark
import com.autamedica.android.presentation.theme.PrimaryLight
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuCyan
import com.autamedica.android.presentation.theme.AuCyanDeep
import com.autamedica.android.presentation.theme.AuCyanSoft
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuEmerald
import com.autamedica.android.presentation.theme.AuNavy
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPharmacists
import com.autamedica.android.presentation.theme.PortalPharmacistsSoft
import com.autamedica.android.presentation.theme.SuccessContainer
import com.autamedica.android.presentation.pharmacy.components.ActiveMedicalNetworkPanel
import com.autamedica.android.presentation.pharmacy.components.DispatchTelemetryTicker
import com.autamedica.android.presentation.pharmacy.components.LiveMedicalPresenceRadar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PharmacyIntakeScreen(
    onBack: () -> Unit,
    onNavigateToCall: (roomId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: PharmacyIntakeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    val haptic = LocalHapticFeedback.current
    var showCancelConfirmation by remember { mutableStateOf(false) }

    // Leaving a waiting room must never cancel a clinical request silently.
    BackHandler(enabled = uiState.activeRequestId != null &&
        uiState.status == PharmacyConsultationStatus.PENDING) {
        showCancelConfirmation = true
    }

    if (showCancelConfirmation) {
        AlertDialog(
            onDismissRequest = { showCancelConfirmation = false },
            title = { Text("Tu solicitud sigue en la fila") },
            text = { Text("Podés seguir esperando hasta que se conecte un médico. Si querés dejar la fila, cancelá la solicitud explícitamente.") },
            confirmButton = {
                TextButton(onClick = { showCancelConfirmation = false }) {
                    Text("Seguir esperando")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showCancelConfirmation = false
                        viewModel.cancelActiveRequest()
                    },
                ) {
                    Text("Cancelar solicitud")
                }
            },
        )
    }

    // Automatic navigation when the doctor attends the call and the room is ready
    LaunchedEffect(uiState.readyToJoinCall, uiState.roomId) {
        val targetRoom = uiState.roomId
        if (uiState.readyToJoinCall && !targetRoom.isNullOrBlank()) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            viewModel.onCallNavigated()
            onNavigateToCall(targetRoom)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Primary.copy(alpha = 0.08f),
                            border = BorderStroke(1.dp, Primary.copy(alpha = 0.2f)),
                            modifier = Modifier.size(36.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Image(
                                    painter = painterResource(id = R.drawable.logo_autamedica),
                                    contentDescription = "AutaMedica",
                                    modifier = Modifier.size(26.dp),
                                    contentScale = ContentScale.Fit,
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "AutaMedica Guardia",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                            )
                            Text(
                                text = "Atención por videollamada",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextTertiary,
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = {
                        if (uiState.activeRequestId != null &&
                            uiState.status == PharmacyConsultationStatus.PENDING) {
                            showCancelConfirmation = true
                        } else {
                            // Assigned consultations stay in the server, even
                            // if the patient navigates away from the radar.
                            onBack()
                        }
                    }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Volver",
                            tint = AuTextPrimary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AuBackground,
                ),
            )
        },
        containerColor = AuBackground,
        modifier = modifier.imePadding(),
    ) { innerPadding ->
        if (uiState.activeRequestId != null) {
            // Live Interactive Waiting Room
            PharmacyWaitingRoomView(
                uiState = uiState,
                onCancelRequest = viewModel::cancelActiveRequest,
                onJoinCall = {
                    uiState.roomId?.let(onNavigateToCall)
                },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
            )
        } else {
            // Intake Form
            PharmacyIntakeFormView(
                uiState = uiState,
                reasonChips = viewModel.reasonChips,
                onReasonChipSelected = viewModel::onReasonChipSelected,
                onReasonTextChanged = viewModel::onReasonTextChanged,
                onPatientNameChanged = viewModel::onPatientNameChanged,
                onPatientDniChanged = viewModel::onPatientDniChanged,
                onPatientPhoneChanged = viewModel::onPatientPhoneChanged,
                onCountrySelected = viewModel::onCountrySelected,
                onSubmit = viewModel::submitRequest,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
            )
        }
    }
}

@Composable
private fun PharmacyIntakeFormView(
    uiState: PharmacyIntakeUiState,
    reasonChips: List<String>,
    onReasonChipSelected: (String) -> Unit,
    onReasonTextChanged: (String) -> Unit,
    onPatientNameChanged: (String) -> Unit,
    onPatientDniChanged: (String) -> Unit,
    onPatientPhoneChanged: (String) -> Unit,
    onCountrySelected: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scrollState = rememberScrollState()
    val haptic = LocalHapticFeedback.current

    Column(
        modifier = modifier
            .verticalScroll(scrollState)
            .padding(horizontal = 20.dp, vertical = 12.dp),
    ) {
        // 1. Motivo de Consulta (Focus principal del usuario)
        Text(
            text = "Motivo de Consulta",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = AuTextPrimary,
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Quick Reason Chips
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            reasonChips.forEach { chip ->
                val isSelected = uiState.selectedReasonChip == chip
                FilterChip(
                    selected = isSelected,
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onReasonChipSelected(chip)
                    },
                    label = {
                        Text(
                            text = chip,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Primary,
                        selectedLabelColor = Color.White,
                        containerColor = AuSurface,
                        labelColor = AuTextSecondary,
                    ),
                    border = BorderStroke(
                        width = 1.dp,
                        color = if (isSelected) Primary else AuBorder,
                    ),
                    shape = RoundedCornerShape(20.dp),
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Free Text Reason
        OutlinedTextField(
            value = uiState.reasonText,
            onValueChange = onReasonTextChanged,
            label = { Text("Motivo o medicamento") },
            placeholder = { Text("Ej: Renovar Losartán / Dolor de garganta") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 2,
            maxLines = 4,
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Primary,
                unfocusedBorderColor = AuBorder,
                focusedContainerColor = AuSurface,
                unfocusedContainerColor = AuSurface,
            ),
        )

        Spacer(modifier = Modifier.height(20.dp))

        // Explicit clinical jurisdiction is required even for guest kiosk patients.
        Text(
            text = "País de atención / País de atendimento *",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = AuTextPrimary,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf("AR" to "Argentina · DNI", "BR" to "Brasil · CPF").forEach { (country, label) ->
                FilterChip(
                    selected = uiState.careCountry == country,
                    onClick = { onCountrySelected(country) },
                    label = { Text(label, style = MaterialTheme.typography.bodySmall) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Primary,
                        selectedLabelColor = Color.White,
                        containerColor = AuSurface,
                    ),
                )
            }
        }
        Spacer(modifier = Modifier.height(16.dp))

        // 2. Datos del Paciente (Autocompletados y editables)
        Text(
            text = "Tus datos",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = AuTextPrimary,
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Nombre y Apellido
        OutlinedTextField(
            value = uiState.patientName,
            onValueChange = onPatientNameChanged,
            label = { Text("Nombre y Apellido") },
            leadingIcon = {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = null,
                    tint = AuTextTertiary,
                    modifier = Modifier.size(20.dp),
                )
            },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Primary,
                unfocusedBorderColor = AuBorder,
                focusedContainerColor = AuSurface,
                unfocusedContainerColor = AuSurface,
            ),
        )

        Spacer(modifier = Modifier.height(10.dp))

        // DNI / Documento
        OutlinedTextField(
            value = uiState.patientDni,
            onValueChange = onPatientDniChanged,
            label = { Text(if (uiState.careCountry == "BR") "CPF (11 dígitos)" else "DNI / Documento") },
            leadingIcon = {
                Icon(
                    imageVector = Icons.Outlined.Badge,
                    contentDescription = null,
                    tint = AuTextTertiary,
                    modifier = Modifier.size(20.dp),
                )
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Primary,
                unfocusedBorderColor = AuBorder,
                focusedContainerColor = AuSurface,
                unfocusedContainerColor = AuSurface,
            ),
        )

        Spacer(modifier = Modifier.height(10.dp))

        // Teléfono / WhatsApp
        OutlinedTextField(
            value = uiState.patientPhone,
            onValueChange = onPatientPhoneChanged,
            label = { Text("Teléfono / WhatsApp") },
            leadingIcon = {
                Icon(
                    imageVector = Icons.Default.Phone,
                    contentDescription = null,
                    tint = AuTextTertiary,
                    modifier = Modifier.size(20.dp),
                )
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Primary,
                unfocusedBorderColor = AuBorder,
                focusedContainerColor = AuSurface,
                unfocusedContainerColor = AuSurface,
            ),
        )

        // Ended/cancelled legacy requests are an informational state, not a red error.
        AnimatedVisibility(
            visible = uiState.statusNotice != null,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            uiState.statusNotice?.let { notice ->
                Spacer(modifier = Modifier.height(12.dp))
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = AuCyanSoft,
                    border = BorderStroke(1.dp, AuCyan.copy(alpha = 0.25f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = notice,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextPrimary,
                        modifier = Modifier.padding(12.dp),
                    )
                }
            }
        }

        // Error Banner (only validation, auth and real technical failures)
        AnimatedVisibility(
            visible = uiState.error != null,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            uiState.error?.let { err ->
                Spacer(modifier = Modifier.height(12.dp))
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFFFEF2F2),
                    border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.3f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = err,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuDanger,
                        modifier = Modifier.padding(12.dp),
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Submit Button
        Button(
            onClick = {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                onSubmit()
            },
            enabled = !uiState.isSubmitting && !uiState.isRestoringRequest && uiState.isFormValid,
            colors = ButtonDefaults.buttonColors(
                containerColor = Primary,
                disabledContainerColor = Primary.copy(alpha = 0.4f),
                contentColor = Color.White,
            ),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
        ) {
            if (uiState.isSubmitting) {
                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(22.dp),
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "Conectando con guardia...",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
            } else {
                Icon(
                    imageVector = Icons.Default.Videocam,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Conectar con Guardia",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        Spacer(modifier = Modifier.height(20.dp))
    }
}

@Composable
private fun PharmacyWaitingRoomView(
    uiState: PharmacyIntakeUiState,
    onCancelRequest: () -> Unit = {},
    onJoinCall: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val callReady = uiState.readyToJoinCall
    val scrollState = rememberScrollState()
    val haptic = LocalHapticFeedback.current

    Column(
        modifier = modifier
            .verticalScroll(scrollState)
            .padding(horizontal = 20.dp, vertical = 16.dp)
            .fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (callReady) {
            Spacer(modifier = Modifier.height(8.dp))

            // Tarjeta de Médico Encontrado de Clase Mundial (Estilo Uber/Nubank)
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = AuSurface,
                border = BorderStroke(1.5.dp, AuEmerald.copy(alpha = 0.4f)),
                shadowElevation = 8.dp,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    // Avatar con pulso vivo Esmeralda
                    Box(contentAlignment = Alignment.Center) {
                        Surface(
                            shape = CircleShape,
                            color = AuEmerald.copy(alpha = 0.12f),
                            border = BorderStroke(2.dp, AuEmerald.copy(alpha = 0.5f)),
                            modifier = Modifier.size(80.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = AuEmerald,
                                    modifier = Modifier.size(44.dp),
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Badge de Estado Instantáneo
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = AuEmerald.copy(alpha = 0.12f),
                        border = BorderStroke(0.5.dp, AuEmerald.copy(alpha = 0.3f)),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .clip(CircleShape)
                                    .background(AuEmerald)
                            )
                            Text(
                                text = "INGRESO A CONSULTA HABILITADO",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = AuEmerald,
                                letterSpacing = 0.5.sp,
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = "Podés ingresar a la videollamada",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = uiState.assignedDoctorName ?: "Profesional de guardia",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Primary,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = uiState.assignedDoctorSpecialty ?: "Consulta médica por videollamada",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                        textAlign = TextAlign.Center,
                    )

                    Spacer(modifier = Modifier.height(18.dp))

                    // Botón de Conexión Inmediata Ergonómico
                    Button(
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onJoinCall()
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = AuEmerald,
                            contentColor = Color.White,
                        ),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Videocam,
                            contentDescription = null,
                            modifier = Modifier.size(22.dp),
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = "Ingresar a la Consulta Ahora",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            CaseDetailsCard(uiState = uiState)

            Spacer(modifier = Modifier.height(16.dp))

            // Once a physician accepted, this is not a queued request.
            // Do not offer a misleading "Cancel request" action that the
            // backend rightfully refuses after assignment.

        } else {
            // ── EFECTO UBER PARA TELEMEDICINA DE GUARDIA ──
            val onlineDoctorCount = uiState.onlineDoctorsInMarket
            val hasOnlineDoctors = if (onlineDoctorCount != null) {
                onlineDoctorCount > 0
            } else {
                uiState.activeDoctors.any { it.isAvailable }
            }
            val doctorAssigned = uiState.status == PharmacyConsultationStatus.ASSIGNED

            val marketName = when (uiState.careCountry) {
                "AR" -> "Argentina"
                "BR" -> "Brasil"
                else -> "el país seleccionado"
            }

            Text(
                text = if (doctorAssigned) "Médico asignado" else "Estás en la fila de atención",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = if (doctorAssigned)
                    "El médico aceptó tu consulta. Estamos preparando la videollamada."
                else
                    "Solicitud activa · $marketName",
                style = MaterialTheme.typography.bodyMedium,
                color = AuTextSecondary,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(14.dp))

            // 1. Live Medical Dispatch Radar (Radar de Guardia en Vivo con médicos reales)
            LiveMedicalPresenceRadar(doctors = uiState.activeDoctors)

            Spacer(modifier = Modifier.height(14.dp))

            // Estado explícito si no hay médicos en línea (Cero Amarillo - Paleta Cyan / Slate)
            if (!hasOnlineDoctors && !doctorAssigned) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = AuCyanSoft,
                    border = BorderStroke(1.dp, AuCyan.copy(alpha = 0.25f)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = AuCyanDeep,
                            strokeWidth = 2.dp,
                        )
                        Column {
                            Text(
                                text = if (onlineDoctorCount == null)
                                    "Consultando disponibilidad médica en $marketName..."
                                else
                                    "Esperando que haya un médico disponible en $marketName.",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = AuTextPrimary,
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "Tu solicitud ya está registrada y sigue en la fila. No necesitás volver a solicitarla.",
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary,
                            )
                        }
                    }
                }
            }

            if (hasOnlineDoctors && !doctorAssigned) {
                Text(
                    text = "${onlineDoctorCount ?: uiState.activeDoctors.count { it.isAvailable }} profesional(es) disponible(s) en $marketName. Tu solicitud sigue en la fila hasta que alguien la acepte.",
                    color = AuTextSecondary,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                )
            }

            // 2. Ticker de Telemetría Dinámica (Dispatch Status Ticker)
            DispatchTelemetryTicker(onlineDoctorCount = onlineDoctorCount)

            Spacer(modifier = Modifier.height(16.dp))

            // 3. Queue stats row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = AuSurface,
                    border = BorderStroke(1.dp, AuBorder),
                    modifier = Modifier.weight(1f),
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = "Posición en fila",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )
                        Spacer(modifier = Modifier.height(3.dp))
                        Text(
                            text = queuePositionLabel(uiState.queuePosition),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = Primary,
                        )
                    }
                }

                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = AuSurface,
                    border = BorderStroke(1.dp, AuBorder),
                    modifier = Modifier.weight(1f),
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Outlined.Schedule,
                                contentDescription = null,
                                tint = AuTextTertiary,
                                modifier = Modifier.size(13.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Tiempo estimado",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextTertiary,
                            )
                        }
                        Spacer(modifier = Modifier.height(3.dp))
                        Text(
                            text = waitingTimeLabel(uiState.estimatedMinutes),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // 4. Panel de Red Médica Conectada ('Médicos en Guardia Activos')
            ActiveMedicalNetworkPanel(doctors = uiState.activeDoctors)

            Spacer(modifier = Modifier.height(16.dp))

            // 5. Acción de Salir de la fila (Azul AutaMedica outline)
            if (!doctorAssigned) OutlinedButton(
                onClick = onCancelRequest,
                enabled = !uiState.isSubmitting,
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, Primary.copy(alpha = 0.35f)),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = Primary,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) {
                Text(
                    text = if (uiState.isSubmitting) "Cancelando..." else "Cancelar solicitud",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun CaseDetailsCard(
    uiState: PharmacyIntakeUiState,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        shadowElevation = 2.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Drag handle pill estilo Nubank
            Box(
                modifier = Modifier
                    .width(36.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(AuBorder)
            )

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = uiState.patientName.ifBlank { "Paciente" },
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "DNI ${uiState.patientDni} • ${uiState.effectiveReason}",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = AuCyanSoft,
                    border = BorderStroke(0.5.dp, AuCyan.copy(alpha = 0.3f)),
                ) {
                    Text(
                        text = "Turno Inmediato",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = AuCyanDeep,
                        fontSize = 10.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }
        }
    }
}
