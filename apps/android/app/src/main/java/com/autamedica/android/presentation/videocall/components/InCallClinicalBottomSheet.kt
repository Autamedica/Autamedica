package com.autamedica.android.presentation.videocall.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.material3.Checkbox
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
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.CertificateType
import com.autamedica.android.domain.model.InCallDocumentPolicy
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuBorderHover
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctor

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
    isSubmitting: Boolean,
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
    val countriesMatch = InCallDocumentPolicy.countriesMatchForDocumentIssuance(countryCode, patientCareCountryCode)

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
                        color = PortalDoctor.copy(alpha = 0.15f),
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
                                tint = PortalDoctor,
                                modifier = Modifier.size(22.dp),
                            )
                        }
                    }
                    Column {
                        Text(
                            text = "Utilidad Clínica In-Call",
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
                                    .background(AuSuccess, CircleShape)
                            )
                            Text(
                                text = "Llamada activa • Documentos sujetos a verificación",
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextTertiary,
                            )
                        }
                    }
                }
                IconButton(
                    onClick = onDismiss,
                    enabled = !isSubmitting,
                    modifier = Modifier.size(32.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = stringResource(R.string.in_call_close),
                        tint = AuTextTertiary,
                    )
                }
            }

            // Patient Banner
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = AuBackground,
                border = BorderStroke(1.dp, AuBorder),
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
                        tint = PortalDoctor,
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
                    modifier = Modifier.fillMaxWidth(),
                    color = AuDanger.copy(alpha = 0.10f),
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.25f)),
                ) {
                    Text(
                        stringResource(R.string.in_call_patient_link_required),
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuDanger,
                    )
                }
            }

            if (patientLinked && !countriesMatch) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = AuDanger.copy(alpha = 0.10f),
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.25f)),
                ) {
                    Text(
                        stringResource(R.string.in_call_country_mismatch),
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuDanger,
                    )
                }
            }

            // Mode Selector Tabs (Receta vs Certificado)
            TabRow(
                selectedTabIndex = if (currentMode == InCallClinicalMode.PRESCRIPTION) 0 else 1,
                containerColor = AuBackground,
                contentColor = PortalDoctor,
                indicator = { tabPositions ->
                    TabRowDefaults.SecondaryIndicator(
                        modifier = Modifier.tabIndicatorOffset(
                            tabPositions[if (currentMode == InCallClinicalMode.PRESCRIPTION) 0 else 1]
                        ),
                        color = PortalDoctor,
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
                    selectedContentColor = PortalDoctor,
                    unselectedContentColor = AuTextTertiary,
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
                    selectedContentColor = PortalDoctor,
                    unselectedContentColor = AuTextTertiary,
                )
            }

            // Success feedback
            if (successCuir != null) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = AuSuccess.copy(alpha = 0.12f),
                    border = BorderStroke(1.dp, AuSuccess.copy(alpha = 0.35f)),
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
                                tint = AuSuccess,
                                modifier = Modifier.size(22.dp),
                            )
                            Text(
                                text = if (currentMode == InCallClinicalMode.CERTIFICATE) stringResource(R.string.in_call_certificate_draft_saved) else stringResource(R.string.in_call_prescription_issued),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = AuSuccess,
                            )
                        }
                        Text(
                            text = stringResource(R.string.in_call_document_reference, successCuir.orEmpty()),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = "Registro enviado al chat de la consulta. No constituye constancia de firma digital ni de homologación del proveedor.",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Button(
                                onClick = onDismiss,
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = PortalDoctor,
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
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp),
                                border = BorderStroke(1.dp, AuBorder),
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
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = AuDanger.copy(alpha = 0.1f),
                    border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.3f)),
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.ErrorOutline,
                            contentDescription = null,
                            tint = AuDanger,
                            modifier = Modifier.size(20.dp),
                        )
                        Text(
                            text = errorMessage.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = AuDanger,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            // Form Content according to mode
            if (successCuir == null) {
                when (currentMode) {
                    InCallClinicalMode.PRESCRIPTION -> {
                        // Medicamento
                        OutlinedTextField(
                            value = medicationName,
                            onValueChange = { medicationName = it },
                            label = { Text(stringResource(R.string.in_call_medication_label)) },
                            placeholder = { Text(stringResource(R.string.in_call_medication_placeholder)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            enabled = !isSubmitting,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = PortalDoctor,
                                unfocusedBorderColor = AuBorder,
                                focusedLabelColor = PortalDoctor,
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
                                focusedBorderColor = PortalDoctor,
                                unfocusedBorderColor = AuBorder,
                                focusedLabelColor = PortalDoctor,
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
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            enabled = !isSubmitting,
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
                                focusedBorderColor = PortalDoctor,
                                unfocusedBorderColor = AuBorder,
                                focusedLabelColor = PortalDoctor,
                                unfocusedContainerColor = AuBackground,
                                focusedContainerColor = AuBackground,
                            ),
                            shape = RoundedCornerShape(10.dp),
                        )

                        if (countryCode !in setOf("AR", "BR")) {
                            Text(
                                text = if (countryCode == "BR") stringResource(R.string.in_call_country_unavailable)
                                else stringResource(R.string.in_call_country_unavailable),
                                style = MaterialTheme.typography.bodySmall,
                                color = AuDanger,
                            )
                        }

                        // Registrar receta solo en Argentina, por emisor autorizado.
                        Button(
                            onClick = {
                                if (medicationName.isBlank() || prescriptionDiagnosis.isBlank()) {
                                    errorMessage = stringResource(R.string.in_call_validation_medication_diagnosis)
                                    return@Button
                                }
                                errorMessage = null
                                onIssuePrescription(medicationName, dosage, instructions, prescriptionDiagnosis) { ok, result ->
                                    if (ok) {
                                        successCuir = result
                                    } else {
                                        errorMessage = result ?: stringResource(R.string.in_call_prescription_error)
                                    }
                                }
                            },
                            enabled = !isSubmitting && medicationName.isNotBlank() &&
                                prescriptionDiagnosis.isNotBlank() && countryCode in setOf("AR", "BR") && patientLinked && countriesMatch,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF0284C7),
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

                    InCallClinicalMode.CERTIFICATE -> {
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
                                    color = if (isSelected) PortalDoctor.copy(alpha = 0.15f) else AuBackground,
                                    border = BorderStroke(
                                        1.dp,
                                        if (isSelected) PortalDoctor else AuBorder,
                                    ),
                                    modifier = Modifier.clickable(!isSubmitting) {
                                        selectedCertType = type
                                    }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        if (isSelected) {
                                            Icon(
                                                imageVector = Icons.Default.Check,
                                                contentDescription = null,
                                                tint = PortalDoctor,
                                                modifier = Modifier.size(14.dp),
                                            )
                                        }
                                        Text(
                                            text = type.displayName,
                                            style = MaterialTheme.typography.bodySmall,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                            color = if (isSelected) PortalDoctor else AuTextPrimary,
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
                                val label = if (days == 0) "Sin reposo" else "$days d"
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = if (isSelected) PortalDoctor else AuBackground,
                                    border = BorderStroke(1.dp, if (isSelected) PortalDoctor else AuBorder),
                                    modifier = Modifier.clickable(!isSubmitting) {
                                        daysOfRest = days
                                    }
                                ) {
                                    Text(
                                        text = label,
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                        color = if (isSelected) Color.White else AuTextPrimary,
                                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                                    )
                                }
                            }
                        }

                        if (countryCode == "BR") {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(
                                    checked = hideDiagnosis,
                                    onCheckedChange = { hideDiagnosis = it },
                                    enabled = !isSubmitting,
                                )
                                Text(
                                    text = stringResource(R.string.in_call_hide_diagnosis),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = AuTextPrimary,
                                )
                            }
                        }

                        // Diagnóstico
                        OutlinedTextField(
                            value = diagnosis,
                            onValueChange = { diagnosis = it },
                            label = { Text(stringResource(R.string.in_call_certificate_diagnosis)) },
                            placeholder = { Text(stringResource(R.string.in_call_certificate_diagnosis_placeholder)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            enabled = !isSubmitting,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = PortalDoctor,
                                unfocusedBorderColor = AuBorder,
                                focusedLabelColor = PortalDoctor,
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
                                        errorMessage = result ?: stringResource(R.string.in_call_certificate_error)
                                    }
                                }
                            },
                            enabled = !isSubmitting && patientLinked && countriesMatch,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = PortalDoctor,
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

            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}
