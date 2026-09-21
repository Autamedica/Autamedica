package com.autamedica.android.presentation.pharmacy

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
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.autamedica.android.presentation.theme.Primary
import com.autamedica.android.presentation.theme.PrimaryDark
import com.autamedica.android.presentation.theme.PrimaryLight
import com.autamedica.android.domain.model.PharmacyConsultationStatus
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
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

    // Automatic navigation when doctor accepts and assigns room
    LaunchedEffect(uiState.readyToJoinCall, uiState.roomId) {
        if (uiState.readyToJoinCall && !uiState.roomId.isNullOrBlank()) {
            onNavigateToCall(uiState.roomId!!)
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
                                text = "Intake Exprés On-Demand",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextTertiary,
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = {
                        if (uiState.activeRequestId != null) {
                            viewModel.cancelActiveRequest()
                        }
                        onBack()
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
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scrollState = rememberScrollState()

    Column(
        modifier = modifier
            .verticalScroll(scrollState)
            .padding(horizontal = 20.dp, vertical = 12.dp),
    ) {
        // Hero Banner with AutaMedica Logo
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = AuSurface,
            border = BorderStroke(1.dp, Primary.copy(alpha = 0.25f)),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Primary.copy(alpha = 0.08f),
                    border = BorderStroke(1.dp, Primary.copy(alpha = 0.15f)),
                    modifier = Modifier.size(48.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Image(
                            painter = painterResource(id = R.drawable.logo_autamedica),
                            contentDescription = "AutaMedica",
                            modifier = Modifier.size(34.dp),
                            contentScale = ContentScale.Fit,
                        )
                    }
                }
                Spacer(modifier = Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Atención Médica Inmediata",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                    Text(
                        text = "Conexión directa con guardia médica.",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                        lineHeight = 16.sp,
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Account Autofill Badge
        if (uiState.isAuthenticated) {
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = SuccessContainer,
                border = BorderStroke(1.dp, AuSuccess.copy(alpha = 0.3f)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = AuSuccess,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Datos autocompletados desde tu perfil",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF065F46),
                    )
                }
            }
            Spacer(modifier = Modifier.height(14.dp))
        }

        // 1. Motivo de Consulta (Focus principal del usuario)
        Text(
            text = "Motivo de Consulta",
            style = MaterialTheme.typography.titleSmall,
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
                    onClick = { onReasonChipSelected(chip) },
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
            label = { Text("Detalle del motivo o medicamento") },
            placeholder = { Text("Ej: Renovar Losartán 50mg / Presión arterial") },
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

        // 2. Datos del Paciente (Autocompletados y editables)
        Text(
            text = "Datos del Paciente",
            style = MaterialTheme.typography.titleSmall,
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
            label = { Text("DNI / Cédula") },
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

        // Error Banner
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
            onClick = onSubmit,
            enabled = !uiState.isSubmitting && uiState.isFormValid,
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
                    text = "Solicitar Teleconsulta Exprés",
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
    val isAssigned = uiState.status == PharmacyConsultationStatus.ASSIGNED ||
        uiState.status == PharmacyConsultationStatus.IN_CALL ||
        uiState.readyToJoinCall

    val scrollState = rememberScrollState()

    Column(
        modifier = modifier
            .verticalScroll(scrollState)
            .padding(horizontal = 20.dp, vertical = 16.dp)
            .fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (isAssigned) {
            Spacer(modifier = Modifier.height(16.dp))

            Surface(
                shape = CircleShape,
                color = SuccessContainer,
                border = BorderStroke(1.5.dp, AuSuccess.copy(alpha = 0.35f)),
                modifier = Modifier.size(96.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = AuSuccess,
                        modifier = Modifier.size(50.dp),
                    )
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            Text(
                text = "¡Médico Asignado!",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = uiState.assignedDoctorName ?: "Dr. de Guardia Médica",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = Primary,
                textAlign = TextAlign.Center,
            )
            Text(
                text = uiState.assignedDoctorSpecialty ?: "Medicina General",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(16.dp))

            Surface(
                shape = RoundedCornerShape(12.dp),
                color = SuccessContainer,
                border = BorderStroke(1.dp, AuSuccess.copy(alpha = 0.3f)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = AuSuccess,
                        strokeWidth = 2.dp,
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "Iniciando sala de teleconsulta en vivo...",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF065F46),
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            Button(
                onClick = onJoinCall,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Primary,
                    contentColor = Color.White,
                ),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Videocam,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Ingresar a la Consulta Ahora",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            CaseDetailsCard(uiState = uiState)

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedButton(
                onClick = onCancelRequest,
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, Primary.copy(alpha = 0.35f)),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = Primary,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .sizeIn(minHeight = 44.dp),
            ) {
                Text(
                    text = "Salir de la fila",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        } else {
            // ── EFECTO UBER PARA TELEMEDICINA DE GUARDIA ──

            Text(
                text = "Buscando médico de guardia...",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(14.dp))

            // 1. Live Medical Dispatch Radar (Radar de Guardia en Vivo)
            LiveMedicalPresenceRadar()

            Spacer(modifier = Modifier.height(14.dp))

            // 2. Ticker de Telemetría Dinámica (Dispatch Status Ticker)
            DispatchTelemetryTicker()

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
                            text = "#${uiState.queuePosition.coerceAtLeast(1)}",
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
                            text = "~${uiState.estimatedMinutes.coerceAtLeast(1)} min",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // 4. Panel de Red Médica Conectada ('Médicos en Guardia Activos')
            ActiveMedicalNetworkPanel()

            Spacer(modifier = Modifier.height(16.dp))

            // 5. Case summary card (Compacto)
            CaseDetailsCard(uiState = uiState)

            Spacer(modifier = Modifier.height(16.dp))

            // 6. Acción de Salir de la fila (Azul AutaMedica outline)
            OutlinedButton(
                onClick = onCancelRequest,
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
                    text = "Salir de la fila",
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
        shape = RoundedCornerShape(12.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .padding(horizontal = 14.dp, vertical = 10.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = uiState.patientName.ifBlank { "Paciente" },
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = AuTextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "DNI ${uiState.patientDni} • ${uiState.effectiveReason}",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextTertiary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
