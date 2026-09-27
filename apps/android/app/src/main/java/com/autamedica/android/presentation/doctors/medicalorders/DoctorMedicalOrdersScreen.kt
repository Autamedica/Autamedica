package com.autamedica.android.presentation.doctors.medicalorders

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
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.MedicalServices
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
import com.autamedica.android.domain.model.MedicalOrder
import com.autamedica.android.domain.model.StudyType
import com.autamedica.android.presentation.prescriptions.components.QrCodeView
import com.autamedica.android.presentation.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorMedicalOrdersScreen(
    onBack: () -> Unit,
    onNavigateToCreateOrder: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DoctorMedicalOrdersViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }

    var selectedOrderForQr by remember { mutableStateOf<MedicalOrder?>(null) }

    LaunchedEffect(uiState.userMessage, uiState.userMessageResId) {
        val msg = when {
            uiState.userMessageResId != null -> context.getString(uiState.userMessageResId!!, *uiState.userMessageArgs.toTypedArray())
            uiState.userMessage != null -> uiState.userMessage
            else -> null
        }
        msg?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearMessages()
        }
    }

    LaunchedEffect(uiState.errorMessage, uiState.errorMessageResId) {
        val err = when {
            uiState.errorMessageResId != null -> context.getString(uiState.errorMessageResId!!)
            uiState.errorMessage != null -> uiState.errorMessage
            else -> null
        }
        err?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearMessages()
        }
    }

    val onOpenPdf: (String) -> Unit = { pdfUrl ->
        runCatching {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(pdfUrl)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }.onFailure {
            Toast.makeText(context, context.getString(R.string.doctor_orders_pdf_error_toast), Toast.LENGTH_SHORT).show()
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
                            text = stringResource(R.string.doctor_orders_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = stringResource(R.string.doctor_orders_subtitle, uiState.orders.size),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.doctor_orders_action_back),
                            tint = AuTextPrimary,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.loadOrders() }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(R.string.doctor_orders_action_refresh),
                            tint = AuTextSecondary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AuSurface),
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onNavigateToCreateOrder,
                containerColor = PortalDoctors,
                contentColor = Color.White,
                shape = RoundedCornerShape(16.dp),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.doctor_orders_action_new))
                    Text(stringResource(R.string.doctor_orders_action_new), fontWeight = FontWeight.Bold)
                }
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
        ) {
            // Search Input
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = { viewModel.onSearchQueryChange(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = { Text(stringResource(R.string.doctor_orders_search_placeholder)) },
                leadingIcon = {
                    Icon(Icons.Default.Search, contentDescription = null, tint = AuTextTertiary)
                },
                trailingIcon = {
                    if (uiState.searchQuery.isNotEmpty()) {
                        IconButton(onClick = { viewModel.onSearchQueryChange("") }) {
                            Icon(
                                Icons.Default.Clear,
                                contentDescription = stringResource(R.string.doctor_orders_clear_search_desc),
                                tint = AuTextTertiary
                            )
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
                )
            )

            // Filter Chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OrderFilter.entries.forEach { filter ->
                    val isSelected = uiState.selectedFilter == filter
                    val count = when (filter) {
                        OrderFilter.ALL -> uiState.totalCount
                        OrderFilter.LABORATORY -> uiState.labCount
                        OrderFilter.IMAGING -> uiState.imagingCount
                        OrderFilter.CARDIOLOGY -> uiState.cardioCount
                        OrderFilter.OTHER -> uiState.otherCount
                    }
                    val filterLabel = when (filter) {
                        OrderFilter.ALL -> stringResource(R.string.doctor_orders_filter_all)
                        OrderFilter.LABORATORY -> stringResource(R.string.doctor_orders_filter_lab)
                        OrderFilter.IMAGING -> stringResource(R.string.doctor_orders_filter_imaging)
                        OrderFilter.CARDIOLOGY -> stringResource(R.string.doctor_orders_filter_cardiology)
                        OrderFilter.OTHER -> stringResource(R.string.doctor_orders_filter_other)
                    }

                    FilterChip(
                        selected = isSelected,
                        onClick = { viewModel.setFilter(filter) },
                        label = {
                            Text(
                                text = "$filterLabel ($count)",
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PortalDoctorsSoft,
                            selectedLabelColor = PortalDoctors,
                            containerColor = AuSurface,
                            labelColor = AuTextSecondary,
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = isSelected,
                            borderColor = if (isSelected) PortalDoctors else AuBorder,
                        ),
                    )
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Order List Content
            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = PortalDoctors)
                    }
                }
                uiState.filteredOrders.isEmpty() -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Description,
                                contentDescription = null,
                                modifier = Modifier.size(56.dp),
                                tint = AuTextTertiary,
                            )
                            Text(
                                text = if (uiState.searchQuery.isNotEmpty()) {
                                    stringResource(R.string.doctor_orders_empty_filtered)
                                } else {
                                    stringResource(R.string.doctor_orders_empty_category)
                                },
                                style = MaterialTheme.typography.bodyMedium,
                                color = AuTextTertiary,
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
                        items(uiState.filteredOrders, key = { it.id }) { order ->
                            MedicalOrderCard(
                                order = order,
                                onOpenPdf = onOpenPdf,
                                onShowQr = { selectedOrderForQr = order },
                            )
                        }
                        item {
                            Spacer(modifier = Modifier.height(72.dp))
                        }
                    }
                }
            }
        }
    }

    // QR & Verification Dialog
    selectedOrderForQr?.let { order ->
        AlertDialog(
            onDismissRequest = { selectedOrderForQr = null },
            confirmButton = {
                TextButton(onClick = { selectedOrderForQr = null }) {
                    Text(stringResource(R.string.doctor_orders_qr_dialog_close), color = PortalDoctors)
                }
            },
            title = {
                Text(
                    text = stringResource(R.string.doctor_orders_qr_dialog_title),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    val qrContent = order.qrCodeContent ?: order.cuir?.let { "https://autamedica.com/verify/$it" } ?: ""
                    if (qrContent.isNotEmpty()) {
                        QrCodeView(
                            content = qrContent,
                            modifier = Modifier.size(180.dp),
                        )
                    }

                    order.cuir?.let { cuir ->
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = AuSurfaceHover,
                            border = BorderStroke(1.dp, AuBorder),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = stringResource(R.string.doctor_orders_qr_dialog_cuir_label),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = AuTextTertiary,
                                    )
                                    Text(
                                        text = cuir,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = AuTextPrimary,
                                    )
                                }
                                IconButton(
                                    onClick = {
                                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                        clipboard.setPrimaryClip(ClipData.newPlainText("CUIR", cuir))
                                        Toast.makeText(context, context.getString(R.string.doctor_orders_qr_dialog_copied_toast), Toast.LENGTH_SHORT).show()
                                    }
                                ) {
                                    Icon(
                                        Icons.Default.ContentCopy,
                                        contentDescription = stringResource(R.string.doctor_orders_qr_dialog_copy_desc),
                                        tint = PortalDoctors,
                                    )
                                }
                            }
                        }
                    }

                    Text(
                        text = stringResource(R.string.doctor_orders_qr_dialog_legal),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }
            }
        )
    }
}

@Composable
fun MedicalOrderCard(
    order: MedicalOrder,
    onOpenPdf: (String) -> Unit,
    onShowQr: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current

    val (badgeBg, badgeColor, badgeText) = when (order.status.lowercase()) {
        "signed", "sent" -> Triple(AuSuccess.copy(alpha = 0.12f), AuSuccess, stringResource(R.string.doctor_orders_badge_signed))
        "draft" -> Triple(AuWarning.copy(alpha = 0.12f), AuWarning, stringResource(R.string.doctor_orders_badge_draft))
        "cancelled" -> Triple(AuDanger.copy(alpha = 0.12f), AuDanger, stringResource(R.string.doctor_orders_badge_cancelled))
        else -> Triple(PortalDoctorsSoft, PortalDoctors, order.status.replaceFirstChar { it.uppercase() })
    }

    val (studyBg, studyColor, studyLabel) = when (order.studyType) {
        StudyType.LABORATORY -> Triple(PortalPatientsSoft, PortalPatients, stringResource(R.string.doctor_orders_filter_lab))
        StudyType.IMAGING -> Triple(Color(0x1F8B5CF6), Color(0xFF8B5CF6), stringResource(R.string.doctor_orders_filter_imaging))
        StudyType.CARDIOLOGY -> Triple(Color(0x1FE11D48), Color(0xFFE11D48), stringResource(R.string.doctor_orders_filter_cardiology))
        StudyType.OTHER -> Triple(PortalDoctorsSoft, PortalDoctors, stringResource(R.string.doctor_orders_filter_other))
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = AuSurface),
        border = BorderStroke(1.dp, AuBorder),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // Header Row: Study Type Chip and Status Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = studyBg,
                    border = BorderStroke(1.dp, studyColor.copy(alpha = 0.3f)),
                ) {
                    Text(
                        text = studyLabel,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = studyColor,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }

                Surface(
                    shape = CircleShape,
                    color = badgeBg,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(badgeColor)
                        )
                        Text(
                            text = badgeText,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = badgeColor,
                        )
                    }
                }
            }

            // Patient Info
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(PortalDoctorsSoft),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Person,
                        contentDescription = null,
                        tint = PortalDoctors,
                        modifier = Modifier.size(20.dp),
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = order.patientName ?: stringResource(R.string.doctor_orders_card_patient_default),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = buildString {
                            order.patientDni?.let { append("${stringResource(R.string.doctor_create_order_patient_dni_short, it)} · ") }
                            append(order.createdAt.take(10))
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }
            }

            HorizontalDivider(color = AuBorder)

            // Practices List
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = stringResource(R.string.doctor_orders_practices_header),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                    fontWeight = FontWeight.SemiBold,
                )
                order.practices.forEach { practice ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(5.dp)
                                .clip(CircleShape)
                                .background(studyColor)
                        )
                        Text(
                            text = practice.name,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            color = AuTextPrimary,
                        )
                    }
                }
            }

            // Diagnosis
            if (!order.diagnosis.isNullOrBlank()) {
                Text(
                    text = stringResource(R.string.doctor_orders_dx_prefix, order.diagnosis),
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                    fontWeight = FontWeight.Medium,
                )
            }

            // Notes / Preparation Instructions
            if (!order.notes.isNullOrBlank()) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = AuSurfaceHover,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = stringResource(R.string.doctor_orders_notes_prefix, order.notes),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                        modifier = Modifier.padding(8.dp),
                    )
                }
            }

            // CUIR Banner and Actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (!order.cuir.isNullOrBlank()) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.doctor_orders_cuir_prefix, order.cuir),
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            color = PortalDoctors,
                        )
                        IconButton(
                            onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("CUIR", order.cuir))
                                Toast.makeText(context, context.getString(R.string.doctor_orders_cuir_copied_toast), Toast.LENGTH_SHORT).show()
                            },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                Icons.Default.ContentCopy,
                                contentDescription = stringResource(R.string.doctor_orders_copy_cuir_desc),
                                tint = AuTextTertiary,
                                modifier = Modifier.size(14.dp),
                            )
                        }
                    }
                } else {
                    Spacer(modifier = Modifier.width(1.dp))
                }

                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    // QR button
                    IconButton(
                        onClick = onShowQr,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            Icons.Outlined.QrCode,
                            contentDescription = stringResource(R.string.doctor_orders_view_qr_desc),
                            tint = PortalDoctors,
                            modifier = Modifier.size(20.dp),
                        )
                    }

                    // PDF button
                    if (!order.signedPdfUrl.isNullOrBlank()) {
                        IconButton(
                            onClick = { onOpenPdf(order.signedPdfUrl) },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                Icons.Outlined.PictureAsPdf,
                                contentDescription = stringResource(R.string.doctor_orders_view_pdf_desc),
                                tint = AuDanger,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}
