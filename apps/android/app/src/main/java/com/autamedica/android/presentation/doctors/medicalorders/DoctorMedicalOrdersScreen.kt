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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
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

    LaunchedEffect(uiState.userMessage) {
        uiState.userMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            viewModel.clearMessages()
        }
    }

    LaunchedEffect(uiState.errorMessage) {
        uiState.errorMessage?.let { err ->
            snackbarHostState.showSnackbar(err)
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
            Toast.makeText(context, "No se pudo abrir el documento PDF.", Toast.LENGTH_SHORT).show()
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
                            text = "Órdenes Médicas",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = "${uiState.orders.size} órdenes emitidas",
                            style = MaterialTheme.typography.labelSmall,
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
                    IconButton(onClick = { viewModel.loadOrders() }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Actualizar",
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
                    Icon(Icons.Filled.Add, contentDescription = "Nueva Orden")
                    Text("Nueva Orden", fontWeight = FontWeight.Bold)
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
                placeholder = { Text("Buscar por paciente, DNI, práctica o CUIR...") },
                leadingIcon = {
                    Icon(Icons.Default.Search, contentDescription = null, tint = AuTextTertiary)
                },
                trailingIcon = {
                    if (uiState.searchQuery.isNotEmpty()) {
                        IconButton(onClick = { viewModel.onSearchQueryChange("") }) {
                            Icon(Icons.Default.Clear, contentDescription = "Limpiar", tint = AuTextTertiary)
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

                    FilterChip(
                        selected = isSelected,
                        onClick = { viewModel.setFilter(filter) },
                        label = {
                            Text(
                                text = "${filter.label} ($count)",
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
                                    "No se encontraron órdenes con el criterio de búsqueda"
                                } else {
                                    "No hay órdenes médicas emitidas en esta categoría"
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
                    Text("Cerrar", color = PortalDoctors)
                }
            },
            title = {
                Text(
                    text = "Verificación de Orden Médica",
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
                                        text = "Código CUIR",
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
                                        Toast.makeText(context, "CUIR copiado al portapapeles", Toast.LENGTH_SHORT).show()
                                    }
                                ) {
                                    Icon(
                                        Icons.Default.ContentCopy,
                                        contentDescription = "Copiar CUIR",
                                        tint = PortalDoctors,
                                    )
                                }
                            }
                        }
                    }

                    Text(
                        text = "Válido ante centros de diagnóstico, laboratorios e instituciones según Decreto 63/2024.",
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
        "signed", "sent" -> Triple(AuSuccess.copy(alpha = 0.12f), AuSuccess, "Firmada")
        "draft" -> Triple(AuWarning.copy(alpha = 0.12f), AuWarning, "Borrador")
        "cancelled" -> Triple(AuDanger.copy(alpha = 0.12f), AuDanger, "Cancelada")
        else -> Triple(PortalDoctorsSoft, PortalDoctors, order.status.replaceFirstChar { it.uppercase() })
    }

    val (studyBg, studyColor) = when (order.studyType) {
        StudyType.LABORATORY -> PortalPatientsSoft to PortalPatients
        StudyType.IMAGING -> Color(0x1F8B5CF6) to Color(0xFF8B5CF6)
        StudyType.CARDIOLOGY -> Color(0x1FE11D48) to Color(0xFFE11D48)
        StudyType.OTHER -> PortalDoctorsSoft to PortalDoctors
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
                        text = order.studyType.displayName,
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
                        text = order.patientName ?: "Paciente",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = buildString {
                            order.patientDni?.let { append("DNI: $it · ") }
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
                    text = "Prácticas y estudios solicitados:",
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
                    text = "Dx: ${order.diagnosis}",
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
                        text = "Indicaciones: ${order.notes}",
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
                            text = "CUIR: ${order.cuir}",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            color = PortalDoctors,
                        )
                        IconButton(
                            onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("CUIR", order.cuir))
                                Toast.makeText(context, "CUIR copiado", Toast.LENGTH_SHORT).show()
                            },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                Icons.Default.ContentCopy,
                                contentDescription = "Copiar",
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
                            contentDescription = "Ver QR",
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
                                contentDescription = "Ver PDF",
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
