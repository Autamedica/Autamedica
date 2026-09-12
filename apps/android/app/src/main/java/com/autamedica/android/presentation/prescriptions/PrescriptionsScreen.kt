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
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.QrCode
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Schedule
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
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatients
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrescriptionsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onRequestConsultation: () -> Unit = onBack,
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
                            text = "Mis Recetas",
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        val active = uiState.activeCount
                        Text(
                            text = if (active > 0) "$active ${if (active == 1) "activa" else "activas"} para farmacia" else "Sin recetas pendientes",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (active > 0) Color(0xFF15803D) else AuTextSecondary,
                            fontWeight = FontWeight.Medium,
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
            Column(modifier = Modifier.fillMaxSize()) {
                // Filtros rápidos: Todas, Activas, Dispensadas, Completadas
                PrescriptionsFilterChips(
                    selectedFilter = uiState.selectedFilter,
                    onSelectFilter = viewModel::setFilter,
                )

                // Contenido de recetas
                when {
                    uiState.isLoading && uiState.prescriptions.isEmpty() -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(
                                color = Color(0xFF171717),
                                strokeWidth = 3.dp,
                            )
                        }
                    }

                    uiState.error != null && uiState.prescriptions.isEmpty() -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f)
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
                                        containerColor = Color(0xFF171717),
                                        contentColor = Color.White,
                                    ),
                                    shape = CircleShape,
                                ) {
                                    Text("Reintentar")
                                }
                            }
                        }
                    }

                    uiState.filteredPrescriptions.isEmpty() -> {
                        EmptyPrescriptionsView(
                            filter = uiState.selectedFilter,
                            onRequestConsultation = onRequestConsultation,
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                        )
                    }

                    else -> {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            items(
                                items = uiState.filteredPrescriptions,
                                key = { it.id },
                            ) { prescription ->
                                PrescriptionCard(
                                    prescription = prescription,
                                    onClick = { viewModel.selectPrescription(prescription) },
                                    onOpenPdf = { pdfUrl ->
                                        runCatching {
                                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(pdfUrl)).apply {
                                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                            }
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
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(pdfUrl)).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
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
private fun PrescriptionsFilterChips(
    selectedFilter: PrescriptionFilter,
    onSelectFilter: (PrescriptionFilter) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        PrescriptionFilter.entries.forEach { filter ->
            val isSelected = selectedFilter == filter
            Surface(
                onClick = { onSelectFilter(filter) },
                shape = CircleShape,
                color = if (isSelected) Color(0xFF1E293B) else Color.White,
                border = BorderStroke(1.dp, if (isSelected) Color(0xFF1E293B) else Color(0xFFCBD5E1)),
            ) {
                Text(
                    text = filter.label,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (isSelected) Color.White else Color(0xFF334155),
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                )
            }
        }
    }
}

@Composable
private fun PrescriptionCard(
    prescription: Prescription,
    onClick: () -> Unit,
    onOpenPdf: (url: String) -> Unit,
    onCopyCuir: (cuir: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val doctorText = formatDoctorName(prescription.doctorName)
    val dateStr = formatPrescriptionDate(prescription.prescribedDate ?: prescription.createdAt)
    val downloadablePdfUrl = getDownloadablePdfUrl(prescription.signedPdfUrl, prescription.cuir)
    val formattedMedication = formatMedicationName(prescription.medicationName)
    val formattedPosology = formatPosologySummary(prescription.dosage, prescription.frequency, prescription.duration)

    Surface(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)), // slate-200
        shadowElevation = 0.5.dp,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            // Fila 1: Nombre del medicamento y Badge de estado
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = formattedMedication,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = Color(0xFF0F172A), // slate-900
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(modifier = Modifier.width(8.dp))
                PrescriptionStatusBadge(status = prescription.status)
            }

            // Fila 2: Posología legible (ej. "600 mg · Cada 8 hs · 7 días")
            if (formattedPosology.isNotBlank()) {
                Spacer(modifier = Modifier.height(3.dp))
                Text(
                    text = formattedPosology,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFF334155), // slate-700
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Fila 3: Médico y fecha
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = "$doctorText · $dateStr",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF64748B), // slate-500
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Fila 4: Banda de acción directa "Mostrar en farmacia" con QR + CUIR
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = Color(0xFFF1F5F9), // slate-100
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.QrCode,
                            contentDescription = null,
                            tint = Color(0xFF0F172A),
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = "QR Farmacia",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF0F172A),
                        )
                        prescription.cuir?.takeIf { it.isNotBlank() }?.let { cuir ->
                            Text(
                                text = "· ${cuir.takeLast(8)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Medium,
                                color = Color(0xFF475569),
                            )
                        }
                    }

                    if (downloadablePdfUrl != null) {
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = Color(0xFFFEE2E2),
                            modifier = Modifier.clickable { onOpenPdf(downloadablePdfUrl) },
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.PictureAsPdf,
                                    contentDescription = "Descargar PDF",
                                    tint = Color(0xFFDC2626),
                                    modifier = Modifier.size(13.dp),
                                )
                                Text(
                                    text = "PDF",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFDC2626),
                                )
                            }
                        }
                    }
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
    val style = getPrescriptionStatusStyle(status)

    Surface(
        shape = CircleShape,
        color = style.containerColor,
        modifier = modifier,
    ) {
        Text(
            text = style.label,
            color = style.contentColor,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun EmptyPrescriptionsView(
    filter: PrescriptionFilter,
    onRequestConsultation: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val (title, description) = when (filter) {
        PrescriptionFilter.TODAS, PrescriptionFilter.ACTIVAS -> Pair(
            "Sin recetas activas",
            "Cuando tu médico te prescriba un medicamento, aparecerá aquí con verificación digital.",
        )
        PrescriptionFilter.DISPENSADAS -> Pair(
            "Sin recetas dispensadas",
            "No registras recetas retiradas o dispensadas en farmacia en este momento.",
        )
        PrescriptionFilter.COMPLETADAS -> Pair(
            "Sin recetas completadas",
            "No registras tratamientos o prescripciones finalizadas en este momento.",
        )
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 48.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Surface(
                shape = CircleShape,
                color = Color(0xFFF5F5F5), // neutral-100
                modifier = Modifier.size(80.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Outlined.Medication,
                        contentDescription = null,
                        tint = Color(0xFFA3A3A3), // neutral-400
                        modifier = Modifier.size(40.dp),
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF171717),
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF737373), // neutral-500
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 16.dp),
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = onRequestConsultation,
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF171717), // neutral-900
                    contentColor = Color.White,
                ),
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 14.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.CalendarMonth,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Solicitar consulta médica",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Medium,
                    color = Color.White,
                )
            }
        }
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
    val doctorText = formatDoctorName(prescription.doctorName)
    val dateStr = formatPrescriptionDate(prescription.prescribedDate ?: prescription.createdAt)
    val formattedMedication = formatMedicationName(prescription.medicationName)
    val downloadablePdfUrl = getDownloadablePdfUrl(prescription.signedPdfUrl, prescription.cuir)

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
                .padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Indicador de arrastre superior
            Box(
                modifier = Modifier
                    .size(width = 36.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(AuTextTertiary.copy(alpha = 0.4f)),
            )

            Spacer(modifier = Modifier.height(14.dp))

            // Encabezado: Nombre del medicamento en grande + Estado + Cerrar
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = formattedMedication,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp,
                        color = Color(0xFF0F172A),
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        PrescriptionStatusBadge(status = prescription.status)
                        Text(
                            text = "$doctorText · $dateStr",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF64748B),
                        )
                    }
                }

                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.size(36.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Close,
                        contentDescription = "Cerrar",
                        tint = AuTextSecondary,
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // ─────────────────────────────────────────────────────────────
            // MODO FARMACIA — QR GRANDE + CUIR MONOSPACE (zona principal)
            // ─────────────────────────────────────────────────────────────
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = Color.White,
                border = BorderStroke(1.5.dp, Color(0xFFE2E8F0)), // slate-200
                shadowElevation = 1.dp,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(16.dp),
                ) {
                    Text(
                        text = "PRESENTÁ ESTE CÓDIGO EN LA FARMACIA",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0284C7), // sky-600
                        letterSpacing = 0.5.sp,
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    // QR Code centrado y de alto contraste
                    Box(
                        modifier = Modifier
                            .size(210.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color.White),
                        contentAlignment = Alignment.Center,
                    ) {
                        QrCodeView(
                            content = prescription.effectiveQrContent,
                            size = 200.dp,
                        )
                    }

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
                            text = "Validación oficial Decreto 63 / SISA REFEPS",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF1E293B),
                        )
                    }

                    // Caja de CUIR grande y legible con botón copiar
                    prescription.cuir?.takeIf { it.isNotBlank() }?.let { cuir ->
                        Spacer(modifier = Modifier.height(12.dp))
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFFF8FAFC), // slate-50
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "CÓDIGO CUIR:",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF64748B),
                                        fontSize = 10.sp,
                                    )
                                    Text(
                                        text = cuir,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF0F172A),
                                    )
                                }
                                OutlinedButton(
                                    onClick = { onCopyCuir(cuir) },
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                    shape = RoundedCornerShape(8.dp),
                                    border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.ContentCopy,
                                        contentDescription = "Copiar",
                                        tint = Color(0xFF334155),
                                        modifier = Modifier.size(14.dp),
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(
                                        text = "Copiar",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Color(0xFF334155),
                                    )
                                }
                            }
                        }
                    }

                    // Botón de PDF oficial si está disponible
                    if (downloadablePdfUrl != null) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = { onOpenPdf(downloadablePdfUrl) },
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFFDC2626),
                                contentColor = Color.White,
                            ),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.PictureAsPdf,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(
                                text = "Descargar Receta (PDF)",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))
            HorizontalDivider(color = AuBorder, thickness = 0.5.dp)
            Spacer(modifier = Modifier.height(16.dp))

            // ─────────────────────────────────────────────────────────────
            // SECCIÓN SECUNDARIA: INDICACIONES MÉDICAS (CÓMO TOMARLO)
            // ─────────────────────────────────────────────────────────────
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "CÓMO TOMARLO (INDICACIONES MÉDICAS)",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF64748B),
                    letterSpacing = 0.5.sp,
                )

                Spacer(modifier = Modifier.height(8.dp))

                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        // Dosis y posología
                        if (prescription.dosage.isNotBlank() || prescription.frequency.isNotBlank() || prescription.duration.isNotBlank()) {
                            val posologyText = formatPosologySummary(prescription.dosage, prescription.frequency, prescription.duration)
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.Schedule,
                                    contentDescription = null,
                                    tint = Color(0xFF0284C7),
                                    modifier = Modifier.size(18.dp),
                                )
                                Text(
                                    text = posologyText.ifBlank { prescription.dosage },
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF1E293B),
                                )
                            }
                        }

                        // Indicaciones de administración
                        if (prescription.instructions.isNotBlank()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Color(0xFFF0F9FF),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(modifier = Modifier.padding(10.dp)) {
                                    Text(
                                        text = "INDICACIÓN",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF0369A1),
                                        fontSize = 10.sp,
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = prescription.instructions,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = Color(0xFF0C4A6E),
                                    )
                                }
                            }
                        }

                        // Diagnóstico si existe
                        prescription.diagnosis?.takeIf { it.isNotBlank() }?.let { diag ->
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Diagnóstico: $diag",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFF64748B),
                            )
                        }

                        // Notas si existen
                        prescription.notes?.takeIf { it.isNotBlank() }?.let { notes ->
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "Notas: $notes",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFF64748B),
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Tarjeta del médico tratante
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color.White,
                border = BorderStroke(0.5.dp, Color(0xFFE2E8F0)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CheckCircle,
                        contentDescription = null,
                        tint = AuSuccess,
                        modifier = Modifier.size(18.dp),
                    )
                    Column {
                        Text(
                            text = doctorText,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = AuTextPrimary,
                        )
                        prescription.doctorLicense?.takeIf { it.isNotBlank() }?.let { license ->
                            Text(
                                text = "Matrícula: $license",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextSecondary,
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de Formato y Estilo Visual
// ─────────────────────────────────────────────────────────────────────────────

private data class StatusBadgeStyle(
    val label: String,
    val containerColor: Color,
    val contentColor: Color,
)

private fun getPrescriptionStatusStyle(status: String): StatusBadgeStyle {
    return when (status.lowercase()) {
        "activa", "active", "sent", "signed", "firmada" -> StatusBadgeStyle(
            label = "Activa",
            containerColor = Color(0xFFDCFCE7), // emerald-100
            contentColor = Color(0xFF15803D), // emerald-700
        )
        "dispensed", "dispensada", "dispensed_total" -> StatusBadgeStyle(
            label = "Dispensada",
            containerColor = Color(0xFFE0F2FE), // sky-100
            contentColor = Color(0xFF0369A1), // sky-700
        )
        "dispensed_partial" -> StatusBadgeStyle(
            label = "Parcial",
            containerColor = Color(0xFFFEF3C7), // amber-100
            contentColor = Color(0xFFB45309), // amber-700
        )
        "completed", "completada" -> StatusBadgeStyle(
            label = "Completada",
            containerColor = Color(0xFFF1F5F9), // slate-100
            contentColor = Color(0xFF475569), // slate-600
        )
        "expired", "vencida" -> StatusBadgeStyle(
            label = "Vencida",
            containerColor = Color(0xFFFEE2E2), // red-100
            contentColor = Color(0xFFB91C1C), // red-700
        )
        "cancelled", "cancelada" -> StatusBadgeStyle(
            label = "Cancelada",
            containerColor = Color(0xFFFEE2E2),
            contentColor = Color(0xFFB91C1C),
        )
        "draft" -> StatusBadgeStyle(
            label = "Borrador",
            containerColor = Color(0xFFF1F5F9),
            contentColor = Color(0xFF64748B),
        )
        "pausada" -> StatusBadgeStyle(
            label = "Pausada",
            containerColor = Color(0xFFFEF3C7),
            contentColor = Color(0xFFB45309),
        )
        else -> StatusBadgeStyle(
            label = status.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() },
            containerColor = Color(0xFFF1F5F9),
            contentColor = Color(0xFF64748B),
        )
    }
}

private fun formatMedicationName(raw: String?): String {
    if (raw.isNullOrBlank()) return "Prescripción médica"
    val words = raw.trim().split(Regex("\\s+"))
    return words.joinToString(" ") { word ->
        val lower = word.lowercase()
        when {
            lower in listOf("mg", "ml", "g", "mcg", "ui", "comprimidos", "capsulas", "gotas") -> lower
            word.all { it.isDigit() } -> word
            else -> lower.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }
        }
    }
}

private fun formatPosologySummary(dosage: String?, frequency: String?, duration: String?): String {
    val parts = mutableListOf<String>()
    val cleanDosage = dosage?.trim().orEmpty()
    if (cleanDosage.isNotBlank()) {
        val formattedDosage = if (cleanDosage.all { it.isDigit() }) "$cleanDosage mg" else cleanDosage
        parts.add(formattedDosage)
    }
    val cleanFreq = frequency?.trim().orEmpty()
    if (cleanFreq.isNotBlank()) {
        val formattedFreq = when {
            cleanFreq.all { it.isDigit() } -> "Cada $cleanFreq hs"
            cleanFreq.startsWith("cada", ignoreCase = true) -> cleanFreq
            else -> cleanFreq
        }
        parts.add(formattedFreq)
    }
    val cleanDuration = duration?.trim().orEmpty()
    if (cleanDuration.isNotBlank()) {
        val formattedDur = if (cleanDuration.all { it.isDigit() }) "$cleanDuration días" else cleanDuration
        parts.add(formattedDur)
    }
    return parts.joinToString(" · ")
}

private fun formatDoctorName(rawDoctor: String?): String {
    if (rawDoctor.isNullOrBlank()) return "Dr. Médico Tratante"
    val trimmed = rawDoctor.trim()
    return when {
        trimmed.startsWith("Dra.", ignoreCase = true) -> trimmed
        trimmed.startsWith("Dr.", ignoreCase = true) -> trimmed
        trimmed.startsWith("Doctora ", ignoreCase = true) -> "Dra. ${trimmed.substring(8).trim()}"
        trimmed.startsWith("Doctor ", ignoreCase = true) -> "Dr. ${trimmed.substring(7).trim()}"
        trimmed.startsWith("Dra ", ignoreCase = true) -> "Dra. ${trimmed.substring(4).trim()}"
        trimmed.startsWith("Dr ", ignoreCase = true) -> "Dr. ${trimmed.substring(3).trim()}"
        else -> "Dr. $trimmed"
    }
}

private fun formatPrescriptionDate(dateStr: String?): String {
    if (dateStr.isNullOrBlank()) return ""
    return runCatching {
        val parsedDate = try {
            OffsetDateTime.parse(dateStr).toLocalDate()
        } catch (_: Exception) {
            try {
                Instant.parse(dateStr).atZone(ZoneId.systemDefault()).toLocalDate()
            } catch (_: Exception) {
                LocalDate.parse(dateStr.take(10))
            }
        }
        val spanishLocale = Locale("es", "AR")
        parsedDate.format(DateTimeFormatter.ofPattern("d 'de' MMMM 'de' yyyy", spanishLocale))
    }.getOrElse {
        dateStr
    }
}

private fun getDownloadablePdfUrl(signedPdfUrl: String?, cuir: String?): String? {
    if (!signedPdfUrl.isNullOrBlank()) {
        // Exclude verification page URLs that are not direct PDFs
        if (signedPdfUrl.contains("/verify/") && !signedPdfUrl.contains("/storage/")) return null
        return signedPdfUrl
    }
    // Fallback: if CUIR exists, provide online verification and PDF portal
    if (!cuir.isNullOrBlank()) {
        return "https://autamedica.com/verify/$cuir"
    }
    return null
}
