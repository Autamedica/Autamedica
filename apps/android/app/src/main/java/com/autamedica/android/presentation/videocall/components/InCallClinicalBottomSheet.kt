package com.autamedica.android.presentation.videocall.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import com.autamedica.android.R
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.CertificateType
import com.autamedica.android.domain.model.InCallDocumentPolicy
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDangerText
import com.autamedica.android.presentation.theme.AuInputBorder
import com.autamedica.android.presentation.theme.AuSuccessText
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PrimaryContainer
import com.autamedica.android.presentation.theme.PrimaryDark
import com.autamedica.android.presentation.theme.SuccessContainer

enum class InCallClinicalMode {
    PRESCRIPTION,
    CERTIFICATE,
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun InCallClinicalBottomSheet(
    initialMode: InCallClinicalMode = InCallClinicalMode.PRESCRIPTION,
    patientName: String,
    chiefComplaint: String? = null,
    countryCode: String? = null,
    patientCareCountryCode: String? = null,
    patientLinked: Boolean = false,
    memedEncounterAvailable: Boolean = patientLinked,
    isSubmitting: Boolean,
    onOpenMemed: (() -> Unit)? = null,
    memedLaunchError: String? = null,
    memedLaunchNotice: String? = null,
    isVerifyingMemedPrescription: Boolean = false,
    onIssuePrescription: (medicationName: String, dosage: String, instructions: String, diagnosis: String, onResult: (Boolean, String?) -> Unit) -> Unit,
    onIssueCertificate: (type: CertificateType, daysOfRest: Int, diagnosis: String, hideDiagnosis: Boolean, onResult: (Boolean, String?) -> Unit) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var currentMode by remember { mutableStateOf(initialMode) }

    // Prescription form state
    var medicationName by remember { mutableStateOf("") }
    var dosage by remember { mutableStateOf("") }
    var prescriptionDiagnosis by remember { mutableStateOf("") }
    var instructions by remember { mutableStateOf("") }

    // Certificate form state
    var selectedCertType by remember { mutableStateOf(CertificateType.REPOSO_LABORAL) }
    var daysOfRest by remember { mutableIntStateOf(2) }
    var diagnosis by remember { mutableStateOf(chiefComplaint.orEmpty()) }
    var hideDiagnosis by remember(countryCode) { mutableStateOf(countryCode == "BR") }

    // Feedback state
    var successCuir by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val medicationFocusRequester = remember { FocusRequester() }
    val prescriptionDiagnosisFocusRequester = remember { FocusRequester() }
    val certDiagnosisFocusRequester = remember { FocusRequester() }
    val successFocusRequester = remember { FocusRequester() }
    val validationMedicationDiagnosisMessage = stringResource(R.string.in_call_validation_medication_diagnosis)
    val prescriptionIssueErrorMessage = stringResource(R.string.in_call_prescription_error)
    val certificateIssueErrorMessage = stringResource(R.string.in_call_certificate_error)
    val countriesMatch = InCallDocumentPolicy.countriesMatchForDocumentIssuance(countryCode, patientCareCountryCode)

    LaunchedEffect(successCuir) {
        if (successCuir != null) {
            runCatching { successFocusRequester.requestFocus() }
        }
    }

    ModalBottomSheet(
        onDismissRequest = {
            if (!isSubmitting) onDismiss()
        },
        sheetState = sheetState,
        containerColor = AuSurface,
        dragHandle = { BottomSheetDefaults.DragHandle(color = AuBorder) },
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.92f)
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Header: Title & Close
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = PrimaryContainer,
                        modifier = Modifier.size(38.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = if (currentMode == InCallClinicalMode.PRESCRIPTION) {
                                    Icons.Outlined.Medication
                                } else {
                                    Icons.Outlined.Description
                                },
                                contentDescription = null,
                                tint = PrimaryDark,
                                modifier = Modifier.size(22.dp),
                            )
                        }
                    }
                    Column {
                        Text(
                            text = stringResource(R.string.in_call_clinical_ops_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .background(AuSuccessText, CircleShape)
                            )
                            Text(
                                text = stringResource(R.string.in_call_clinical_ops_status),
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary,
                            )
                        }
                    }
                }
                IconButton(
                    onClick = onDismiss,
                    enabled = !isSubmitting,
                    modifier = Modifier.minimumInteractiveComponentSize(),
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = stringResource(R.string.in_call_close),
                        tint = AuTextSecondary,
                    )
                }
            }

            // Patient Banner
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = AuBackground,
                border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.35f)),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Person,
                        contentDescription = null,
                        tint = PrimaryDark,
                        modifier = Modifier.size(20.dp),
                    )
                    Column {
                        Text(
                            text = patientName.ifBlank { stringResource(R.string.in_call_patient_fallback) },
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = AuTextPrimary,
                        )
                        if (!chiefComplaint.isNullOrBlank()) {
                            Text(
                                text = stringResource(R.string.in_call_complaint_prefix, chiefComplaint),
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }

            if (!patientLinked) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { liveRegion = LiveRegionMode.Assertive },
                    color = ErrorContainer,
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, AuDangerText.copy(alpha = 0.35f)),
                ) {
                    Text(
                        stringResource(R.string.in_call_patient_link_required),
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuDangerText,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            if (patientLinked && !countriesMatch) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { liveRegion = LiveRegionMode.Assertive },
                    color = ErrorContainer,
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, AuDangerText.copy(alpha = 0.35f)),
                ) {
                    Text(
                        stringResource(R.string.in_call_country_mismatch),
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuDangerText,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            // Mode Selector Tabs (Receta vs Certificado)
            TabRow(
                selectedTabIndex = if (currentMode == InCallClinicalMode.PRESCRIPTION) 0 else 1,
                containerColor = AuBackground,
                contentColor = PrimaryDark,
                indicator = { tabPositions ->
                    TabRowDefaults.SecondaryIndicator(
                        modifier = Modifier.tabIndicatorOffset(
                            tabPositions[if (currentMode == InCallClinicalMode.PRESCRIPTION) 0 else 1]
                        ),
                        color = PrimaryDark,
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .background(AuBackground, RoundedCornerShape(12.dp)),
            ) {
                Tab(
                    selected = currentMode == InCallClinicalMode.PRESCRIPTION,
                    onClick = {
                        currentMode = InCallClinicalMode.PRESCRIPTION
                        errorMessage = null
                        successCuir = null
                    },
                    text = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(Icons.Outlined.Medication, contentDescription = null, modifier = Modifier.size(16.dp))
                            Text(stringResource(R.string.in_call_tab_prescription), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        }
                    },
                    selectedContentColor = PrimaryDark,
                    unselectedContentColor = AuTextSecondary,
                )
                Tab(
                    selected = currentMode == InCallClinicalMode.CERTIFICATE,
                    onClick = {
                        currentMode = InCallClinicalMode.CERTIFICATE
                        errorMessage = null
                        successCuir = null
                    },
                    text = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(Icons.Outlined.Description, contentDescription = null, modifier = Modifier.size(16.dp))
                            Text(stringResource(R.string.in_call_tab_certificate), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        }
                    },
                    selectedContentColor = PrimaryDark,
                    unselectedContentColor = AuTextSecondary,
                )
            }

            // Success feedback
            if (successCuir != null) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(successFocusRequester)
                        .focusable()
                        .semantics { liveRegion = LiveRegionMode.Polite },
                    shape = RoundedCornerShape(12.dp),
                    color = SuccessContainer,
                    border = BorderStroke(1.dp, AuSuccessText.copy(alpha = 0.35f)),
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
                                imageVector = Icons.Outlined.CheckCircle,
                                contentDescription = null,
                                tint = AuSuccessText,
                                modifier = Modifier.size(22.dp),
                            )
                            Text(
                                text = if (currentMode == InCallClinicalMode.CERTIFICATE) stringResource(R.string.in_call_certificate_draft_saved) else stringResource(R.string.in_call_prescription_issued),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = AuSuccessText,
                            )
                        }
                        Text(
                            text = stringResource(R.string.in_call_document_reference, successCuir.orEmpty()),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = stringResource(R.string.in_call_chat_recorded),
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Button(
                                onClick = onDismiss,
                                modifier = Modifier
                                    .weight(1f)
                                    .minimumInteractiveComponentSize()
                                    .heightIn(min = 48.dp),
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = PrimaryDark,
                                    contentColor = Color.White,
                                ),
                            ) {
                                Text(stringResource(R.string.in_call_back_to_call))
                            }
                            OutlinedButton(
                                onClick = {
                                    successCuir = null
                                    medicationName = ""
                                    dosage = ""
                                    instructions = ""
                                },
                                modifier = Modifier
                                    .weight(1f)
                                    .minimumInteractiveComponentSize()
                                    .heightIn(min = 48.dp),
                                shape = RoundedCornerShape(10.dp),
                                border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.5f)),
                            ) {
                                Text(stringResource(R.string.in_call_prepare_another), color = AuTextPrimary)
                            }
                        }
                    }
                }
            }

            // Error feedback
            if (errorMessage != null) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { liveRegion = LiveRegionMode.Assertive },
                    shape = RoundedCornerShape(12.dp),
                    color = ErrorContainer,
                    border = BorderStroke(1.dp, AuDangerText.copy(alpha = 0.35f)),
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.ErrorOutline,
                            contentDescription = null,
                            tint = AuDangerText,
                            modifier = Modifier.size(20.dp),
                        )
                        Text(
                            text = errorMessage.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = AuDangerText,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            // Form Content according to mode
            if (successCuir == null) {
                when (currentMode) {
                    InCallClinicalMode.PRESCRIPTION -> {
                        if (countryCode == "BR") {
                            Text(
                                text = stringResource(R.string.in_call_memed_rx_title),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                            )
                            Text(
                                text = stringResource(R.string.in_call_memed_rx_description),
                                style = MaterialTheme.typography.bodyMedium,
                                color = AuTextSecondary,
                            )
                            if (memedLaunchError != null) {
                                Surface(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .semantics { liveRegion = LiveRegionMode.Assertive },
                                    shape = RoundedCornerShape(10.dp),
                                    color = ErrorContainer,
                                    border = BorderStroke(1.dp, AuDangerText.copy(alpha = 0.35f)),
                                ) {
                                    Text(
                                        text = memedLaunchError,
                                        color = AuDangerText,
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.padding(12.dp),
                                    )
                                }
                            }
                            if (memedLaunchNotice != null) {
                                Surface(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .semantics { liveRegion = LiveRegionMode.Polite },
                                    shape = RoundedCornerShape(10.dp),
                                    color = PrimaryContainer,
                                    border = BorderStroke(1.dp, PrimaryDark.copy(alpha = 0.35f)),
                                ) {
                                    Text(
                                        text = memedLaunchNotice,
                                        color = PrimaryDark,
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.padding(12.dp),
                                    )
                                }
                            }
                            Button(
                                onClick = { onOpenMemed?.invoke() },
                                enabled = onOpenMemed != null && !isSubmitting && memedEncounterAvailable && countriesMatch,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .minimumInteractiveComponentSize()
                                    .heightIn(min = 50.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = PrimaryDark,
                                    contentColor = Color.White,
                                ),
                            ) {
                                if (isSubmitting || isVerifyingMemedPrescription) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = Color.White,
                                        strokeWidth = 2.dp,
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                }
                                Text(
                                    if (isSubmitting || isVerifyingMemedPrescription) {
                                        stringResource(R.string.in_call_memed_rx_opening)
                                    } else {
                                        stringResource(R.string.in_call_memed_rx_open_action)
                                    },
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        } else {
                        // Medicamento
                        OutlinedTextField(
                            value = medicationName,
                            onValueChange = { medicationName = it },
                            label = { Text(stringResource(R.string.in_call_medication_label)) },
                            placeholder = { Text(stringResource(R.string.in_call_medication_placeholder)) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .focusRequester(medicationFocusRequester),
                            singleLine = true,
                            enabled = !isSubmitting,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = PrimaryDark,
                                unfocusedBorderColor = AuInputBorder,
                                focusedLabelColor = PrimaryDark,
                                unfocusedLabelColor = AuTextSecondary,
                                unfocusedPlaceholderColor = AuTextSecondary,
                                unfocusedContainerColor = AuBackground,
                                focusedContainerColor = AuBackground,
                            ),
                            shape = RoundedCornerShape(10.dp),
                        )

                        // Dosis / Frecuencia
                        OutlinedTextField(
                            value = dosage,
                            onValueChange = { dosage = it },
                            label = { Text(stringResource(R.string.in_call_dosage_label)) },
                            placeholder = { Text(stringResource(R.string.in_call_dosage_placeholder)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            enabled = !isSubmitting,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = PrimaryDark,
                                unfocusedBorderColor = AuInputBorder,
                                focusedLabelColor = PrimaryDark,
                                unfocusedLabelColor = AuTextSecondary,
                                unfocusedPlaceholderColor = AuTextSecondary,
                                unfocusedContainerColor = AuBackground,
                                focusedContainerColor = AuBackground,
                            ),
                            shape = RoundedCornerShape(10.dp),
                        )

                        // In-call clinical diagnosis must be explicitly entered by the physician.
                        OutlinedTextField(
                            value = prescriptionDiagnosis,
                            onValueChange = { prescriptionDiagnosis = it },
                            label = { Text(stringResource(R.string.in_call_diagnosis_required)) },
                            placeholder = { Text(stringResource(R.string.in_call_diagnosis_placeholder)) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .focusRequester(prescriptionDiagnosisFocusRequester),
                            singleLine = true,
                            enabled = !isSubmitting,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = PrimaryDark,
                                unfocusedBorderColor = AuInputBorder,
                                focusedLabelColor = PrimaryDark,
                                unfocusedLabelColor = AuTextSecondary,
                                unfocusedPlaceholderColor = AuTextSecondary,
                                unfocusedContainerColor = AuBackground,
                                focusedContainerColor = AuBackground,
                            ),
                            shape = RoundedCornerShape(10.dp),
                        )

                        // Instrucciones
                        OutlinedTextField(
                            value = instructions,
                            onValueChange = { instructions = it },
                            label = { Text(stringResource(R.string.in_call_instructions_label)) },
                            placeholder = { Text(stringResource(R.string.in_call_instructions_placeholder)) },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 3,
                            maxLines = 5,
                            enabled = !isSubmitting,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = PrimaryDark,
                                unfocusedBorderColor = AuInputBorder,
                                focusedLabelColor = PrimaryDark,
                                unfocusedLabelColor = AuTextSecondary,
                                unfocusedPlaceholderColor = AuTextSecondary,
                                unfocusedContainerColor = AuBackground,
                                focusedContainerColor = AuBackground,
                            ),
                            shape = RoundedCornerShape(10.dp),
                        )

                        if (countryCode !in setOf("AR", "BR")) {
                            Text(
                                text = stringResource(R.string.in_call_country_unavailable),
                                style = MaterialTheme.typography.bodySmall,
                                color = AuDangerText,
                                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                            )
                        }

                        // Registrar receta solo en Argentina, por emisor autorizado.
                        Button(
                            onClick = {
                                if (medicationName.isBlank()) {
                                    errorMessage = validationMedicationDiagnosisMessage
                                    runCatching { medicationFocusRequester.requestFocus() }
                                    return@Button
                                }
                                if (prescriptionDiagnosis.isBlank()) {
                                    errorMessage = validationMedicationDiagnosisMessage
                                    runCatching { prescriptionDiagnosisFocusRequester.requestFocus() }
                                    return@Button
                                }
                                errorMessage = null
                                onIssuePrescription(medicationName, dosage, instructions, prescriptionDiagnosis) { ok, result ->
                                    if (ok) {
                                        successCuir = result
                                    } else {
                                        errorMessage = result ?: prescriptionIssueErrorMessage
                                    }
                                }
                            },
                            enabled = !isSubmitting && medicationName.isNotBlank() &&
                                prescriptionDiagnosis.isNotBlank() && countryCode in setOf("AR", "BR") && patientLinked && countriesMatch,
                            modifier = Modifier
                                .fillMaxWidth()
                                .minimumInteractiveComponentSize()
                                .heightIn(min = 50.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = PrimaryDark,
                                contentColor = Color.White,
                            ),
                        ) {
                            if (isSubmitting) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp,
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(stringResource(R.string.in_call_prescription_issuing), fontSize = 14.sp)
                            } else {
                                Icon(Icons.Outlined.Medication, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(stringResource(R.string.in_call_prescription_submit), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            }
                        }
                        }
                    }

                    InCallClinicalMode.CERTIFICATE -> {
                        if (countryCode == "BR") {
                            Text(
                                text = stringResource(R.string.in_call_memed_cert_title),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                            )
                            Text(
                                text = stringResource(R.string.in_call_memed_cert_description),
                                style = MaterialTheme.typography.bodyMedium,
                                color = AuTextSecondary,
                            )
                            if (memedLaunchError != null) {
                                Surface(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .semantics { liveRegion = LiveRegionMode.Assertive },
                                    shape = RoundedCornerShape(10.dp),
                                    color = ErrorContainer,
                                    border = BorderStroke(1.dp, AuDangerText.copy(alpha = 0.35f)),
                                ) {
                                    Text(
                                        text = memedLaunchError,
                                        color = AuDangerText,
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.padding(12.dp),
                                    )
                                }
                            }
                            if (memedLaunchNotice != null) {
                                Surface(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .semantics { liveRegion = LiveRegionMode.Polite },
                                    shape = RoundedCornerShape(10.dp),
                                    color = PrimaryContainer,
                                    border = BorderStroke(1.dp, PrimaryDark.copy(alpha = 0.35f)),
                                ) {
                                    Text(
                                        text = memedLaunchNotice,
                                        color = PrimaryDark,
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.padding(12.dp),
                                    )
                                }
                            }
                            Button(
                                onClick = { onOpenMemed?.invoke() },
                                enabled = onOpenMemed != null && !isSubmitting && memedEncounterAvailable && countriesMatch,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .minimumInteractiveComponentSize()
                                    .heightIn(min = 50.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = PrimaryDark,
                                    contentColor = Color.White,
                                ),
                            ) {
                                if (isSubmitting || isVerifyingMemedPrescription) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = Color.White,
                                        strokeWidth = 2.dp,
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                }
                                Text(
                                    if (isSubmitting || isVerifyingMemedPrescription) {
                                        stringResource(R.string.in_call_memed_cert_opening)
                                    } else {
                                        stringResource(R.string.in_call_memed_cert_open_action)
                                    },
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        } else {
                        // Tipo de certificado (Chips)
                        Text(
                            text = stringResource(R.string.in_call_certificate_type),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = AuTextPrimary,
                        )
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            listOf(
                                CertificateType.REPOSO_LABORAL,
                                CertificateType.REPOSO_ESCOLAR,
                                CertificateType.APTITUD_FISICA,
                                CertificateType.CONSTANCIA_ATENCION,
                                CertificateType.TRATAMIENTO,
                            ).forEach { type ->
                                val isSelected = selectedCertType == type
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = if (isSelected) PrimaryContainer else AuBackground,
                                    border = BorderStroke(
                                        1.dp,
                                        if (isSelected) PrimaryDark else AuInputBorder.copy(alpha = 0.5f),
                                    ),
                                    modifier = Modifier
                                        .minimumInteractiveComponentSize()
                                        .selectable(
                                            selected = isSelected,
                                            enabled = !isSubmitting,
                                            role = Role.RadioButton,
                                            onClick = { selectedCertType = type },
                                        )
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        if (isSelected) {
                                            Icon(
                                                imageVector = Icons.Default.Check,
                                                contentDescription = null,
                                                tint = PrimaryDark,
                                                modifier = Modifier.size(16.dp),
                                            )
                                        }
                                        val inCallJurisdiction = com.autamedica.android.domain.model.resolveRegulatoryJurisdiction(
                                            countryCode = countryCode,
                                        )
                                        Text(
                                            text = stringResource(
                                                when (type) {
                                                    CertificateType.REPOSO_LABORAL ->
                                                        com.autamedica.android.domain.model.RegulatoryJurisdictionCopy
                                                            .certificateWorkLeaveLabelRes(inCallJurisdiction)
                                                    CertificateType.REPOSO_ESCOLAR -> R.string.cert_type_reposo_escolar
                                                    CertificateType.APTITUD_FISICA -> R.string.cert_type_aptitud_fisica
                                                    CertificateType.CONSTANCIA_ATENCION -> R.string.cert_type_constancia_atencion
                                                    CertificateType.TRATAMIENTO -> R.string.cert_type_tratamiento
                                                    CertificateType.OTRO -> R.string.cert_type_otro
                                                },
                                            ),
                                            style = MaterialTheme.typography.bodySmall,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                            color = if (isSelected) PrimaryDark else AuTextPrimary,
                                        )
                                    }
                                }
                            }
                        }

                        // Días de reposo (Chips rápidos)
                        Text(
                            text = stringResource(R.string.in_call_rest_days),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = AuTextPrimary,
                        )
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            listOf(0, 1, 2, 3, 5, 7, 10, 14).forEach { days ->
                                val isSelected = daysOfRest == days
                                val label = if (days == 0) stringResource(R.string.cert_no_rest)
                                else stringResource(R.string.cert_rest_days_format, days)
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = if (isSelected) PrimaryDark else AuBackground,
                                    border = BorderStroke(1.dp, if (isSelected) PrimaryDark else AuInputBorder.copy(alpha = 0.5f)),
                                    modifier = Modifier
                                        .minimumInteractiveComponentSize()
                                        .selectable(
                                            selected = isSelected,
                                            enabled = !isSubmitting,
                                            role = Role.RadioButton,
                                            onClick = { daysOfRest = days },
                                        )
                                ) {
                                    Text(
                                        text = label,
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                        color = if (isSelected) Color.White else AuTextPrimary,
                                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                    )
                                }
                            }
                        }

                        // Diagnóstico
                        OutlinedTextField(
                            value = diagnosis,
                            onValueChange = { diagnosis = it },
                            label = { Text(stringResource(R.string.in_call_certificate_diagnosis)) },
                            placeholder = { Text(stringResource(R.string.in_call_certificate_diagnosis_placeholder)) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .focusRequester(certDiagnosisFocusRequester),
                            singleLine = true,
                            enabled = !isSubmitting,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = PrimaryDark,
                                unfocusedBorderColor = AuInputBorder,
                                focusedLabelColor = PrimaryDark,
                                unfocusedLabelColor = AuTextSecondary,
                                unfocusedPlaceholderColor = AuTextSecondary,
                                unfocusedContainerColor = AuBackground,
                                focusedContainerColor = AuBackground,
                            ),
                            shape = RoundedCornerShape(10.dp),
                        )

                        // Botón emitir certificado
                        Button(
                            onClick = {
                                errorMessage = null
                                onIssueCertificate(selectedCertType, daysOfRest, diagnosis, hideDiagnosis) { ok, result ->
                                    if (ok) {
                                        successCuir = result
                                    } else {
                                        errorMessage = result ?: certificateIssueErrorMessage
                                        if (diagnosis.isBlank()) {
                                            runCatching { certDiagnosisFocusRequester.requestFocus() }
                                        }
                                    }
                                }
                            },
                            enabled = !isSubmitting && patientLinked && countriesMatch,
                            modifier = Modifier
                                .fillMaxWidth()
                                .minimumInteractiveComponentSize()
                                .heightIn(min = 50.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = PrimaryDark,
                                contentColor = Color.White,
                            ),
                        ) {
                            if (isSubmitting) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp,
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(stringResource(R.string.in_call_certificate_saving), fontSize = 14.sp)
                            } else {
                                Icon(Icons.Outlined.Description, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(stringResource(R.string.in_call_certificate_submit), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            }
                        }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}
