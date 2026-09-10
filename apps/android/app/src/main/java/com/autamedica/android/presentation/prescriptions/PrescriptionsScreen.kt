package com.autamedica.android.presentation.prescriptions

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
                    Text(
                        text = "Mis Recetas",
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
                // Header: Título, Subtítulo y Badge Contador
                PrescriptionsHeader(activeCount = uiState.activeCount)

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
                            verticalArrangement = Arrangement.spacedBy(14.dp),
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
private fun PrescriptionsHeader(
    activeCount: Int,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        // Badge contador de recetas activas
        Surface(
            shape = CircleShape,
            color = Color(0xFF171717), // dark neutral
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.Medication,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = "$activeCount ${if (activeCount == 1) "receta activa" else "recetas activas"}",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        Text(
            text = "Mis Recetas",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = AuTextPrimary,
        )

        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = "Prescripciones registradas y recetas electrónicas",
            style = MaterialTheme.typography.bodyMedium,
            color = AuTextSecondary,
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
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        PrescriptionFilter.entries.forEach { filter ->
            val isSelected = selectedFilter == filter
            Surface(
                onClick = { onSelectFilter(filter) },
                shape = CircleShape,
                color = if (isSelected) Color(0xFF171717) else Color(0xFFF8FAFC),
                border = if (isSelected) null else BorderStroke(1.dp, Color(0xFFE2E8F0)),
            ) {
                Text(
                    text = filter.label,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (isSelected) Color.White else Color(0xFF475569),
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
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

    Surface(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE5E5E5)), // neutral-200
        shadowElevation = 0.5.dp,
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            // Header: Título del medicamento y Badge de estado
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = prescription.medicationName.ifBlank { "Prescripción médica" },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF171717),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "$doctorText · $dateStr",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF737373), // neutral-500
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                Spacer(modifier = Modifier.width(8.dp))

                PrescriptionStatusBadge(status = prescription.status)
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Posología destacada: Dosis, Frecuencia y Duración
            if (prescription.dosage.isNotBlank()) {
                Text(
                    text = prescription.dosage,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFF404040), // neutral-700
                )
                Spacer(modifier = Modifier.height(2.dp))
            }

            val freqAndDuration = listOf(prescription.frequency, prescription.duration)
                .filter { it.isNotBlank() }
                .joinToString(" · ")
            if (freqAndDuration.isNotBlank()) {
                Text(
                    text = freqAndDuration,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF737373), // neutral-500
                )
                Spacer(modifier = Modifier.height(14.dp))
            } else if (prescription.dosage.isNotBlank()) {
                Spacer(modifier = Modifier.height(14.dp))
            }

            // Caja de código CUIR institucional monoespaciado con acción de copiar
            prescription.cuir?.takeIf { it.isNotBlank() }?.let { cuir ->
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFF9FAFB), // neutral-50
                    border = BorderStroke(1.dp, Color(0xFFF3F4F6)), // neutral-100
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 14.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f, fill = false),
                        ) {
                            Text(
                                text = "CUIR: ",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFF525252),
                                fontWeight = FontWeight.Normal,
                            )
                            Text(
                                text = cuir,
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Medium,
                                color = Color(0xFF171717),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        IconButton(
                            onClick = { onCopyCuir(cuir) },
                            modifier = Modifier.size(32.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.ContentCopy,
                                contentDescription = "Copiar CUIR",
                                tint = Color(0xFF737373),
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(14.dp))
            }

            // Acciones: PDF y Ver detalle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (downloadablePdfUrl != null) {
                    OutlinedButton(
                        onClick = { onOpenPdf(downloadablePdfUrl) },
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp),
                        shape = CircleShape,
                        border = BorderStroke(1.dp, Color(0xFFE5E5E5)),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = Color(0xFF404040),
                        ),
                        contentPadding = PaddingValues(horizontal = 12.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.OpenInNew,
                            contentDescription = null,
                            modifier = Modifier.size(15.dp),
                            tint = Color(0xFF404040),
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "PDF",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF404040),
                        )
                    }
                }

                Button(
                    onClick = onClick,
                    modifier = Modifier
                        .weight(1f)
                        .height(44.dp),
                    shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF171717), // neutral-900
                        contentColor = Color.White,
                    ),
                    contentPadding = PaddingValues(horizontal = 12.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Description,
                        contentDescription = null,
                        modifier = Modifier.size(15.dp),
                        tint = Color.White,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Ver detalle",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Medium,
                        color = Color.White,
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

            // Header: Icon + Title + Close Button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0x26F97316), // rgba(249, 115, 22, 0.15)
                        modifier = Modifier.size(40.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Outlined.Medication,
                                contentDescription = null,
                                tint = Color(0xFFEA580C),
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                    Column {
                        Text(
                            text = "Receta médica",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = "Prescripción #${prescription.id.take(8)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )
                    }
                }

                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Outlined.Close,
                        contentDescription = "Cerrar",
                        tint = AuTextTertiary,
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Doctor & Date badges
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Person,
                        contentDescription = null,
                        tint = AuTextTertiary,
                        modifier = Modifier.size(15.dp),
                    )
                    Text(
                        text = doctorText,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CalendarMonth,
                        contentDescription = null,
                        tint = AuTextTertiary,
                        modifier = Modifier.size(15.dp),
                    )
                    Text(
                        text = dateStr,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // ALTA PRIORIDAD: Información Clínica / Medicación Activa
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "MEDICACIÓN ACTIVA",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF0284C7), // sky-600
                    letterSpacing = 1.sp,
                )

                Spacer(modifier = Modifier.height(8.dp))

                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFECFDF5), // emerald-50
                                modifier = Modifier.size(40.dp),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = Icons.Outlined.Medication,
                                        contentDescription = null,
                                        tint = Color(0xFF059669), // emerald-600
                                        modifier = Modifier.size(20.dp),
                                    )
                                }
                            }
                            Column {
                                Text(
                                    text = prescription.medicationName.ifBlank { "Prescripción médica" },
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = AuTextPrimary,
                                )
                                if (prescription.dosage.isNotBlank()) {
                                    Text(
                                        text = prescription.dosage,
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.Medium,
                                        color = AuTextSecondary,
                                    )
                                }
                            }
                        }

                        if (prescription.frequency.isNotBlank() || prescription.duration.isNotBlank()) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFFF8FAFC),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    if (prescription.frequency.isNotBlank()) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            Icon(
                                                imageVector = Icons.Outlined.Schedule,
                                                contentDescription = null,
                                                tint = Color(0xFF94A3B8),
                                                modifier = Modifier.size(16.dp),
                                            )
                                            Text(
                                                text = prescription.frequency,
                                                style = MaterialTheme.typography.bodySmall,
                                                fontWeight = FontWeight.Medium,
                                                color = Color(0xFF334155),
                                            )
                                        }
                                    }
                                    if (prescription.duration.isNotBlank()) {
                                        Text(
                                            text = "Por: ${prescription.duration}",
                                            style = MaterialTheme.typography.bodySmall,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color(0xFF334155),
                                        )
                                    }
                                }
                            }
                        }

                        if (prescription.instructions.isNotBlank()) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFFF0F9FF), // sky-50
                                border = BorderStroke(1.dp, Color(0xFFE0F2FE)), // sky-100
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(
                                        text = "INDICACIÓN MÉDICA",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF0369A1), // sky-700
                                        fontSize = 10.sp,
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = prescription.instructions,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Medium,
                                        color = Color(0xFF0C4A6E), // sky-900
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Diagnóstico si está presente
            prescription.diagnosis?.takeIf { it.isNotBlank() }?.let { diag ->
                Spacer(modifier = Modifier.height(16.dp))
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = "DIAGNÓSTICO",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF64748B),
                            fontSize = 10.sp,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = diag,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            color = AuTextPrimary,
                        )
                    }
                }
            }

            // Indicaciones generales / Notas si están presentes
            prescription.notes?.takeIf { it.isNotBlank() }?.let { notes ->
                Spacer(modifier = Modifier.height(16.dp))
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = "INDICACIONES GENERALES",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF64748B),
                            fontSize = 10.sp,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = notes,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            color = AuTextPrimary,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))
            HorizontalDivider(color = AuBorder, thickness = 0.5.dp)
            Spacer(modifier = Modifier.height(16.dp))

            // SEGUIMIENTO / DISPENSA EN FARMACIA
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "PRESENTACIÓN EN FARMACIA",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF64748B),
                        letterSpacing = 1.sp,
                    )
                    PrescriptionStatusBadge(status = prescription.status)
                }

                Spacer(modifier = Modifier.height(12.dp))

                // QR Code Container
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color.White,
                    border = BorderStroke(1.5.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(16.dp),
                    ) {
                        QrCodeView(
                            content = prescription.effectiveQrContent,
                            size = 200.dp,
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
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp),
                )
            }

            // CUIR Card con botón de copiar
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

            // Médico tratante y matrícula profesional
            Spacer(modifier = Modifier.height(16.dp))
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color.White,
                modifier = Modifier.fillMaxWidth(),
                border = BorderStroke(0.5.dp, Color(0xFFE2E8F0)),
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CheckCircle,
                        contentDescription = null,
                        tint = AuSuccess,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = doctorText,
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

            // PDF Button para descarga oficial
            prescription.signedPdfUrl?.takeIf { it.isNotBlank() }?.let { pdfUrl ->
                Spacer(modifier = Modifier.height(20.dp))
                Button(
                    onClick = { onOpenPdf(pdfUrl) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF171717),
                        contentColor = Color.White,
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
        "activa", "active", "sent" -> StatusBadgeStyle(
            label = "Activa",
            containerColor = Color(0xFF171717), // Dark neutral
            contentColor = Color.White,
        )
        "signed", "firmada" -> StatusBadgeStyle(
            label = "Firmada",
            containerColor = Color(0xFF171717),
            contentColor = Color.White,
        )
        "dispensed", "dispensada", "dispensed_total" -> StatusBadgeStyle(
            label = "Dispensada",
            containerColor = Color(0xFF0EA5E9), // sky-500
            contentColor = Color.White,
        )
        "dispensed_partial" -> StatusBadgeStyle(
            label = "Parcial",
            containerColor = Color(0xFF525252), // neutral-600
            contentColor = Color.White,
        )
        "completed", "completada" -> StatusBadgeStyle(
            label = "Completada",
            containerColor = Color(0xFFA8A29E), // stone-400
            contentColor = Color.White,
        )
        "expired", "vencida" -> StatusBadgeStyle(
            label = "Vencida",
            containerColor = Color(0xFFE5E5E5), // neutral-200
            contentColor = Color(0xFF737373), // neutral-500
        )
        "cancelled", "cancelada" -> StatusBadgeStyle(
            label = "Cancelada",
            containerColor = Color(0xFFE5E5E5),
            contentColor = Color(0xFF737373),
        )
        "draft" -> StatusBadgeStyle(
            label = "Borrador",
            containerColor = Color(0xFFF5F5F5),
            contentColor = Color(0xFF737373),
        )
        "pausada" -> StatusBadgeStyle(
            label = "Pausada",
            containerColor = Color(0xFFE5E5E5),
            contentColor = Color(0xFF525252),
        )
        else -> StatusBadgeStyle(
            label = status.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() },
            containerColor = Color(0xFFF5F5F5),
            contentColor = Color(0xFF737373),
        )
    }
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
    if (signedPdfUrl.isNullOrBlank()) return null
    if (signedPdfUrl.contains("/verify/")) return null
    if (cuir != null && signedPdfUrl.contains(cuir)) return null
    return signedPdfUrl
}
