package com.autamedica.android.presentation.doctors.certificates

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import com.autamedica.android.domain.model.DoctorEligibility
import com.autamedica.android.domain.model.MedicalCertificate
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.presentation.prescriptions.components.QrCodeView
import com.autamedica.android.presentation.theme.*

private val COMMON_CERT_DIAGNOSES_RES = listOf(
    R.string.cert_diag_gastroenteritis,
    R.string.cert_diag_respiratory,
    R.string.cert_diag_lumbalgia,
    R.string.cert_diag_bronchitis,
    R.string.cert_diag_headache,
    R.string.cert_diag_physical_aptitude,
    R.string.cert_diag_trauma,
    R.string.cert_diag_pharyngitis,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateCertificateScreen(
    patientId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DoctorCertificatesViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    var patientSearchQuery by remember { mutableStateOf("") }
    var expandedPatientDropdown by remember { mutableStateOf(false) }

    LaunchedEffect(patientId) {
        viewModel.initCreateCertificate(patientId)
    }

    Scaffold(
        modifier = modifier,
        containerColor = AuBackground,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = stringResource(R.string.cert_create_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = stringResource(R.string.cert_create_legal_basis),
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
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AuSurface),
            )
        },
        bottomBar = {
            Surface(
                color = AuSurface,
                border = BorderStroke(1.dp, AuBorder),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val errorMessage = uiState.createErrorRes?.let { resId ->
                        if (uiState.createErrorArg != null) stringResource(resId, uiState.createErrorArg!!)
                        else stringResource(resId)
                    } ?: uiState.createError

                    errorMessage?.let { err ->
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = AuDanger.copy(alpha = 0.10f),
                            border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.3f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.Warning, contentDescription = null, tint = AuDanger, modifier = Modifier.size(16.dp))
                                Text(
                                    text = err,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = AuDanger,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }

                    Button(
                        onClick = { viewModel.onSubmitCertificate() },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors),
                        enabled = !uiState.isSubmitting && !uiState.isLoadingEligibility && uiState.doctorEligibility?.isEligible == true,
                    ) {
                        if (uiState.isSubmitting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(stringResource(R.string.cert_create_submitting))
                        } else {
                            Icon(Icons.Outlined.HealthAndSafety, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(stringResource(R.string.cert_create_submit_button), fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 1. Regulatory Verification Status Banner
            DoctorRegulatoryBanner(uiState.doctorEligibility, uiState.isLoadingEligibility, viewModel::loadEligibility)

            // 2. Patient Selector Card
            PatientSelectorSection(
                selectedPatient = uiState.selectedPatient,
                eligiblePatients = uiState.eligiblePatients,
                isLoadingPatients = uiState.isLoadingPatients,
                patientSearchQuery = patientSearchQuery,
                onSearchQueryChange = { patientSearchQuery = it },
                expanded = expandedPatientDropdown,
                onExpandedChange = { expandedPatientDropdown = it },
                onSelectPatient = {
                    viewModel.onSelectPatient(it)
                    expandedPatientDropdown = false
                },
            )

            // 3. Certificate Type Selector
            CertificateTypeSelectorSection(
                selectedType = uiState.certificateType,
                onSelectType = { viewModel.onSelectType(it) }
            )

            // 4. Days of Rest & Period (if applicable)
            DaysOfRestSection(
                certificateType = uiState.certificateType,
                daysOfRest = uiState.daysOfRest,
                startDate = uiState.startDate,
                endDate = uiState.endDate,
                onDaysChange = { viewModel.onDaysOfRestChange(it) },
                onStartDateChange = { viewModel.onStartDateChange(it) }
            )

            // 5. Clinical Diagnosis & Secreto Médico Toggle
            DiagnosisAndPrivacySection(
                diagnosis = uiState.diagnosis,
                hideDiagnosis = uiState.hideDiagnosis,
                onDiagnosisChange = { viewModel.onDiagnosisChange(it) },
                onToggleHide = { viewModel.onToggleHideDiagnosis(it) }
            )

            // 6. Clinical Observations
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = AuSurface,
                border = BorderStroke(1.dp, AuBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = stringResource(R.string.cert_obs_section_title),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary
                    )
                    OutlinedTextField(
                        value = uiState.observations,
                        onValueChange = { viewModel.onObservationsChange(it) },
                        placeholder = { Text(stringResource(R.string.cert_obs_placeholder)) },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        maxLines = 4,
                        shape = RoundedCornerShape(10.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PortalDoctors,
                            unfocusedBorderColor = AuBorder,
                        )
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }

    // Success Dialog
    uiState.createdCertificate?.let { created ->
        AlertDialog(
            onDismissRequest = {
                viewModel.clearCreatedCertificate()
                onBack()
            },
            icon = {
                Icon(
                    imageVector = Icons.Outlined.CheckCircle,
                    contentDescription = null,
                    tint = AuSuccess,
                    modifier = Modifier.size(48.dp)
                )
            },
            title = {
                Text(
                    text = stringResource(R.string.cert_success_dialog_title),
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                )
            },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = stringResource(R.string.cert_success_dialog_body),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary
                    )

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = AuSurfaceHover,
                        border = BorderStroke(1.dp, PortalDoctors.copy(alpha = 0.3f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.cert_success_cuir_header),
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextTertiary,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = created.cuir,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = PortalDoctors
                            )
                            IconButton(onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("CUIR", created.cuir))
                                Toast.makeText(context, context.getString(R.string.cert_toast_cuir_copied), Toast.LENGTH_SHORT).show()
                            }) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(14.dp), tint = PortalDoctors)
                                    Text(stringResource(R.string.clinical_ops_copy), style = MaterialTheme.typography.labelSmall, color = PortalDoctors)
                                }
                            }
                        }
                    }

                    // Drafts must never display a QR that looks like a public verification token.
                    if (created.effectiveQrContent.isNotBlank()) {
                        QrCodeView(
                            content = created.effectiveQrContent,
                            modifier = Modifier.size(140.dp),
                            contentDescription = stringResource(R.string.cert_qr_validation_content_desc),
                        )
                    }

                    Text(
                        text = stringResource(R.string.cert_success_dialog_footer),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.clearCreatedCertificate()
                        onBack()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors)
                ) {
                    Text(stringResource(R.string.cert_success_back_to_certificates))
                }
            }
        )
    }
}

@Composable
private fun DoctorRegulatoryBanner(eligibility: DoctorEligibility?, isLoading: Boolean, onRetry: () -> Unit) {
    val isEligible = eligibility?.isEligible == true
    val license = eligibility?.doctorLicense ?: stringResource(R.string.cert_reg_registered)

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (isEligible) AuSuccess.copy(alpha = 0.08f) else AuCrimson.copy(alpha = 0.08f),
        border = BorderStroke(1.dp, if (isEligible) AuSuccess.copy(alpha = 0.25f) else AuCrimson.copy(alpha = 0.35f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = if (isEligible) Icons.Outlined.HealthAndSafety else Icons.Default.Warning,
                contentDescription = null,
                tint = if (isEligible) AuSuccess else AuCrimson,
                modifier = Modifier.size(20.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (isEligible) stringResource(R.string.cert_reg_active_title) else stringResource(R.string.cert_reg_pending_title),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (isEligible) AuSuccess else Color(0xFFB45309),
                )
                Text(
                    text = if (isEligible) {
                        stringResource(R.string.cert_reg_license_active, license)
                    } else {
                        eligibility?.reason ?: stringResource(R.string.cert_reg_license_required)
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary
                )
                if (!isEligible) {
                    TextButton(onClick = onRetry, enabled = !isLoading) {
                        Text(stringResource(R.string.clinical_ops_refresh))
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PatientSelectorSection(
    selectedPatient: PrescriptionPatientItem?,
    eligiblePatients: List<PrescriptionPatientItem>,
    isLoadingPatients: Boolean,
    patientSearchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onSelectPatient: (PrescriptionPatientItem) -> Unit,
) {
    val filtered = remember(eligiblePatients, patientSearchQuery) {
        if (patientSearchQuery.isBlank()) eligiblePatients
        else eligiblePatients.filter {
            it.fullName.contains(patientSearchQuery, ignoreCase = true) ||
                (it.dni?.contains(patientSearchQuery) == true)
        }
    }

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .background(PortalDoctors.copy(alpha = 0.12f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Outlined.Person, contentDescription = null, tint = PortalDoctors, modifier = Modifier.size(18.dp))
                }
                Column {
                    Text(
                        text = stringResource(R.string.cert_patient_recipient_title),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary
                    )
                    Text(
                        text = stringResource(R.string.cert_patient_recipient_subtitle),
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary
                    )
                }
            }

            if (selectedPatient != null) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = AuSurfaceHover,
                    border = BorderStroke(1.dp, PortalDoctors.copy(alpha = 0.35f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = selectedPatient.fullName,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                selectedPatient.dni?.let { dni ->
                                    Text(
                                        text = stringResource(R.string.cert_patient_dni_label, dni),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = AuTextSecondary
                                    )
                                }
                                selectedPatient.birthDate?.let { b ->
                                    Text(text = "· $b", style = MaterialTheme.typography.labelSmall, color = AuTextTertiary)
                                }
                            }
                        }
                        TextButton(onClick = { onExpandedChange(true) }) {
                            Text(stringResource(R.string.clinical_ops_change), color = PortalDoctors, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            ExposedDropdownMenuBox(
                expanded = expanded,
                onExpandedChange = onExpandedChange,
            ) {
                OutlinedTextField(
                    value = if (selectedPatient != null && !expanded) selectedPatient.fullName else patientSearchQuery,
                    onValueChange = onSearchQueryChange,
                    placeholder = { Text(stringResource(R.string.cert_patient_search_placeholder)) },
                    leadingIcon = { Icon(Icons.Outlined.Person, contentDescription = null, tint = AuTextTertiary) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(MenuAnchorType.PrimaryEditable, enabled = true),
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PortalDoctors,
                        unfocusedBorderColor = AuBorder,
                    )
                )

                ExposedDropdownMenu(
                    expanded = expanded,
                    onDismissRequest = { onExpandedChange(false) },
                    modifier = Modifier.background(AuSurface)
                ) {
                    if (isLoadingPatients) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.cert_patient_loading)) },
                            onClick = {}
                        )
                    } else if (filtered.isEmpty()) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.cert_patient_empty)) },
                            onClick = {}
                        )
                    } else {
                        filtered.forEach { p ->
                            DropdownMenuItem(
                                text = {
                                    Column {
                                        Text(p.fullName, fontWeight = FontWeight.Bold)
                                        p.dni?.let { Text(stringResource(R.string.cert_patient_dni_label, it), style = MaterialTheme.typography.labelSmall, color = AuTextTertiary) }
                                    }
                                },
                                onClick = { onSelectPatient(p) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CertificateTypeSelectorSection(
    selectedType: CertificateType,
    onSelectType: (CertificateType) -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .background(PortalDoctors.copy(alpha = 0.12f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Outlined.Description, contentDescription = null, tint = PortalDoctors, modifier = Modifier.size(18.dp))
                }
                Column {
                    Text(
                        text = stringResource(R.string.cert_type_section_title),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary
                    )
                    Text(
                        text = stringResource(R.string.cert_type_section_subtitle),
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary
                    )
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CertificateType.entries.forEach { type ->
                    val isSelected = selectedType == type
                    FilterChip(
                        selected = isSelected,
                        onClick = { onSelectType(type) },
                        label = { Text(getCertificateTypeDisplayName(type), fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal) },
                        leadingIcon = if (isSelected) {
                            { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                        } else null,
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PortalDoctors,
                            selectedLabelColor = Color.White,
                            selectedLeadingIconColor = Color.White,
                        )
                    )
                }
            }
        }
    }
}

@Composable
private fun DaysOfRestSection(
    certificateType: CertificateType,
    daysOfRest: Int,
    startDate: String,
    endDate: String?,
    onDaysChange: (Int) -> Unit,
    onStartDateChange: (String) -> Unit,
) {
    val presetDays = listOf(1, 2, 3, 5, 7, 14, 30)

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = stringResource(R.string.cert_rest_section_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary
            )

            // Quick preset chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                presetDays.forEach { days ->
                    val isSelected = daysOfRest == days
                    val chipText = when (days) {
                        1 -> stringResource(R.string.cert_rest_24h)
                        2 -> stringResource(R.string.cert_rest_48h)
                        else -> stringResource(R.string.cert_rest_days_format, days)
                    }
                    FilterChip(
                        selected = isSelected,
                        onClick = { onDaysChange(days) },
                        label = { Text(chipText) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PortalDoctors,
                            selectedLabelColor = Color.White,
                        )
                    )
                }
                FilterChip(
                    selected = daysOfRest == 0,
                    onClick = { onDaysChange(0) },
                    label = { Text(stringResource(R.string.cert_no_rest)) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = PortalDoctors,
                        selectedLabelColor = Color.White,
                    )
                )
            }

            // Summary Card
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = AuSurfaceHover,
                border = BorderStroke(1.dp, AuBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(stringResource(R.string.cert_rest_start_date_label), style = MaterialTheme.typography.bodySmall, color = AuTextSecondary)
                        Text(startDate, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = AuTextPrimary)
                    }
                    if (daysOfRest > 0 && endDate != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(stringResource(R.string.cert_rest_end_date_label), style = MaterialTheme.typography.bodySmall, color = AuTextSecondary)
                            Text(endDate, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = Color(0xFF16A34A))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DiagnosisAndPrivacySection(
    diagnosis: String,
    hideDiagnosis: Boolean,
    onDiagnosisChange: (String) -> Unit,
    onToggleHide: (Boolean) -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = stringResource(R.string.cert_diag_section_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary
            )

            // Common diagnoses chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                COMMON_CERT_DIAGNOSES_RES.take(4).forEach { resId ->
                    val diagText = stringResource(resId)
                    val isSelected = diagnosis == diagText
                    FilterChip(
                        selected = isSelected,
                        onClick = { onDiagnosisChange(diagText) },
                        label = { Text(diagText.take(24) + "...", style = MaterialTheme.typography.labelSmall) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PortalDoctors,
                            selectedLabelColor = Color.White,
                        )
                    )
                }
            }

            OutlinedTextField(
                value = diagnosis,
                onValueChange = onDiagnosisChange,
                placeholder = { Text(stringResource(R.string.cert_diag_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4,
                shape = RoundedCornerShape(10.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PortalDoctors,
                    unfocusedBorderColor = AuBorder,
                )
            )

            // Secreto Médico Switch Card
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = if (hideDiagnosis) Color(0xFFF0FDF4) else AuSurfaceHover,
                border = BorderStroke(1.dp, if (hideDiagnosis) Color(0xFF86EFAC) else AuBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Lock,
                        contentDescription = null,
                        tint = if (hideDiagnosis) Color(0xFF16A34A) else AuTextTertiary,
                        modifier = Modifier.size(24.dp)
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.cert_privacy_hide_diagnosis_title),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary
                        )
                        Text(
                            text = stringResource(R.string.cert_privacy_hide_diagnosis_subtitle),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextSecondary
                        )
                    }
                    Switch(
                        checked = hideDiagnosis,
                        onCheckedChange = onToggleHide,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = Color(0xFF16A34A),
                        )
                    )
                }
            }
        }
    }
}
