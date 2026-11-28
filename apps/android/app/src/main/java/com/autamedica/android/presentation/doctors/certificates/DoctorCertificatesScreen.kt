package com.autamedica.android.presentation.doctors.certificates

import com.autamedica.android.presentation.common.maskPatientDocument

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.autamedica.android.presentation.common.DocumentViewerSource
import com.autamedica.android.presentation.common.InAppDocumentViewerDialog
import com.autamedica.android.domain.model.CertificateType
import com.autamedica.android.domain.model.MedicalCertificate
import com.autamedica.android.domain.model.RegulatoryJurisdiction
import com.autamedica.android.domain.model.RegulatoryJurisdictionCopy
import com.autamedica.android.domain.model.resolveRegulatoryJurisdiction
import com.autamedica.android.presentation.prescriptions.components.QrCodeView
import com.autamedica.android.presentation.theme.*

@Composable
fun getCertificateTypeDisplayName(
    type: CertificateType,
    jurisdiction: RegulatoryJurisdiction = RegulatoryJurisdiction.GENERIC,
): String {
    return when (type) {
        CertificateType.REPOSO_LABORAL -> stringResource(
            RegulatoryJurisdictionCopy.certificateWorkLeaveLabelRes(jurisdiction)
        )
        CertificateType.REPOSO_ESCOLAR -> stringResource(R.string.cert_type_reposo_escolar)
        CertificateType.APTITUD_FISICA -> stringResource(R.string.cert_type_aptitud_fisica)
        CertificateType.CONSTANCIA_ATENCION -> stringResource(R.string.cert_type_constancia_atencion)
        CertificateType.TRATAMIENTO -> stringResource(R.string.cert_type_tratamiento)
        CertificateType.OTRO -> stringResource(R.string.cert_type_otro)
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun DoctorCertificatesScreen(
    onBack: () -> Unit,
    onNavigateToCreateCertificate: () -> Unit,
    modifier: Modifier = Modifier,
    showBackButton: Boolean = true,
    viewModel: DoctorCertificatesViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }

    var activeDocumentViewer by remember { mutableStateOf<DocumentViewerSource?>(null) }

    val onOpenPdf: (MedicalCertificate) -> Unit = { certificate ->
        val certTitle = context.getString(R.string.cert_screen_title)
        val certFileName = "Certificado_${certificate.cuir ?: certificate.id.take(8)}.pdf"
        viewModel.openCertificatePdf(
            certificate = certificate,
            onReady = { signedUrl ->
                val uri = Uri.parse(signedUrl)
                if (uri.scheme.equals("https", ignoreCase = true)) {
                    activeDocumentViewer = DocumentViewerSource.RemoteDocumentUrl(
                        url = signedUrl,
                        title = certTitle,
                        fileName = certFileName,
                    )
                } else {
                    Toast.makeText(context, context.getString(R.string.cert_toast_open_pdf_error), Toast.LENGTH_SHORT).show()
                }
            },
            onFailure = {
                Toast.makeText(context, context.getString(R.string.cert_toast_open_pdf_error), Toast.LENGTH_SHORT).show()
            },
        )
    }

    activeDocumentViewer?.let { docSource ->
        InAppDocumentViewerDialog(
            source = docSource,
            onDismiss = { activeDocumentViewer = null },
        )
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
                            color = AuTextSecondary,
                        )
                    }
                },
                navigationIcon = {
                    if (showBackButton) {
                        IconButton(
                            onClick = onBack,
                            modifier = Modifier.minimumInteractiveComponentSize(),
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.clinical_ops_back),
                                tint = AuTextPrimary,
                            )
                        }
                    }
                },
                actions = {
                    IconButton(
                        onClick = { viewModel.loadCertificates() },
                        modifier = Modifier.minimumInteractiveComponentSize(),
                    ) {
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
                containerColor = PrimaryDark,
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
                border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.35f)),
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
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = AuTextSecondary) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PrimaryDark,
                            unfocusedBorderColor = AuInputBorder,
                            unfocusedPlaceholderColor = AuTextSecondary,
                        )
                    )

                    // Status Filter Chips
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        FilterChip(
                            selected = uiState.selectedStatusFilter == "todos",
                            onClick = { viewModel.onSelectStatusFilter("todos") },
                            modifier = Modifier.minimumInteractiveComponentSize(),
                            label = { Text(stringResource(R.string.cert_filter_all, uiState.totalCount)) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PrimaryDark,
                                selectedLabelColor = Color.White,
                            )
                        )
                        FilterChip(
                            selected = uiState.selectedStatusFilter == "validos",
                            onClick = { viewModel.onSelectStatusFilter("validos") },
                            modifier = Modifier.minimumInteractiveComponentSize(),
                            label = { Text(stringResource(R.string.cert_filter_valid, uiState.validCount)) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PrimaryDark,
                                selectedLabelColor = Color.White,
                            )
                        )
                        FilterChip(
                            selected = uiState.selectedStatusFilter == "cancelados",
                            onClick = { viewModel.onSelectStatusFilter("cancelados") },
                            modifier = Modifier.minimumInteractiveComponentSize(),
                            label = { Text(stringResource(R.string.cert_filter_cancelled, uiState.cancelledCount)) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PrimaryDark,
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
                    CircularProgressIndicator(color = PrimaryDark, strokeWidth = 2.dp)
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
                    QrCodeView(
                        content = cert.effectiveQrContent,
                        modifier = Modifier.size(160.dp),
                        contentDescription = stringResource(R.string.cert_qr_validation_content_desc),
                    )
                    Text(
                        text = stringResource(R.string.cert_detail_cuir_label, cert.cuir),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = PrimaryDark
                    )
                    cert.patientName?.let { name ->
                        val patientText = cert.patientDni?.takeIf { it.isNotBlank() }?.let { dni ->
                            stringResource(R.string.cert_detail_patient_with_dni, name, maskPatientDocument(dni))
                        } ?: stringResource(R.string.cert_detail_patient, name)
                        Text(
                            text = patientText,
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary
                        )
                    }
                    when {
                        cert.restHours > 0 -> Text(
                            text = stringResource(R.string.cert_rest_hours_detail, cert.restHours, cert.startDate),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Bold,
                            color = AuSuccessText
                        )
                        cert.daysOfRest > 0 -> Text(
                            text = stringResource(R.string.cert_days_of_rest_detail, cert.daysOfRest, cert.endDate ?: cert.startDate),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Bold,
                            color = AuSuccessText
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
                            color = AuTextSecondary
                        )
                    }
                }
            },
            confirmButton = {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Button(
                        onClick = {
                            selectedCertForDetail = null
                            onOpenPdf(cert)
                        },
                        enabled = cert.isActive,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = AuSuccessText,
                            contentColor = Color.White
                        ),
                        modifier = Modifier
                            .minimumInteractiveComponentSize()
                            .heightIn(min = 48.dp),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Outlined.PictureAsPdf, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(stringResource(R.string.cert_detail_download_pdf), fontWeight = FontWeight.Bold)
                    }
                    TextButton(
                        onClick = { selectedCertForDetail = null },
                        modifier = Modifier.minimumInteractiveComponentSize(),
                    ) {
                        Text(stringResource(R.string.clinical_ops_close), color = PrimaryDark, fontWeight = FontWeight.Bold)
                    }
                }
            }
        )
    }
}

@Composable
private fun DoctorCertificateCard(
    certificate: MedicalCertificate,
    onOpenPdf: (MedicalCertificate) -> Unit,
    onCopyCuir: () -> Unit,
    onOpenDetail: () -> Unit,
) {
    val isValid = certificate.isActive
    val isPendingVerification = certificate.status.equals("signed", ignoreCase = true) && !isValid
    val isPending = certificate.status == "draft" || isPendingVerification

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
                        color = PrimaryContainer,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Outlined.Person,
                                contentDescription = null,
                                tint = PrimaryDark,
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
                                text = stringResource(R.string.cert_card_dni_label, maskPatientDocument(dni)),
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextSecondary
                            )
                        }
                    }
                }

                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = when {
                        isValid -> SuccessContainer
                        isPending -> PrimaryContainer
                        else -> ErrorContainer
                    },
                ) {
                    Text(
                        text = when {
                            isValid -> stringResource(R.string.cert_status_valid)
                            isPendingVerification -> stringResource(R.string.cert_status_pending_verification)
                            certificate.status == "draft" -> stringResource(R.string.cert_status_draft)
                            else -> stringResource(R.string.cert_status_cancelled)
                        },
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = when {
                            isValid -> AuSuccessText
                            isPending -> PrimaryDark
                            else -> AuDangerText
                        },
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
                val certJurisdiction = resolveRegulatoryJurisdiction(
                    countryCode = certificate.countryCode,
                    doctorLicense = certificate.doctorLicense,
                )
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = getCertificateTypeDisplayName(certificate.certificateType, certJurisdiction),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Bold,
                        color = PrimaryDark
                    )
                    val restText = when {
                        certificate.restHours > 0 -> stringResource(R.string.cert_rest_hours_format, certificate.restHours)
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
                val certJurisdiction = resolveRegulatoryJurisdiction(
                    countryCode = certificate.countryCode,
                    doctorLicense = certificate.doctorLicense,
                )
                Text(
                    text = stringResource(RegulatoryJurisdictionCopy.certificateDiagnosisReservedRes(certJurisdiction)),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextSecondary
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
                    modifier = Modifier.minimumInteractiveComponentSize(),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp), tint = AuTextSecondary)
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
                    Button(
                        onClick = { onOpenPdf(certificate) },
                        enabled = isValid && certificate.signedPdfUrl?.isNotBlank() == true,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = AuSuccessText,
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        modifier = Modifier
                            .minimumInteractiveComponentSize()
                            .heightIn(min = 48.dp)
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
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .minimumInteractiveComponentSize()
                            .heightIn(min = 48.dp)
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
