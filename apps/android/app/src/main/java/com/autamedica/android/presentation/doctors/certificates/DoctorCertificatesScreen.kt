package com.autamedica.android.presentation.doctors.certificates

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
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
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
import com.autamedica.android.domain.model.MedicalCertificate
import com.autamedica.android.presentation.prescriptions.components.QrCodeView
import com.autamedica.android.presentation.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorCertificatesScreen(
    onBack: () -> Unit,
    onNavigateToCreateCertificate: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DoctorCertificatesViewModel = hiltViewModel(),
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
            Toast.makeText(context, "No se pudo abrir el atestado oficial.", Toast.LENGTH_SHORT).show()
        }
    }

    var selectedCertForDetail by remember { mutableStateOf<MedicalCertificate?>(null) }

    LaunchedEffect(uiState.userMessage) {
        uiState.userMessage?.let { msg ->
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
                            text = "Atestados Médicos Emitidos",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = "${uiState.validCount} válidos · ${uiState.totalCount} emitidos",
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
                    IconButton(onClick = { viewModel.loadCertificates() }) {
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
            ExtendedFloatingActionButton(
                onClick = onNavigateToCreateCertificate,
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("Nuevo Atestado", fontWeight = FontWeight.Bold) },
                containerColor = PortalDoctors,
                contentColor = Color.White,
                shape = RoundedCornerShape(16.dp),
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
        ) {
            // Search Bar
            Surface(
                color = AuSurface,
                border = BorderStroke(1.dp, AuBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = uiState.searchQuery,
                        onValueChange = { viewModel.onSearchQueryChange(it) },
                        placeholder = { Text("Buscar por paciente, DNI, CUIR o diagnóstico...") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = AuTextTertiary) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PortalDoctors,
                            unfocusedBorderColor = AuBorder,
                        )
                    )

                    // Status Filter Chips
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        FilterChip(
                            selected = uiState.selectedStatusFilter == "todos",
                            onClick = { viewModel.onSelectStatusFilter("todos") },
                            label = { Text("Todos (${uiState.totalCount})") },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PortalDoctors,
                                selectedLabelColor = Color.White,
                            )
                        )
                        FilterChip(
                            selected = uiState.selectedStatusFilter == "validos",
                            onClick = { viewModel.onSelectStatusFilter("validos") },
                            label = { Text("Válidos (${uiState.validCount})") },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PortalDoctors,
                                selectedLabelColor = Color.White,
                            )
                        )
                        FilterChip(
                            selected = uiState.selectedStatusFilter == "cancelados",
                            onClick = { viewModel.onSelectStatusFilter("cancelados") },
                            label = { Text("Cancelados (${uiState.cancelledCount})") },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PortalDoctors,
                                selectedLabelColor = Color.White,
                            )
                        )
                    }
                }
            }

            // List of Certificates
            if (uiState.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = PortalDoctors, strokeWidth = 2.dp)
                }
            } else if (uiState.filteredCertificates.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Description,
                            contentDescription = null,
                            tint = AuTextTertiary,
                            modifier = Modifier.size(56.dp)
                        )
                        Text(
                            text = if (uiState.searchQuery.isNotBlank()) "No hay resultados para la búsqueda" else "Sin atestados médicos emitidos",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = AuTextSecondary
                        )
                        Text(
                            text = "Presione el botón 'Nuevo Atestado' para emitir su primera certificación médica digital.",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextTertiary
                        )
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(
                        items = uiState.filteredCertificates,
                        key = { it.id }
                    ) { cert ->
                        DoctorCertificateCard(
                            certificate = cert,
                            onOpenPdf = onOpenPdf,
                            onCopyCuir = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("CUIR", cert.cuir))
                                Toast.makeText(context, "CUIR copiado", Toast.LENGTH_SHORT).show()
                            },
                            onOpenDetail = { selectedCertForDetail = cert }
                        )
                    }
                }
            }
        }
    }

    // Detail Modal / Sheet
    selectedCertForDetail?.let { cert ->
        AlertDialog(
            onDismissRequest = { selectedCertForDetail = null },
            title = {
                Text(
                    text = cert.certificateType.displayName,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary
                )
            },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    QrCodeView(
                        content = cert.effectiveQrContent,
                        modifier = Modifier.size(160.dp),
                        contentDescription = "Código QR de Validación Institucional",
                    )
                    Text(
                        text = "CUIR: ${cert.cuir}",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = PortalDoctors
                    )
                    cert.patientName?.let {
                        Text(
                            text = "Paciente: $it ${cert.patientDni?.let { dni -> "($dni)" } ?: ""}",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary
                        )
                    }
                    if (cert.daysOfRest > 0) {
                        Text(
                            text = "${cert.daysOfRest} días de reposo (Hasta: ${cert.endDate ?: cert.startDate})",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF16A34A)
                        )
                    }
                    if (cert.diagnosis != null) {
                        Text(
                            text = "Diagnóstico: ${cert.diagnosis}",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextPrimary
                        )
                    }
                    cert.observations?.let {
                        Text(
                            text = "Observaciones: $it",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary
                        )
                    }
                }
            },
            confirmButton = {
                val pdfUrl = cert.signedPdfUrl?.takeIf { it.isNotBlank() }
                    ?: "https://autamedica.com/verify/${cert.cuir}"
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Button(
                        onClick = {
                            selectedCertForDetail = null
                            onOpenPdf(pdfUrl)
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF0F766E),
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Outlined.PictureAsPdf, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Descargar PDF", fontWeight = FontWeight.Bold)
                    }
                    TextButton(onClick = { selectedCertForDetail = null }) {
                        Text("Cerrar", color = PortalDoctors, fontWeight = FontWeight.Bold)
                    }
                }
            }
        )
    }
}

@Composable
private fun DoctorCertificateCard(
    certificate: MedicalCertificate,
    onOpenPdf: (String) -> Unit,
    onCopyCuir: () -> Unit,
    onOpenDetail: () -> Unit,
) {
    val isValid = certificate.status == "signed"

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Header Row: Patient Name + Status Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = PortalPatients.copy(alpha = 0.15f),
                        modifier = Modifier.size(32.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Outlined.Person,
                                contentDescription = null,
                                tint = PortalPatients,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    Column {
                        Text(
                            text = certificate.patientName ?: "Paciente Asignado",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        certificate.patientDni?.takeIf { it.isNotBlank() }?.let { dni ->
                            Text(
                                text = "DNI: $dni",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextTertiary
                            )
                        }
                    }
                }

                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = if (isValid) Color(0xFFDCFCE7) else Color(0xFFFEE2E2),
                ) {
                    Text(
                        text = if (isValid) "Válido" else "Cancelado",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = if (isValid) Color(0xFF16A34A) else Color(0xFFDC2626),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }

            // Type and Duration
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = AuSurfaceHover,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = certificate.certificateType.displayName,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Bold,
                        color = PortalDoctors
                    )
                    Text(
                        text = if (certificate.daysOfRest > 0) "${certificate.daysOfRest} días de reposo" else "Sin reposo",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextSecondary
                    )
                }
            }

            // Diagnosis if available
            if (certificate.diagnosis != null) {
                Text(
                    text = certificate.diagnosis,
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            } else if (certificate.hideDiagnosis) {
                Text(
                    text = "🔒 Diagnóstico reservado (Secreto médico)",
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary
                )
            }

            // Action Band: CUIR + QR + PDF
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                TextButton(
                    onClick = onCopyCuir,
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(14.dp), tint = AuTextSecondary)
                        Text(
                            text = certificate.cuir,
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                            color = AuTextSecondary
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    val pdfUrl = certificate.signedPdfUrl?.takeIf { it.isNotBlank() }
                        ?: "https://autamedica.com/verify/${certificate.cuir}"

                    Button(
                        onClick = { onOpenPdf(pdfUrl) },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF0F766E),
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
                            text = "PDF",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    FilledTonalButton(
                        onClick = onOpenDetail,
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.height(34.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(Icons.Outlined.QrCode, contentDescription = null, modifier = Modifier.size(16.dp))
                            Text("QR", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
