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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
import com.autamedica.android.domain.model.CertificateType
import com.autamedica.android.domain.model.MedicalCertificate
import com.autamedica.android.presentation.prescriptions.components.QrCodeView
import com.autamedica.android.presentation.theme.*

@Composable
fun getCertificateTypeDisplayName(type: CertificateType): String {
    return when (type) {
        CertificateType.REPOSO_LABORAL -> stringResource(R.string.cert_type_reposo_laboral)
        CertificateType.REPOSO_ESCOLAR -> stringResource(R.string.cert_type_reposo_escolar)
        CertificateType.APTITUD_FISICA -> stringResource(R.string.cert_type_aptitud_fisica)
        CertificateType.CONSTANCIA_ATENCION -> stringResource(R.string.cert_type_constancia_atencion)
        CertificateType.TRATAMIENTO -> stringResource(R.string.cert_type_tratamiento)
        CertificateType.OTRO -> stringResource(R.string.cert_type_otro)
    }
}

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
            Toast.makeText(context, context.getString(R.string.cert_toast_open_pdf_error), Toast.LENGTH_SHORT).show()
        }
    }

    var selectedCertForDetail by remember { mutableStateOf<MedicalCertificate?>(null) }

    LaunchedEffect(uiState.userMessage, uiState.userMessageRes) {
        val msg = uiState.userMessageRes?.let { resId ->
            if (uiState.userMessageArg != null) context.getString(resId, uiState.userMessageArg)
            else context.getString(resId)
        } ?: uiState.userMessage

        if (msg != null) {
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
                            text = stringResource(R.string.cert_screen_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = stringResource(R.string.cert_header_counts, uiState.validCount, uiState.totalCount),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.clinical_ops_back),
                            tint = AuTextPrimary,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.loadCertificates() }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(R.string.clinical_ops_refresh),
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
                text = { Text(stringResource(R.string.cert_action_new_certificate), fontWeight = FontWeight.Bold) },
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
                        placeholder = { Text(stringResource(R.string.cert_search_placeholder)) },
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
                            label = { Text(stringResource(R.string.cert_filter_all, uiState.totalCount)) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PortalDoctors,
                                selectedLabelColor = Color.White,
                            )
                        )
                        FilterChip(
                            selected = uiState.selectedStatusFilter == "validos",
                            onClick = { viewModel.onSelectStatusFilter("validos") },
                            label = { Text(stringResource(R.string.cert_filter_valid, uiState.validCount)) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PortalDoctors,
                                selectedLabelColor = Color.White,
                            )
                        )
                        FilterChip(
                            selected = uiState.selectedStatusFilter == "cancelados",
                            onClick = { viewModel.onSelectStatusFilter("cancelados") },
                            label = { Text(stringResource(R.string.cert_filter_cancelled, uiState.cancelledCount)) },
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
                            text = if (uiState.searchQuery.isNotBlank()) stringResource(R.string.cert_empty_search_title) else stringResource(R.string.cert_empty_list_title),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = AuTextSecondary
                        )
                        Text(
                            text = stringResource(R.string.cert_empty_list_subtitle),
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
                                Toast.makeText(context, context.getString(R.string.cert_toast_cuir_copied), Toast.LENGTH_SHORT).show()
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
                    text = getCertificateTypeDisplayName(cert.certificateType),
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary
                )
            },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    if (cert.effectiveQrContent.isNotBlank()) {
                        QrCodeView(
                            content = cert.effectiveQrContent,
                            modifier = Modifier.size(160.dp),
                            contentDescription = stringResource(R.string.cert_qr_validation_content_desc),
                        )
                    }
                    Text(
                        text = stringResource(R.string.cert_detail_cuir_label, cert.cuir),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = PortalDoctors
                    )
                    cert.patientName?.let { name ->
                        val patientText = cert.patientDni?.takeIf { it.isNotBlank() }?.let { dni ->
                            stringResource(R.string.cert_detail_patient_with_dni, name, dni)
                        } ?: stringResource(R.string.cert_detail_patient, name)
                        Text(
                            text = patientText,
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary
                        )
                    }
                    if (cert.daysOfRest > 0) {
                        Text(
                            text = stringResource(R.string.cert_days_of_rest_detail, cert.daysOfRest, cert.endDate ?: cert.startDate),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF16A34A)
                        )
                    }
                    if (cert.diagnosis != null) {
                        Text(
                            text = stringResource(R.string.cert_detail_diagnosis, cert.diagnosis),
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextPrimary
                        )
                    }
                    cert.observations?.let {
                        Text(
                            text = stringResource(R.string.cert_detail_observations, it),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary
                        )
                    }
                }
            },
            confirmButton = {
                val pdfUrl = cert.effectivePdfUrl
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Button(
                        onClick = {
                            selectedCertForDetail = null
                            pdfUrl?.let(onOpenPdf)
                        },
                        enabled = pdfUrl != null,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF0F766E),
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Outlined.PictureAsPdf, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(stringResource(R.string.cert_detail_download_pdf), fontWeight = FontWeight.Bold)
                    }
                    TextButton(onClick = { selectedCertForDetail = null }) {
                        Text(stringResource(R.string.clinical_ops_close), color = PortalDoctors, fontWeight = FontWeight.Bold)
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
    // Status alone does not establish a downloadable or verifiably signed document.
    val hasServerPdf = certificate.isActive

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
                            text = certificate.patientName ?: stringResource(R.string.cert_card_default_patient_name),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        certificate.patientDni?.takeIf { it.isNotBlank() }?.let { dni ->
                            Text(
                                text = stringResource(R.string.cert_card_dni_label, dni),
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextTertiary
                            )
                        }
                    }
                }

                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = if (hasServerPdf) Color(0xFFDCFCE7) else if (certificate.status == "draft") Color(0xFFFEF3C7) else Color(0xFFFEE2E2),
                ) {
                    Text(
                        text = when (certificate.status) {
                            "draft" -> stringResource(R.string.cert_status_draft)
                            "signed" -> if (hasServerPdf) stringResource(R.string.cert_status_valid) else stringResource(R.string.cert_status_unverified)
                            else -> stringResource(R.string.cert_status_cancelled)
                        },
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = if (hasServerPdf) Color(0xFF16A34A) else if (certificate.status == "draft") Color(0xFF92400E) else Color(0xFFDC2626),
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
                        text = getCertificateTypeDisplayName(certificate.certificateType),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Bold,
                        color = PortalDoctors
                    )
                    val restText = when {
                        certificate.daysOfRest <= 0 -> stringResource(R.string.cert_no_rest)
                        certificate.daysOfRest == 1 -> stringResource(R.string.cert_days_of_rest_one)
                        else -> stringResource(R.string.cert_days_of_rest_count, certificate.daysOfRest)
                    }
                    Text(
                        text = restText,
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
                    text = stringResource(R.string.cert_diagnosis_reserved),
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
                    val pdfUrl = certificate.effectivePdfUrl

                    Button(
                        onClick = { pdfUrl?.let(onOpenPdf) },
                        enabled = pdfUrl != null,
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
                            text = stringResource(R.string.clinical_ops_pdf),
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
                            Text(stringResource(R.string.clinical_ops_qr), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
