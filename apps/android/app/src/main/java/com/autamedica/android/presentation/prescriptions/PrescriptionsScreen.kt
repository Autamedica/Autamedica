package com.autamedica.android.presentation.prescriptions

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.presentation.prescriptions.components.QrCodeView
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.presentation.theme.PortalPatientsSoft
import com.autamedica.android.presentation.theme.SuccessContainer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrescriptionsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: PrescriptionsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Recetas Digitales",
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "Prescripciones electrónicas oficiales",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextTertiary,
                        )
                    }
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
                actions = {
                    IconButton(onClick = viewModel::refresh) {
                        Icon(
                            imageVector = Icons.Outlined.Refresh,
                            contentDescription = "Actualizar",
                            tint = AuTextSecondary,
                        )
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
                uiState.isLoading && uiState.prescriptions.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(
                            color = PortalPatients,
                            strokeWidth = 3.dp,
                        )
                    }
                }

                uiState.error != null && uiState.prescriptions.isEmpty() -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Medication,
                                contentDescription = null,
                                tint = AuDanger,
                                modifier = Modifier.size(54.dp),
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                text = "No se pudieron cargar las recetas",
                                style = MaterialTheme.typography.titleMedium,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = uiState.error ?: "",
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary,
                                textAlign = TextAlign.Center,
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(
                                onClick = viewModel::loadPrescriptions,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = PortalPatients,
                                ),
                            ) {
                                Text("Reintentar")
                            }
                        }
                    }
                }

                uiState.prescriptions.isEmpty() -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = PortalPatientsSoft,
                                modifier = Modifier.size(72.dp),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = Icons.Outlined.Medication,
                                        contentDescription = null,
                                        tint = PortalPatients,
                                        modifier = Modifier.size(36.dp),
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = "Sin recetas emitidas",
                                style = MaterialTheme.typography.titleMedium,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.Bold,
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "Las prescripciones digitales firmadas por tus médicos tratantes aparecerán aquí con su código QR para farmacia.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = AuTextSecondary,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(
                            items = uiState.prescriptions,
                            key = { it.id },
                        ) { prescription ->
                            PrescriptionCard(
                                prescription = prescription,
                                onClick = { viewModel.selectPrescription(prescription) },
                            )
                        }
                    }
                }
            }
        }
    }

    // Detail BottomSheet
    uiState.selectedPrescription?.let { selected ->
        PrescriptionDetailBottomSheet(
            prescription = selected,
            onDismiss = viewModel::clearSelectedPrescription,
            onOpenPdf = { pdfUrl ->
                runCatching {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(pdfUrl))
                    context.startActivity(intent)
                }.onFailure {
                    Toast.makeText(context, "No se pudo abrir el PDF oficial.", Toast.LENGTH_SHORT).show()
                }
            },
            onCopyCuir = { cuir ->
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = ClipData.newPlainText("CUIR", cuir)
                clipboard.setPrimaryClip(clip)
                Toast.makeText(context, "CUIR copiado al portapapeles", Toast.LENGTH_SHORT).show()
            },
        )
    }
}

@Composable
private fun PrescriptionCard(
    prescription: Prescription,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f),
                ) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = PortalPatientsSoft,
                        modifier = Modifier.size(36.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Outlined.Medication,
                                contentDescription = null,
                                tint = PortalPatients,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = prescription.medicationName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (prescription.dosage.isNotBlank() || prescription.frequency.isNotBlank()) {
                            Text(
                                text = listOf(prescription.dosage, prescription.frequency)
                                    .filter { it.isNotBlank() }
                                    .joinToString(" • "),
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary,
                            )
                        }
                    }
                }

                PrescriptionStatusBadge(status = prescription.status)
            }

            if (prescription.instructions.isNotBlank()) {
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = prescription.instructions,
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
            HorizontalDivider(color = AuBorder, thickness = 0.5.dp)
            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = prescription.doctorName ?: "Dr. Médico Tratante",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                        color = AuTextPrimary,
                    )
                    prescription.doctorLicense?.let { license ->
                        Text(
                            text = "Matrícula: $license",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.QrCodeScanner,
                        contentDescription = "Ver QR",
                        tint = PortalPatients,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = "Ver QR",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = PortalPatients,
                    )
                }
            }
        }
    }
}

@Composable
private fun PrescriptionStatusBadge(
    status: String,
    modifier: Modifier = Modifier,
) {
    val (bgColor, textColor, label) = when (status.lowercase()) {
        "signed", "firmada" -> Triple(SuccessContainer, AuSuccess, "Firmada")
        "dispensed", "dispensada" -> Triple(AuSurfaceHover, AuTextTertiary, "Dispensada")
        "active", "activa" -> Triple(PortalPatientsSoft, PortalPatients, "Activa")
        "cancelled", "cancelada" -> Triple(Color(0xFFFEE2E2), AuDanger, "Cancelada")
        else -> Triple(PortalPatientsSoft, PortalPatients, status.replaceFirstChar { it.uppercase() })
    }

    Surface(
        shape = RoundedCornerShape(6.dp),
        color = bgColor,
        modifier = modifier,
    ) {
        Text(
            text = label,
            color = textColor,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PrescriptionDetailBottomSheet(
    prescription: Prescription,
    onDismiss: () -> Unit,
    onOpenPdf: (url: String) -> Unit,
    onCopyCuir: (cuir: String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = AuSurface,
        dragHandle = null,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Drag indicator visual bar
            Box(
                modifier = Modifier
                    .size(width = 36.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(AuTextTertiary.copy(alpha = 0.4f)),
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Header title & badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = prescription.medicationName,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                    if (prescription.dosage.isNotBlank()) {
                        Text(
                            text = prescription.dosage,
                            style = MaterialTheme.typography.bodyMedium,
                            color = AuTextSecondary,
                        )
                    }
                }
                PrescriptionStatusBadge(status = prescription.status)
            }

            Spacer(modifier = Modifier.height(20.dp))

            // QR Code Box for Pharmacy Validation
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = Color.White,
                border = BorderStroke(1.5.dp, AuBorder),
                modifier = Modifier.padding(vertical = 4.dp),
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(16.dp),
                ) {
                    QrCodeView(
                        content = prescription.effectiveQrContent,
                        size = 220.dp,
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.VerifiedUser,
                            contentDescription = null,
                            tint = AuSuccess,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Código de Validación Farmacéutica",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF1E293B),
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Presenta este código en la farmacia para verificación y dispensa oficial (SISA WS020 / Farmalink).",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 8.dp),
            )

            // CUIR Card if available
            prescription.cuir?.takeIf { it.isNotBlank() }?.let { cuir ->
                Spacer(modifier = Modifier.height(16.dp))
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = AuBackground,
                    border = BorderStroke(1.dp, AuBorder),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "CUIR (CÓDIGO ÚNICO DE IDENTIFICACIÓN)",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = AuTextTertiary,
                                fontSize = 10.sp,
                            )
                            Text(
                                text = cuir,
                                style = MaterialTheme.typography.bodyMedium,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                            )
                        }
                        OutlinedButton(
                            onClick = { onCopyCuir(cuir) },
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                            shape = RoundedCornerShape(8.dp),
                            border = BorderStroke(1.dp, PortalPatients),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.ContentCopy,
                                contentDescription = "Copiar",
                                tint = PortalPatients,
                                modifier = Modifier.size(14.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Copiar",
                                style = MaterialTheme.typography.labelSmall,
                                color = PortalPatients,
                            )
                        }
                    }
                }
            }

            // Clinical directions
            if (prescription.frequency.isNotBlank() || prescription.instructions.isNotBlank()) {
                Spacer(modifier = Modifier.height(16.dp))
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = AuBackground,
                    modifier = Modifier.fillMaxWidth(),
                    border = BorderStroke(0.5.dp, AuBorder),
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = "INDICACIONES DE TOMA",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = AuTextTertiary,
                            fontSize = 10.sp,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        if (prescription.frequency.isNotBlank()) {
                            Text(
                                text = "Frecuencia: ${prescription.frequency}",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                color = AuTextPrimary,
                            )
                        }
                        if (prescription.instructions.isNotBlank()) {
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = prescription.instructions,
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary,
                            )
                        }
                    }
                }
            }

            // Doctor details
            Spacer(modifier = Modifier.height(14.dp))
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = AuBackground,
                modifier = Modifier.fillMaxWidth(),
                border = BorderStroke(0.5.dp, AuBorder),
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CheckCircle,
                        contentDescription = null,
                        tint = PortalPatients,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = prescription.doctorName ?: "Dr. Médico Tratante",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = AuTextPrimary,
                        )
                        prescription.doctorLicense?.let { license ->
                            Text(
                                text = "Matrícula Profesional: $license",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextSecondary,
                            )
                        }
                    }
                }
            }

            // PDF Button for interoperability
            prescription.signedPdfUrl?.takeIf { it.isNotBlank() }?.let { pdfUrl ->
                Spacer(modifier = Modifier.height(20.dp))
                Button(
                    onClick = { onOpenPdf(pdfUrl) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalPatients,
                    ),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Description,
                        contentDescription = null,
                        tint = Color.White,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Ver Receta Oficial (PDF)",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Icon(
                        imageVector = Icons.Outlined.OpenInNew,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
