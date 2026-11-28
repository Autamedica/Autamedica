package com.autamedica.android.presentation.doctors.certificates

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
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
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
import com.autamedica.android.domain.model.CertificateType
import com.autamedica.android.domain.model.ClinicalJurisdictionResolution
import com.autamedica.android.domain.model.DoctorEligibility
import com.autamedica.android.domain.model.resolveClinicalJurisdictionState
import com.autamedica.android.presentation.doctors.components.EventualPatientDniSelectorCard
import com.autamedica.android.presentation.doctors.components.MemedPrescriberWebView
import com.autamedica.android.presentation.doctors.components.ShareDocumentToPatientButton
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
    val diagnosisFocusRequester = remember { FocusRequester() }

    var patientSearchQuery by remember { mutableStateOf("") }
    var expandedPatientDropdown by remember { mutableStateOf(false) }
    val jurisdictionState = resolveClinicalJurisdictionState(
        eligibility = uiState.doctorEligibility,
        isLoadingEligibility = uiState.isLoadingEligibility,
    )
    val isBrazil = jurisdictionState == ClinicalJurisdictionResolution.BR
    val isArgentina = jurisdictionState == ClinicalJurisdictionResolution.AR

    LaunchedEffect(patientId) {
        viewModel.initCreateCertificate(patientId)
    }

    LaunchedEffect(uiState.isDiagnosisValidationError) {
        if (uiState.isDiagnosisValidationError) {
            scrollState.animateScrollTo(scrollState.maxValue)
            runCatching { diagnosisFocusRequester.requestFocus() }
        }
    }

    Scaffold(
        modifier = modifier,
        containerColor = AuBackground,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = stringResource(
                                if (isBrazil) R.string.cert_create_title_br else R.string.cert_create_title_ar
                            ),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = stringResource(
                                if (isBrazil) R.string.cert_create_legal_br else R.string.cert_create_legal_ar
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextSecondary,
                        )
                    }
                },
                navigationIcon = {
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
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AuSurface),
            )
        },
        bottomBar = {
            Surface(
                color = AuSurface,
                border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.35f)),
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
                            color = ErrorContainer,
                            border = BorderStroke(1.dp, AuDangerText.copy(alpha = 0.45f)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .semantics { liveRegion = LiveRegionMode.Assertive }
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.Warning, contentDescription = null, tint = AuDangerText, modifier = Modifier.size(16.dp))
                                Text(
                                    text = err,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = AuDangerText,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }

                    when (jurisdictionState) {
                        ClinicalJurisdictionResolution.BR -> {
                            Button(
                                onClick = { viewModel.openMemedForBrazilCertificate() },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .minimumInteractiveComponentSize()
                                    .heightIn(min = 50.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = PrimaryDark, contentColor = Color.White),
                                enabled = !uiState.isOpeningMemed,
                            ) {
                                if (uiState.isOpeningMemed) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = Color.White,
                                        strokeWidth = 2.dp,
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(stringResource(R.string.cert_create_memed_opening), fontWeight = FontWeight.Bold)
                                } else {
                                    Icon(Icons.Outlined.HealthAndSafety, contentDescription = null, modifier = Modifier.size(20.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(stringResource(R.string.cert_create_memed_icp_btn), fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                        ClinicalJurisdictionResolution.AR -> {
                            Button(
                                onClick = { viewModel.onSubmitCertificate() },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .minimumInteractiveComponentSize()
                                    .heightIn(min = 50.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = PrimaryDark, contentColor = Color.White),
                                enabled = !uiState.isSubmitting,
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
                                    Text(
                                        text = stringResource(R.string.cert_create_submit_ar),
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                        }
                        ClinicalJurisdictionResolution.LOADING -> {
                            Button(
                                onClick = {},
                                enabled = false,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .minimumInteractiveComponentSize()
                                    .heightIn(min = 50.dp),
                                shape = RoundedCornerShape(12.dp),
                            ) {
                                Text(stringResource(R.string.doctor_eligibility_verifying_title), fontWeight = FontWeight.SemiBold)
                            }
                        }
                        ClinicalJurisdictionResolution.UNRESOLVED -> {
                            Button(
                                onClick = { viewModel.loadEligibility() },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .minimumInteractiveComponentSize()
                                    .heightIn(min = 50.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = PrimaryDark, contentColor = Color.White),
                            ) {
                                Text(stringResource(R.string.doctor_eligibility_retry_action), fontWeight = FontWeight.Bold)
                            }
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
            // 1. Regulatory Verification Status Banner (fail-closed)
            DoctorRegulatoryBanner(
                eligibility = uiState.doctorEligibility,
                isLoadingEligibility = uiState.isLoadingEligibility,
                onRetryEligibility = { viewModel.loadEligibility() },
            )

            // 2. Patient Selector Card (Existing patients + 3-field DNI/CPF/WhatsApp eventual lookup)
            EventualPatientDniSelectorCard(
                selectedPatient = uiState.selectedPatient,
                eligiblePatients = uiState.eligiblePatients,
                isLoadingPatients = uiState.isLoadingPatients,
                searchQuery = patientSearchQuery,
                onSearchQueryChange = { patientSearchQuery = it },
                expanded = expandedPatientDropdown,
                onExpandedChange = { expandedPatientDropdown = it },
                onSelectPatient = {
                    viewModel.onSelectPatient(it)
                    expandedPatientDropdown = false
                },
                isRegisteringDni = uiState.isRegisteringDni,
                dniLookupError = uiState.dniLookupError,
                needsManualName = uiState.needsManualName,
                onLookupByDni = { dni, gender, contact, manualName ->
                    viewModel.registerEventualPatientByDni(dni, gender, contact, manualName)
                },
            )

            if (isBrazil) {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = PrimaryContainer.copy(alpha = 0.45f)),
                    border = BorderStroke(1.dp, PrimaryDark.copy(alpha = 0.3f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.HealthAndSafety,
                                contentDescription = null,
                                tint = PrimaryDark,
                                modifier = Modifier.size(20.dp),
                            )
                            Text(
                                text = stringResource(R.string.cert_create_br_icp_card_title),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                            )
                        }
                        Text(
                            text = stringResource(R.string.cert_create_br_icp_card_body),
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                    }
                }
            } else if (isArgentina) {
                // 3. Certificate Type Selector
                CertificateTypeSelectorSection(
                    selectedType = uiState.certificateType,
                    onSelectType = { viewModel.onSelectType(it) }
                )

                // 4. Days of Rest & Period (if applicable)
                DaysOfRestSection(
                    certificateType = uiState.certificateType,
                    daysOfRest = uiState.daysOfRest,
                    restHours = uiState.restHours,
                    restPeriodUnit = uiState.restPeriodUnit,
                    startDate = uiState.startDate,
                    endDate = uiState.endDate,
                    onRestPeriodUnitChange = { viewModel.onRestPeriodUnitChange(it) },
                    onDaysChange = { viewModel.onDaysOfRestChange(it) },
                    onHoursChange = { viewModel.onRestHoursChange(it) },
                    onStartDateChange = { viewModel.onStartDateChange(it) }
                )

                // 5. Clinical Diagnosis & Secreto Médico Toggle
                DiagnosisAndPrivacySection(
                    diagnosis = uiState.diagnosis,
                    cid10Code = uiState.diagnosisCode.orEmpty(),
                    showCid10Field = false,
                    hideDiagnosis = uiState.hideDiagnosis,
                    isDiagnosisError = uiState.isDiagnosisValidationError,
                    diagnosisFocusRequester = diagnosisFocusRequester,
                    jurisdiction = com.autamedica.android.domain.model.resolveRegulatoryJurisdiction(
                        countryCode = uiState.doctorEligibility?.countryCode,
                        doctorLicense = uiState.doctorEligibility?.doctorLicense
                    ),
                    onDiagnosisChange = { viewModel.onDiagnosisChange(it) },
                    onCid10CodeChange = { viewModel.onDiagnosisCodeChange(it) },
                    onToggleHide = { viewModel.onToggleHideDiagnosis(it) }
                )

                // 6. Clinical Observations
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = AuSurface,
                    border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.35f)),
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
                                focusedBorderColor = PrimaryDark,
                                unfocusedBorderColor = AuInputBorder,
                                focusedLabelColor = PrimaryDark,
                                unfocusedLabelColor = AuTextSecondary,
                                unfocusedPlaceholderColor = AuTextSecondary,
                            )
                        )
                    }
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
                    tint = AuSuccessText,
                    modifier = Modifier.size(48.dp)
                )
            },
            title = {
                Text(
                    text = stringResource(
                        if (created.isActive) R.string.cert_success_dialog_title_signed
                        else R.string.cert_success_dialog_title
                    ),
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
                        text = stringResource(
                            if (created.isActive) R.string.cert_success_dialog_body_signed
                            else R.string.cert_success_dialog_body
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary
                    )

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = AuSurfaceHover,
                        border = BorderStroke(1.dp, PrimaryDark.copy(alpha = 0.3f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = stringResource(
                                    if (created.isActive) R.string.cert_success_cuir_header_signed
                                    else R.string.cert_success_cuir_header
                                ),
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextSecondary,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = created.cuir,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = PrimaryDark
                            )
                            TextButton(
                                onClick = {
                                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                    clipboard.setPrimaryClip(ClipData.newPlainText("CUIR", created.cuir))
                                    Toast.makeText(context, context.getString(R.string.cert_toast_cuir_copied), Toast.LENGTH_SHORT).show()
                                },
                                modifier = Modifier.minimumInteractiveComponentSize(),
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp), tint = PrimaryDark)
                                    Text(
                                        text = stringResource(R.string.clinical_ops_copy),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = PrimaryDark,
                                        maxLines = 1,
                                        softWrap = false,
                                    )
                                }
                            }
                        }
                    }

                    if (created.isActive) {
                        ShareDocumentToPatientButton(
                            patient = uiState.selectedPatient,
                            documentTitle = stringResource(R.string.cert_share_doc_title),
                            cuir = created.cuir,
                            context = context,
                        )
                    }

                    // QR Preview (only when non-empty verification content exists)
                    if (created.effectiveQrContent.isNotBlank()) {
                        QrCodeView(
                            content = created.effectiveQrContent,
                            modifier = Modifier.size(140.dp),
                            contentDescription = stringResource(R.string.cert_qr_validation_content_desc),
                        )
                    }

                    Text(
                        text = stringResource(
                            if (created.isActive) R.string.cert_success_dialog_footer_signed
                            else R.string.cert_success_dialog_footer
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.clearCreatedCertificate()
                        onBack()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .minimumInteractiveComponentSize()
                        .heightIn(min = 48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryDark, contentColor = Color.White)
                ) {
                    Text(
                        stringResource(
                            if (created.isActive) R.string.cert_success_back_signed
                            else R.string.cert_success_back_to_certificates
                        )
                    )
                }
            }
        )
    }

    uiState.memedSession?.let { memedSession ->
        MemedPrescriberWebView(
            exchangeUrl = memedSession.exchangeUrl,
            onRetryHandoff = viewModel::retryMemedHandoff,
            titleRes = R.string.cert_create_memed_title,
            onClose = { viewModel.onMemedClosed() },
        )
    }
}

@Composable
private fun DoctorRegulatoryBanner(
    eligibility: DoctorEligibility?,
    isLoadingEligibility: Boolean = false,
    onRetryEligibility: (() -> Unit)? = null,
) {
    if (isLoadingEligibility) {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = PrimaryContainer,
            border = BorderStroke(1.dp, PrimaryDark.copy(alpha = 0.35f)),
            modifier = Modifier
                .fillMaxWidth()
                .semantics { liveRegion = LiveRegionMode.Polite },
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = PrimaryDark,
                    strokeWidth = 2.dp,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.doctor_eligibility_verifying_title),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = PrimaryDark,
                    )
                    Text(
                        text = stringResource(R.string.doctor_eligibility_verifying_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }
            }
        }
        return
    }

    if (eligibility == null) {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = ErrorContainer,
            border = BorderStroke(1.dp, AuDangerText.copy(alpha = 0.35f)),
            modifier = Modifier
                .fillMaxWidth()
                .semantics { liveRegion = LiveRegionMode.Assertive },
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = null,
                        tint = AuDangerText,
                        modifier = Modifier.size(20.dp),
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.doctor_eligibility_unresolved_title),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuDangerText,
                        )
                        Text(
                            text = stringResource(R.string.doctor_eligibility_unresolved_subtitle),
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                    }
                }
                if (onRetryEligibility != null) {
                    OutlinedButton(
                        onClick = onRetryEligibility,
                        modifier = Modifier
                            .minimumInteractiveComponentSize()
                            .heightIn(min = 48.dp),
                        border = BorderStroke(1.dp, AuDangerText),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = AuDangerText),
                    ) {
                        Text(
                            text = stringResource(R.string.doctor_eligibility_retry_action),
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
        return
    }

    val isEligible = eligibility.isEligible
    val license = eligibility.doctorLicense ?: stringResource(R.string.cert_reg_registered)
    val jurisdiction = com.autamedica.android.domain.model.resolveRegulatoryJurisdiction(
        countryCode = eligibility.countryCode,
        doctorLicense = eligibility.doctorLicense,
    )

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (isEligible) SuccessContainer else ErrorContainer,
        border = BorderStroke(1.dp, if (isEligible) AuSuccessText.copy(alpha = 0.35f) else AuDangerText.copy(alpha = 0.35f)),
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
                tint = if (isEligible) AuSuccessText else AuDangerText,
                modifier = Modifier.size(20.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (isEligible) stringResource(R.string.cert_reg_active_title) else stringResource(R.string.cert_reg_pending_title),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (isEligible) AuSuccessText else AuDangerText,
                )
                Text(
                    text = if (isEligible) {
                        stringResource(R.string.cert_reg_license_active, license)
                    } else {
                        eligibility.reason ?: stringResource(
                            com.autamedica.android.domain.model.RegulatoryJurisdictionCopy
                                .certificateLicenseRequiredRes(jurisdiction)
                        )
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CertificateTypeSelectorSection(
    selectedType: CertificateType,
    onSelectType: (CertificateType) -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.35f)),
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
                        .background(PrimaryContainer, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Outlined.Description, contentDescription = null, tint = PrimaryDark, modifier = Modifier.size(18.dp))
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
                        color = AuTextSecondary
                    )
                }
            }

            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CertificateType.entries.forEach { type ->
                    val isSelected = selectedType == type
                    FilterChip(
                        selected = isSelected,
                        onClick = { onSelectType(type) },
                        modifier = Modifier
                            .minimumInteractiveComponentSize()
                            .semantics {
                                // Expose clear radio-button semantics without breaking Material3 FilterChip state
                            },
                        label = {
                            Text(
                                getCertificateTypeDisplayName(type),
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            )
                        },
                        leadingIcon = if (isSelected) {
                            { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                        } else null,
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PrimaryDark,
                            selectedLabelColor = Color.White,
                            selectedLeadingIconColor = Color.White,
                        )
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DaysOfRestSection(
    certificateType: CertificateType,
    daysOfRest: Int,
    restHours: Int,
    restPeriodUnit: String,
    startDate: String,
    endDate: String?,
    onRestPeriodUnitChange: (String) -> Unit,
    onDaysChange: (Int) -> Unit,
    onHoursChange: (Int) -> Unit,
    onStartDateChange: (String) -> Unit,
) {
    val presetDays = listOf(1, 2, 3, 5, 7, 14, 30)
    val presetHours = listOf(1, 2, 4, 6, 8, 12, 24)

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.35f)),
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

            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = restPeriodUnit == "days",
                    onClick = { onRestPeriodUnitChange("days") },
                    modifier = Modifier.minimumInteractiveComponentSize(),
                    label = { Text(stringResource(R.string.cert_rest_unit_days)) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = PrimaryDark,
                        selectedLabelColor = Color.White,
                    )
                )
                FilterChip(
                    selected = restPeriodUnit == "hours",
                    onClick = { onRestPeriodUnitChange("hours") },
                    modifier = Modifier.minimumInteractiveComponentSize(),
                    label = { Text(stringResource(R.string.cert_rest_unit_hours)) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = PrimaryDark,
                        selectedLabelColor = Color.White,
                    )
                )
                FilterChip(
                    selected = restPeriodUnit == "none",
                    onClick = { onRestPeriodUnitChange("none") },
                    modifier = Modifier.minimumInteractiveComponentSize(),
                    label = { Text(stringResource(R.string.cert_rest_unit_none)) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = PrimaryDark,
                        selectedLabelColor = Color.White,
                    )
                )
            }

            when (restPeriodUnit) {
                "days" -> FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    presetDays.forEach { days ->
                        val chipText = when (days) {
                            1 -> stringResource(R.string.cert_rest_24h)
                            2 -> stringResource(R.string.cert_rest_48h)
                            else -> stringResource(R.string.cert_rest_days_format, days)
                        }
                        FilterChip(
                            selected = daysOfRest == days,
                            onClick = { onDaysChange(days) },
                            modifier = Modifier.minimumInteractiveComponentSize(),
                            label = { Text(chipText) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PrimaryDark,
                                selectedLabelColor = Color.White,
                            )
                        )
                    }
                }
                "hours" -> FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    presetHours.forEach { hours ->
                        FilterChip(
                            selected = restHours == hours,
                            onClick = { onHoursChange(hours) },
                            modifier = Modifier.minimumInteractiveComponentSize(),
                            label = { Text(stringResource(R.string.cert_rest_hours_format, hours)) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PrimaryDark,
                                selectedLabelColor = Color.White,
                            )
                        )
                    }
                }
            }

            Surface(
                shape = RoundedCornerShape(12.dp),
                color = AuSurfaceHover,
                border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.35f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    if (restPeriodUnit == "days" || restPeriodUnit == "hours") {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                stringResource(R.string.cert_rest_start_date_label),
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary
                            )
                            Text(
                                startDate,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary
                            )
                        }
                    }
                    when (restPeriodUnit) {
                        "days" -> if (daysOfRest > 0 && endDate != null) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    stringResource(R.string.cert_rest_end_date_label),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = AuTextSecondary
                                )
                                Text(
                                    endDate,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.Bold,
                                    color = AuSuccessText
                                )
                            }
                        }
                        "hours" -> Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                stringResource(R.string.cert_rest_unit_hours),
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary
                            )
                            Text(
                                stringResource(R.string.cert_rest_hours_format, restHours),
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Bold,
                                color = AuSuccessText
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DiagnosisAndPrivacySection(
    diagnosis: String,
    cid10Code: String,
    showCid10Field: Boolean,
    hideDiagnosis: Boolean,
    isDiagnosisError: Boolean = false,
    diagnosisFocusRequester: FocusRequester = remember { FocusRequester() },
    onDiagnosisChange: (String) -> Unit,
    onCid10CodeChange: (String) -> Unit,
    onToggleHide: (Boolean) -> Unit,
    jurisdiction: com.autamedica.android.domain.model.RegulatoryJurisdiction =
        com.autamedica.android.domain.model.RegulatoryJurisdiction.GENERIC,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.35f)),
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
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                COMMON_CERT_DIAGNOSES_RES.take(4).forEach { resId ->
                    val diagText = stringResource(resId)
                    val isSelected = diagnosis == diagText
                    FilterChip(
                        selected = isSelected,
                        onClick = { onDiagnosisChange(diagText) },
                        modifier = Modifier.minimumInteractiveComponentSize(),
                        label = { Text(diagText, style = MaterialTheme.typography.labelSmall) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PrimaryDark,
                            selectedLabelColor = Color.White,
                        )
                    )
                }
            }

            OutlinedTextField(
                value = diagnosis,
                onValueChange = onDiagnosisChange,
                placeholder = { Text(stringResource(R.string.cert_diag_placeholder)) },
                isError = isDiagnosisError,
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(diagnosisFocusRequester),
                minLines = 2,
                maxLines = 4,
                shape = RoundedCornerShape(10.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PrimaryDark,
                    unfocusedBorderColor = AuInputBorder,
                    errorBorderColor = AuDangerText,
                    unfocusedPlaceholderColor = AuTextSecondary,
                )
            )

            if (showCid10Field) {
                OutlinedTextField(
                    value = cid10Code,
                    onValueChange = onCid10CodeChange,
                    label = { Text(stringResource(R.string.cert_cid10_optional_label)) },
                    placeholder = { Text(stringResource(R.string.cert_cid10_optional_placeholder)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    maxLines = 1,
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PrimaryDark,
                        unfocusedBorderColor = AuInputBorder,
                        focusedLabelColor = PrimaryDark,
                        unfocusedLabelColor = AuTextSecondary,
                        unfocusedPlaceholderColor = AuTextSecondary,
                    )
                )
            }

            // Secreto Médico Switch Card
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = if (hideDiagnosis) SuccessContainer else AuSurfaceHover,
                border = BorderStroke(
                    1.dp,
                    if (hideDiagnosis) AuSuccessText.copy(alpha = 0.45f) else AuInputBorder.copy(alpha = 0.35f),
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .selectable(
                        selected = hideDiagnosis,
                        role = Role.Switch,
                        onClick = { onToggleHide(!hideDiagnosis) },
                    )
                    .minimumInteractiveComponentSize(),
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Lock,
                        contentDescription = null,
                        tint = if (hideDiagnosis) AuSuccessText else AuTextSecondary,
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
                            text = stringResource(
                                com.autamedica.android.domain.model.RegulatoryJurisdictionCopy.certificateHideDiagnosisSubtitleRes(
                                    jurisdiction
                                )
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextSecondary
                        )
                    }
                    Switch(
                        checked = hideDiagnosis,
                        onCheckedChange = null,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = AuSuccessText,
                        )
                    )
                }
            }
        }
    }
}
