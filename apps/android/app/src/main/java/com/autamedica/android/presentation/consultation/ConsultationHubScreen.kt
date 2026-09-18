package com.autamedica.android.presentation.consultation

import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.QrCode
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.presentation.consultation.components.ActivePrescriptionsSection
import com.autamedica.android.presentation.consultation.components.ClinicalConstantsBar
import com.autamedica.android.presentation.consultation.components.ContinuityCheckInCard
import com.autamedica.android.presentation.consultation.components.PendingOrdersSection
import com.autamedica.android.presentation.consultation.components.RealTimeConsoleCard
import com.autamedica.android.presentation.prescriptions.components.QrCodeView
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.presentation.theme.SuccessContainer

/**
 * Pantalla principal "Consultar" del paciente.
 * Diseñada bajo la filosofía de máxima densidad y transparencia clínica (Nubank)
 * y despacho determinista de atención en tiempo real (Uber). Cero relleno publicitario.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsultationHubScreen(
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToBookAppointment: () -> Unit = {},
    onNavigateToAnamnesis: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: ConsultationHubViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    // Redirección segura para checkout de MercadoPago
    LaunchedEffect(uiState.checkoutUrlToLaunch) {
        val url = uiState.checkoutUrlToLaunch ?: return@LaunchedEffect
        runCatching {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
        viewModel.clearCheckoutUrl()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Consultar",
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(AuSuccess),
                            )
                            Text(
                                text = "Atención Médica y Telemedicina",
                                style = MaterialTheme.typography.labelSmall,
                                color = PortalPatients,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                },
                actions = {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = PortalPatients.copy(alpha = 0.12f),
                        border = BorderStroke(1.dp, PortalPatients.copy(alpha = 0.35f)),
                        modifier = Modifier
                            .padding(end = 12.dp)
                            .clickable { onNavigateToBookAppointment() },
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.Add,
                                contentDescription = null,
                                tint = PortalPatients,
                                modifier = Modifier.size(16.dp),
                            )
                            Text(
                                text = "Agendar Turno",
                                style = MaterialTheme.typography.labelMedium,
                                color = PortalPatients,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AuBackground,
                ),
            )
        },
        containerColor = AuBackground,
        modifier = modifier,
    ) { innerPadding ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = viewModel::refresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = PortalPatients, strokeWidth = 2.dp)
                    }
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        // ── 1. TIRA DE CONSTANTES CLÍNICAS (Nubank style: Alergias, Medicamentos, Anamnesis) ──
                        item {
                            ClinicalConstantsBar(
                                constants = uiState.clinicalConstants,
                                onNavigateToAnamnesis = onNavigateToAnamnesis,
                            )
                        }

                        // ── Toast informativo clínico si existe ──
                        uiState.toastMessage?.let { msg ->
                            item {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = SuccessContainer,
                                    border = BorderStroke(1.dp, AuSuccess.copy(alpha = 0.4f)),
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.CheckCircle,
                                            contentDescription = null,
                                            tint = AuSuccess,
                                            modifier = Modifier.size(18.dp),
                                        )
                                        Text(
                                            text = msg,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = AuTextPrimary,
                                            modifier = Modifier.weight(1f),
                                        )
                                        TextButton(onClick = viewModel::clearToast) {
                                            Text("OK", color = AuSuccess, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                        }

                        // ── 2. CONSOLA DE ATENCIÓN EN TIEMPO REAL (Uber style: FSM) ──
                        item {
                            RealTimeConsoleCard(
                                state = uiState.consoleState,
                                onEnterVideoCall = onNavigateToVideoCall,
                                onPayAppointment = viewModel::payAppointment,
                                onChiefComplaintChanged = viewModel::onChiefComplaintChanged,
                                onSymptomChipToggled = viewModel::onSymptomChipToggled,
                                onBypassRedFlags = viewModel::bypassRedFlags,
                                onRequestEmergencyDispatch = { onReady ->
                                    viewModel.requestEmergencyDispatch { appointmentId ->
                                        onReady(appointmentId)
                                        onNavigateToVideoCall(appointmentId)
                                    }
                                },
                                onNavigateToSchedule = onNavigateToBookAppointment,
                            )
                        }

                        // ── 3. CONTINUIDAD ASISTENCIAL (Check-in 48h Post-Consulta) ──
                        uiState.pendingFollowupCheckIn?.let { followup ->
                            item {
                                ContinuityCheckInCard(
                                    followup = followup,
                                    isSubmitting = uiState.isSubmittingCheckIn,
                                    onSubmitEvolution = viewModel::submitFollowupEvolution,
                                )
                            }
                        }

                        // ── 4. FARMACOTERAPIA ACTIVA (Recetas vigentes con CUIR y QR) ──
                        if (uiState.activePrescriptions.isNotEmpty()) {
                            item {
                                ActivePrescriptionsSection(
                                    prescriptions = uiState.activePrescriptions,
                                    onSelectPrescriptionForQr = viewModel::selectPrescriptionForQr,
                                )
                            }
                        }

                        // ── 5. ÓRDENES DE ESTUDIOS MÉDICOS Y LABORATORIO PENDIENTES ──
                        if (uiState.pendingMedicalOrders.isNotEmpty()) {
                            item {
                                PendingOrdersSection(
                                    orders = uiState.pendingMedicalOrders,
                                )
                            }
                        }

                        // Espaciado inferior de seguridad
                        item {
                            Spacer(modifier = Modifier.height(24.dp))
                        }
                    }
                }
            }
        }
    }

    // ── DIÁLOGO EMERGENTE: CÓDIGO QR PARA MOSTRADOR DE FARMACIA (DECRETO 63) ──
    uiState.selectedPrescriptionForQr?.let { prescription ->
        AlertDialog(
            onDismissRequest = { viewModel.selectPrescriptionForQr(null) },
            title = {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            text = "Código QR de Validación",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = "Para presentar en mostrador de farmacia",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )
                    }
                    IconButton(onClick = { viewModel.selectPrescriptionForQr(null) }) {
                        Icon(imageVector = Icons.Outlined.Close, contentDescription = "Cerrar")
                    }
                }
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    // QR de farmacia en alta definición
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color.White,
                        border = BorderStroke(1.dp, AuBorder),
                        modifier = Modifier.padding(vertical = 8.dp),
                    ) {
                        Box(
                            modifier = Modifier.padding(16.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            val qrPayload = prescription.qrCodeContent
                                ?: prescription.cuir
                                ?: prescription.id

                            QrCodeView(
                                content = qrPayload,
                                size = 200.dp,
                            )
                        }
                    }

                    // Detalle del fármaco y CUIR legal
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            text = prescription.medicationName,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = "${prescription.dosage} · ${prescription.frequency}",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                        prescription.cuir?.let { cuir ->
                            Text(
                                text = "CUIR: $cuir",
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = FontFamily.Monospace,
                                color = AuTextTertiary,
                                fontSize = 11.sp,
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { viewModel.selectPrescriptionForQr(null) }) {
                    Text("Cerrar", fontWeight = FontWeight.Bold, color = PortalPatients)
                }
            },
            containerColor = AuSurface,
            shape = RoundedCornerShape(20.dp),
        )
    }
}