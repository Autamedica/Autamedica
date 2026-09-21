package com.autamedica.android.presentation.doctors.agenda.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.VideoCall
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateDoctorAppointmentBottomSheet(
    selectedDate: LocalDate,
    initialTime: String,
    patients: List<PatientSummary>,
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (
        patientId: String?,
        guestName: String?,
        guestPhone: String?,
        startTime: String,
        endTime: String,
        type: String,
        reason: String?,
    ) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var isGuestMode by remember { mutableStateOf(patients.isEmpty()) }
    var selectedPatientId by remember { mutableStateOf(patients.firstOrNull()?.id.orEmpty()) }
    var guestName by remember { mutableStateOf("") }
    var guestPhone by remember { mutableStateOf("") }

    var timeInput by remember(initialTime) {
        mutableStateOf(if (initialTime.isNotBlank()) initialTime else "09:00")
    }
    var durationMinutes by remember { mutableIntStateOf(30) }
    var selectedType by remember { mutableStateOf("telemedicine") }
    var reasonInput by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }

    val appointmentTypes = listOf(
        Triple("telemedicine", stringResource(R.string.doctor_agenda_create_type_telemedicine), "Videoconsulta"),
        Triple("consultation", stringResource(R.string.doctor_agenda_create_type_presencial), "Consultorio"),
        Triple("follow_up", stringResource(R.string.doctor_agenda_create_type_control), "Seguimiento"),
        Triple("emergency", stringResource(R.string.doctor_agenda_create_type_urgencia), "Prioridad"),
    )

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color.White,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = stringResource(R.string.doctor_agenda_create_title),
                        style = MaterialTheme.typography.labelSmall,
                        color = PortalDoctors,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.2.sp,
                    )
                    Text(
                        text = selectedDate.format(DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", Locale.getDefault())).replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                }

                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = stringResource(R.string.doctor_agenda_create_cd_close),
                        tint = AuTextTertiary,
                    )
                }
            }

            HorizontalDivider(color = Color(0xFFF1F5F9))

            // Patient Selector Mode Toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (!isGuestMode) Color(0xFFE0F2FE) else Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, if (!isGuestMode) PortalDoctors else Color(0xFFE2E8F0)),
                    modifier = Modifier
                        .weight(1f)
                        .clickable { isGuestMode = false },
                ) {
                    Row(
                        modifier = Modifier.padding(vertical = 10.dp, horizontal = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            tint = if (!isGuestMode) PortalDoctors else AuTextTertiary,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = stringResource(R.string.doctor_agenda_create_tab_roster, patients.size),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = if (!isGuestMode) PortalDoctors else AuTextSecondary,
                        )
                    }
                }

                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (isGuestMode) Color(0xFFE0F2FE) else Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, if (isGuestMode) PortalDoctors else Color(0xFFE2E8F0)),
                    modifier = Modifier
                        .weight(1f)
                        .clickable { isGuestMode = true },
                ) {
                    Row(
                        modifier = Modifier.padding(vertical = 10.dp, horizontal = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Default.PersonAdd,
                            contentDescription = null,
                            tint = if (isGuestMode) PortalDoctors else AuTextTertiary,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = stringResource(R.string.doctor_agenda_create_tab_guest),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = if (isGuestMode) PortalDoctors else AuTextSecondary,
                        )
                    }
                }
            }

            // Patient Selection or Inputs
            if (isGuestMode) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = guestName,
                        onValueChange = { guestName = it },
                        label = { Text(stringResource(R.string.doctor_agenda_create_guest_name_label)) },
                        placeholder = { Text(stringResource(R.string.doctor_agenda_create_guest_name_placeholder)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PortalDoctors,
                            unfocusedBorderColor = Color(0xFFCBD5E1),
                        ),
                        shape = RoundedCornerShape(14.dp),
                    )

                    OutlinedTextField(
                        value = guestPhone,
                        onValueChange = { guestPhone = it },
                        label = { Text(stringResource(R.string.doctor_agenda_create_guest_phone_label)) },
                        placeholder = { Text(stringResource(R.string.doctor_agenda_create_guest_phone_placeholder)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PortalDoctors,
                            unfocusedBorderColor = Color(0xFFCBD5E1),
                        ),
                        shape = RoundedCornerShape(14.dp),
                    )
                }
            } else {
                if (patients.isEmpty()) {
                    Text(
                        text = stringResource(R.string.doctor_agenda_create_no_roster_patients),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            text = stringResource(R.string.doctor_agenda_create_select_roster_patient),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextSecondary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        patients.take(6).forEach { patient ->
                            val isSelected = selectedPatientId == patient.id
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (isSelected) Color(0xFFF0FDF4) else Color(0xFFF8FAFC),
                                border = BorderStroke(1.dp, if (isSelected) Color(0xFF86EFAC) else Color(0xFFE2E8F0)),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { selectedPatientId = patient.id },
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text(
                                        text = "${patient.firstName} ${patient.lastName}".trim().ifBlank {
                                            stringResource(R.string.doctor_agenda_create_patient_fallback_id, patient.id.take(6))
                                        },
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                        color = if (isSelected) Color(0xFF15803D) else AuTextPrimary,
                                    )
                                    if (isSelected) {
                                        Text(
                                            text = stringResource(R.string.doctor_agenda_create_selected_badge),
                                            style = MaterialTheme.typography.labelSmall,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF16A34A),
                                            fontSize = 11.sp,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Horario & Duración
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(
                    value = timeInput,
                    onValueChange = { timeInput = it },
                    label = { Text(stringResource(R.string.doctor_agenda_create_start_time_label)) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PortalDoctors,
                        unfocusedBorderColor = Color(0xFFCBD5E1),
                    ),
                    shape = RoundedCornerShape(14.dp),
                )

                // Duration selector (15, 30, 45, 60 min)
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.doctor_agenda_create_duration_label),
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextSecondary,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(bottom = 4.dp),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf(15, 30, 45).forEach { dur ->
                            val isSelected = durationMinutes == dur
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (isSelected) PortalDoctors else Color(0xFFF1F5F9),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(48.dp)
                                    .clickable { durationMinutes = dur },
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        text = "${dur}m",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        color = if (isSelected) Color.White else AuTextSecondary,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Appointment Type Selector
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = stringResource(R.string.doctor_agenda_create_type_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextSecondary,
                    fontWeight = FontWeight.SemiBold,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    appointmentTypes.forEach { (typeKey, typeLabel, _) ->
                        val isSelected = selectedType == typeKey
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = if (isSelected) Color(0xFFE0F2FE) else Color(0xFFF8FAFC),
                            border = BorderStroke(1.dp, if (isSelected) PortalDoctors else Color(0xFFE2E8F0)),
                            modifier = Modifier
                                .weight(1f)
                                .clickable { selectedType = typeKey },
                        ) {
                            Box(
                                modifier = Modifier.padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = typeLabel,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                    color = if (isSelected) PortalDoctors else AuTextTertiary,
                                    fontSize = 11.sp,
                                )
                            }
                        }
                    }
                }
            }

            // Reason for consultation
            OutlinedTextField(
                value = reasonInput,
                onValueChange = { reasonInput = it },
                label = { Text(stringResource(R.string.doctor_agenda_create_reason_label)) },
                placeholder = { Text(stringResource(R.string.doctor_agenda_create_reason_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PortalDoctors,
                    unfocusedBorderColor = Color(0xFFCBD5E1),
                ),
                shape = RoundedCornerShape(14.dp),
                maxLines = 3,
            )

            val invalidTimeError = stringResource(R.string.doctor_agenda_create_error_invalid_time)
            val emptyGuestNameError = stringResource(R.string.doctor_agenda_create_error_empty_guest_name)
            val emptyPatientSelectionError = stringResource(R.string.doctor_agenda_create_error_empty_patient_selection)

            // Validation Error if any
            validationError?.let { err ->
                Text(
                    text = err,
                    color = AuDanger,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            // Submit Button
            Button(
                onClick = {
                    val trimmedTime = timeInput.trim()
                    if (!trimmedTime.matches(Regex("^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$"))) {
                        validationError = invalidTimeError
                        return@Button
                    }

                    if (isGuestMode && guestName.isBlank()) {
                        validationError = emptyGuestNameError
                        return@Button
                    }

                    if (!isGuestMode && selectedPatientId.isBlank()) {
                        validationError = emptyPatientSelectionError
                        return@Button
                    }

                    validationError = null

                    val parts = trimmedTime.split(":")
                    val hour = parts[0].toInt()
                    val minute = parts[1].toInt()

                    val startDt = selectedDate.atTime(hour, minute).atOffset(java.time.ZoneOffset.UTC)
                    val endDt = startDt.plusMinutes(durationMinutes.toLong())

                    val startIso = startDt.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                    val endIso = endDt.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

                    onSubmit(
                        if (!isGuestMode) selectedPatientId else null,
                        if (isGuestMode) guestName.trim() else null,
                        if (isGuestMode) guestPhone.trim() else null,
                        startIso,
                        endIso,
                        selectedType,
                        reasonInput.trim().ifBlank { null },
                    )
                },
                enabled = !isSubmitting,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = PortalDoctors,
                    contentColor = Color.White,
                ),
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(stringResource(R.string.doctor_agenda_create_submitting), fontWeight = FontWeight.Bold)
                } else {
                    Text(
                        text = stringResource(R.string.doctor_agenda_create_btn_confirm),
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                    )
                }
            }
        }
    }
}
