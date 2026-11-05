package com.autamedica.android.presentation.doctors.prescriptions

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.QrCode
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.model.PrescriptionItem
import com.autamedica.android.presentation.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorPrescriptionsScreen(
    onBack: () -> Unit,
    onNavigateToCreatePrescription: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DoctorPrescriptionsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }

    val onOpenPdf: (String) -> Unit = { pdfUrl ->
        runCatching {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(pdfUrl)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }.onFailure {
            Toast.makeText(context, context.getString(R.string.doctor_rx_pdf_error_toast), Toast.LENGTH_SHORT).show()
        }
    }

    var cancellationReasonText by remember { mutableStateOf("") }

    val resolvedUserMessage = when {
        uiState.userMessageResId != null -> stringResource(uiState.userMessageResId!!, *uiState.userMessageArgs.toTypedArray())
        uiState.userMessage != null -> uiState.userMessage
        else -> null
    }

    LaunchedEffect(resolvedUserMessage) {
        resolvedUserMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            viewModel.clearUserMessage()
        }
    }

    Scaffold(
        modifier = modifier,
        containerColor = AuBackground,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = stringResource(R.string.doctor_rx_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = stringResource(R.string.doctor_rx_subtitle),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.doctor_rx_action_back),
                            tint = AuTextPrimary,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.loadPrescriptions() }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(R.string.doctor_rx_action_refresh),
                            tint = PortalDoctors,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AuBackground),
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onNavigateToCreatePrescription,
                containerColor = PortalDoctorsAction,
                contentColor = Color.White,
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text(stringResource(R.string.doctor_rx_action_new), fontWeight = FontWeight.SemiBold) },
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
        ) {
            // 1. Stats Counter Header
            MetricsHeader(
                total = uiState.totalCount,
                active = uiState.activeCount,
                dispensed = uiState.dispensedCount,
                cancelled = uiState.cancelledCount,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
            )

            // 2. Search Box
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = viewModel::onSearchQueryChanged,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                placeholder = { Text(stringResource(R.string.doctor_rx_search_placeholder), color = AuTextTertiary) },
                leadingIcon = {
                    Icon(Icons.Default.Search, contentDescription = stringResource(R.string.doctor_rx_search_desc), tint = AuTextTertiary)
                },
                trailingIcon = {
                    if (uiState.searchQuery.isNotBlank()) {
                        IconButton(onClick = { viewModel.onSearchQueryChanged("") }) {
                            Icon(Icons.Default.Close, contentDescription = stringResource(R.string.doctor_rx_clear_search_desc), tint = AuTextTertiary)
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = AuSurface,
                    unfocusedContainerColor = AuSurface,
                    focusedBorderColor = PortalDoctors,
                    unfocusedBorderColor = AuBorder,
                ),
            )

            // 3. Status Filter Chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChipItem(
                    label = stringResource(R.string.doctor_rx_filter_all, uiState.totalCount),
                    selected = uiState.selectedStatusFilter == "todas",
                    onClick = { viewModel.onStatusFilterChanged("todas") },
                )
                FilterChipItem(
                    label = stringResource(R.string.doctor_rx_filter_active, uiState.activeCount),
                    selected = uiState.selectedStatusFilter == "activa",
                    onClick = { viewModel.onStatusFilterChanged("activa") },
                    accentColor = AuSuccess,
                )
                FilterChipItem(
                    label = stringResource(R.string.doctor_rx_filter_dispensed, uiState.dispensedCount),
                    selected = uiState.selectedStatusFilter == "dispensada",
                    onClick = { viewModel.onStatusFilterChanged("dispensada") },
                    accentColor = Color(0xFF0284C7),
                )
                FilterChipItem(
                    label = stringResource(R.string.doctor_rx_filter_cancelled, uiState.cancelledCount),
                    selected = uiState.selectedStatusFilter == "cancelada",
                    onClick = { viewModel.onStatusFilterChanged("cancelada") },
                    accentColor = AuDanger,
                )
            }

            // 4. Prescriptions List / Loading / Empty State
            if (uiState.isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = PortalDoctors)
                }
            } else if (uiState.filteredPrescriptions.isEmpty()) {
                EmptyPrescriptionsState(
                    hasFilter = uiState.searchQuery.isNotBlank() || uiState.selectedStatusFilter != "todas",
                    onClearFilters = {
                        viewModel.onSearchQueryChanged("")
                        viewModel.onStatusFilterChanged("todas")
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 88.dp, top = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(uiState.filteredPrescriptions, key = { it.id }) { rx ->
                        DoctorPrescriptionCard(
                            prescription = rx,
                            onOpenPdf = onOpenPdf,
                            onCopyCuir = { cuir ->
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("CUIR", cuir))
                                Toast.makeText(context, context.getString(R.string.doctor_rx_card_cuir_copied_toast, cuir), Toast.LENGTH_SHORT).show()
                            },
                            onRequestCancel = { viewModel.onRequestCancelPrescription(rx) },
                        )
                    }
                }
            }
        }
    }

    // Cancellation Dialog
    uiState.prescriptionToCancel?.let { target ->
        AlertDialog(
            onDismissRequest = {
                if (!uiState.isCancelling) viewModel.onDismissCancelDialog()
            },
            title = {
                Text(
                    text = stringResource(R.string.doctor_rx_cancel_dialog_title),
                    fontWeight = FontWeight.Bold,
                    color = AuDanger,
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val defaultPatient = stringResource(R.string.doctor_rx_card_default_patient)
                    Text(
                        text = stringResource(
                            R.string.doctor_rx_cancel_dialog_body,
                            target.cuir ?: target.id.take(8),
                            target.patientName ?: defaultPatient
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        color = AuTextSecondary,
                    )
                    Text(
                        text = stringResource(R.string.doctor_rx_cancel_dialog_legal),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    OutlinedTextField(
                        value = cancellationReasonText,
                        onValueChange = { cancellationReasonText = it },
                        label = { Text(stringResource(R.string.doctor_rx_cancel_dialog_reason_label)) },
                        placeholder = { Text(stringResource(R.string.doctor_rx_cancel_dialog_reason_placeholder)) },
                        modifier = Modifier.fillMaxWidth(),
                        isError = uiState.cancellationError != null || uiState.cancellationErrorResId != null,
                        supportingText = {
                            val errText = when {
                                uiState.cancellationErrorResId != null -> stringResource(uiState.cancellationErrorResId!!)
                                uiState.cancellationError != null -> uiState.cancellationError
                                else -> null
                            }
                            if (errText != null) {
                                Text(errText, color = AuDanger)
                            }
                        },
                        enabled = !uiState.isCancelling,
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.onConfirmCancelPrescription(cancellationReasonText)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = AuDanger),
                    enabled = !uiState.isCancelling && cancellationReasonText.isNotBlank(),
                ) {
                    if (uiState.isCancelling) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = Color.White,
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Text(stringResource(R.string.doctor_rx_cancel_dialog_confirm))
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = { viewModel.onDismissCancelDialog() },
                    enabled = !uiState.isCancelling,
                ) {
                    Text(stringResource(R.string.doctor_rx_cancel_dialog_dismiss))
                }
            }
        )
    }
}

@Composable
private fun MetricsHeader(
    total: Int,
    active: Int,
    dispensed: Int,
    cancelled: Int,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp, horizontal = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MetricPill(count = total, label = stringResource(R.string.doctor_rx_metric_total), color = AuTextPrimary)
            Box(modifier = Modifier.width(1.dp).height(28.dp).background(AuBorder))
            MetricPill(count = active, label = stringResource(R.string.doctor_rx_metric_active), color = AuSuccess)
            Box(modifier = Modifier.width(1.dp).height(28.dp).background(AuBorder))
            MetricPill(count = dispensed, label = stringResource(R.string.doctor_rx_metric_dispensed), color = Color(0xFF0284C7))
            Box(modifier = Modifier.width(1.dp).height(28.dp).background(AuBorder))
            MetricPill(count = cancelled, label = stringResource(R.string.doctor_rx_metric_cancelled), color = AuDanger)
        }
    }
}

@Composable
private fun MetricPill(count: Int, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "$count",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = color,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = AuTextTertiary,
        )
    }
}

@Composable
private fun FilterChipItem(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    accentColor: Color = PortalDoctors,
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(999.dp),
        color = if (selected) accentColor.copy(alpha = 0.15f) else AuSurface,
        border = BorderStroke(1.dp, if (selected) accentColor else AuBorder),
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            color = if (selected) accentColor else AuTextSecondary,
        )
    }
}

@Composable
private fun DoctorPrescriptionCard(
    prescription: Prescription,
    onOpenPdf: (String) -> Unit,
    onCopyCuir: (String) -> Unit,
    onRequestCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isCancelled = prescription.isCancelled
    val isDispensed = prescription.isDispensed || prescription.isCompleted

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(
            1.dp,
            when {
                prescription.isActive -> AuSuccess.copy(alpha = 0.4f)
                isDispensed -> Color(0xFF0284C7).copy(alpha = 0.3f)
                else -> AuBorder
            }
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Card Header: CUIR + Status Pill
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        imageVector = Icons.Outlined.QrCode,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = PortalDoctors
                    )
                    Text(
                        text = prescription.cuir ?: "ID: ${prescription.id.take(8)}",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    prescription.cuir?.let { cuir ->
                        IconButton(
                            onClick = { onCopyCuir(cuir) },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.ContentCopy,
                                contentDescription = stringResource(R.string.doctor_rx_card_copy_cuir),
                                modifier = Modifier.size(14.dp),
                                tint = AuTextTertiary
                            )
                        }
                    }
                }

                StatusBadge(prescription)
            }

            HorizontalDivider(color = AuBorder.copy(alpha = 0.6f))

            // Patient details row
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Surface(
                    shape = CircleShape,
                    color = PortalPatients.copy(alpha = 0.15f),
                    modifier = Modifier.size(28.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Outlined.Person,
                            contentDescription = null,
                            tint = PortalPatients,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = prescription.patientName ?: stringResource(R.string.doctor_rx_card_default_patient),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = AuTextPrimary
                    )
                    prescription.patientDni?.takeIf { it.isNotBlank() }?.let { dni ->
                        Text(
                            text = stringResource(R.string.doctor_rx_card_dni_prefix, dni),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary
                        )
                    }
                }
            }

            // Diagnosis
            prescription.diagnosis?.takeIf { it.isNotBlank() }?.let { diag ->
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = AuSurfaceHover,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.doctor_rx_card_diagnosis_label),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = AuTextSecondary
                        )
                        Text(
                            text = diag,
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }

            // Medications Multi-Item List
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = stringResource(R.string.doctor_rx_card_medications_title, prescription.displayItems.size),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = AuTextSecondary
                )

                prescription.displayItems.forEachIndexed { idx, item ->
                    MedicationItemRow(item = item, index = idx + 1)
                }
            }

            // Notes if any
            prescription.notes?.takeIf { it.isNotBlank() }?.let { notes ->
                Text(
                    text = stringResource(R.string.doctor_rx_card_notes_prefix, notes),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // Footer: Date + Action Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = prescription.createdAt.take(10),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val pdfUrl = prescription.signedPdfUrl?.takeIf { it.isNotBlank() }
                        ?: prescription.cuir?.takeIf { it.isNotBlank() }?.let { "https://autamedica.com/verify/$it" }

                    if (pdfUrl != null) {
                        Button(
                            onClick = { onOpenPdf(pdfUrl) },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFFDC2626),
                                contentColor = Color.White
                            ),
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                            modifier = Modifier.height(34.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.PictureAsPdf,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = stringResource(R.string.doctor_rx_card_download_pdf),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    if (prescription.isActive) {
                        TextButton(
                            onClick = onRequestCancel,
                            colors = ButtonDefaults.textButtonColors(contentColor = AuDanger),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.doctor_rx_card_cancel_action),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MedicationItemRow(item: PrescriptionItem, index: Int) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = AuSurfaceHover.copy(alpha = 0.5f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    imageVector = Icons.Outlined.Medication,
                    contentDescription = null,
                    tint = PortalDoctors,
                    modifier = Modifier.size(14.dp)
                )
                Text(
                    text = "$index. ${item.medicationName}",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            val durationFormatted = item.duration.takeIf { it.isNotBlank() }?.let {
                stringResource(R.string.doctor_rx_card_duration_format, it)
            }
            Text(
                text = listOfNotNull(
                    item.dosage.takeIf { it.isNotBlank() },
                    item.frequency.takeIf { it.isNotBlank() },
                    durationFormatted
                ).joinToString(" · "),
                style = MaterialTheme.typography.labelSmall,
                color = AuTextSecondary
            )
            if (item.instructions.isNotBlank()) {
                Text(
                    text = stringResource(R.string.doctor_rx_card_instruction_prefix, item.instructions),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun StatusBadge(prescription: Prescription) {
    val (label, bg, fg) = when {
        prescription.isCancelled -> Triple(stringResource(R.string.doctor_rx_badge_cancelled), AuDanger.copy(alpha = 0.12f), AuDanger)
        prescription.isDispensed -> Triple(stringResource(R.string.doctor_rx_badge_dispensed), Color(0xFF0284C7).copy(alpha = 0.12f), Color(0xFF0284C7))
        prescription.isActive -> Triple(stringResource(R.string.doctor_rx_badge_active), AuSuccess.copy(alpha = 0.12f), AuSuccess)
        prescription.isExpired -> Triple(stringResource(R.string.doctor_rx_badge_expired), Color(0xFF64748B).copy(alpha = 0.12f), Color(0xFF475569))
        else -> Triple(prescription.status.uppercase(), AuSurfaceHover, AuTextSecondary)
    }

    Surface(
        shape = RoundedCornerShape(999.dp),
        color = bg,
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = fg,
            letterSpacing = 0.5.sp
        )
    }
}

@Composable
private fun EmptyPrescriptionsState(
    hasFilter: Boolean,
    onClearFilters: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Outlined.Medication,
            contentDescription = null,
            tint = AuTextTertiary,
            modifier = Modifier.size(56.dp)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = if (hasFilter) stringResource(R.string.doctor_rx_empty_filtered_title) else stringResource(R.string.doctor_rx_empty_title),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = AuTextPrimary,
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = if (hasFilter) stringResource(R.string.doctor_rx_empty_filtered_desc) else stringResource(R.string.doctor_rx_empty_desc),
            style = MaterialTheme.typography.bodySmall,
            color = AuTextTertiary,
        )
        if (hasFilter) {
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedButton(onClick = onClearFilters) {
                Text(stringResource(R.string.doctor_rx_empty_clear_filters))
            }
        }
    }
}
