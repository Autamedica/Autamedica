package com.autamedica.android.presentation.appointments

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PortalPatients
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val spanishLocale = Locale("es", "AR")

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun BookAppointmentScreen(
    onBack: () -> Unit,
    onNavigateToAgenda: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: BookingViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val accentColor = PortalPatients

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Pedir turno",
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "Videoconsulta médica",
                            style = MaterialTheme.typography.labelSmall,
                            color = accentColor,
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
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AuBackground,
                ),
            )
        },
        containerColor = AuBackground,
        modifier = modifier,
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            // ── PASO 1: Especialidades Médicas ──
            item {
                SectionHeader(
                    stepNumber = "1",
                    title = "Especialidad",
                    subtitle = "Elegí el área de atención",
                )
                Spacer(modifier = Modifier.height(10.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(uiState.specialties) { specialty ->
                        val isSelected = uiState.selectedSpecialty.equals(specialty, ignoreCase = true)
                        SpecialtyChip(
                            label = specialty,
                            isSelected = isSelected,
                            accentColor = accentColor,
                            onClick = { viewModel.selectSpecialty(specialty) },
                        )
                    }
                }
            }

            // ── PASO 2: Tarjetas de Médicos Disponibles ──
            item {
                SectionHeader(
                    stepNumber = "2",
                    title = "Profesional",
                    subtitle = "Elegí al especialista",
                )
                Spacer(modifier = Modifier.height(10.dp))

                if (uiState.isLoadingDoctors) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = accentColor, strokeWidth = 2.dp)
                    }
                } else if (uiState.doctorsList.isEmpty()) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = AuSurface,
                        border = BorderStroke(1.dp, AuBorder),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Info,
                                contentDescription = null,
                                tint = AuTextTertiary,
                                modifier = Modifier.size(32.dp),
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "No hay profesionales disponibles en esta especialidad actualmente.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = AuTextSecondary,
                            )
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        uiState.doctorsList.forEach { doctor ->
                            val isSelected = uiState.selectedDoctor?.id == doctor.id
                            DoctorCard(
                                doctor = doctor,
                                isSelected = isSelected,
                                accentColor = accentColor,
                                onClick = { viewModel.selectDoctor(doctor) },
                            )
                        }
                    }
                }
            }

            // ── PASO 3: Selector de Fecha y Grilla de Horarios ──
            item {
                SectionHeader(
                    stepNumber = "3",
                    title = "Fecha y horario",
                    subtitle = "Elegí el día y la hora que prefieras",
                )
                Spacer(modifier = Modifier.height(10.dp))

                // Carrusel de los próximos 7 días
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(uiState.availableDates) { date ->
                        val isSelected = uiState.selectedDate == date
                        DateCard(
                            date = date,
                            isSelected = isSelected,
                            accentColor = accentColor,
                            onClick = { viewModel.selectDate(date) },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                Text(
                    text = "Horarios disponibles",
                    style = MaterialTheme.typography.labelMedium,
                    color = AuTextSecondary,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.height(8.dp))

                if (uiState.availableSlots.isEmpty()) {
                    Text(
                        text = "Sin turnos disponibles para esta fecha.",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                } else {
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        uiState.availableSlots.forEach { slot ->
                            val isSelected = uiState.selectedSlot == slot
                            TimeSlotChip(
                                slot = slot,
                                isSelected = isSelected,
                                accentColor = accentColor,
                                onClick = { viewModel.selectSlot(slot) },
                            )
                        }
                    }
                }
            }

            // ── PASO 4: Motivo de consulta y Confirmación ──
            item {
                SectionHeader(
                    stepNumber = "4",
                    title = "Motivo de consulta",
                    subtitle = "Contanos brevemente el motivo del turno",
                )
                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = uiState.reasonText,
                    onValueChange = viewModel::onReasonChanged,
                    placeholder = {
                        Text(
                            "Ej: Control cardiológico de rutina, dolor torácico leve...",
                            color = AuTextTertiary,
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 5,
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = AuSurface,
                        unfocusedContainerColor = AuSurface,
                        focusedBorderColor = accentColor,
                        unfocusedBorderColor = AuBorder,
                        focusedTextColor = AuTextPrimary,
                        unfocusedTextColor = AuTextPrimary,
                    ),
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Resumen del turno
                uiState.selectedDoctor?.let { doc ->
                    uiState.selectedSlot?.let { slot ->
                        BookingSummaryCard(
                            doctor = doc,
                            date = uiState.selectedDate,
                            slot = slot,
                            accentColor = accentColor,
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                    }
                }

                // Error banner
                uiState.errorMessage?.let { errorMsg ->
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = ErrorContainer,
                        border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.4f)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 12.dp),
                    ) {
                        Text(
                            text = errorMsg,
                            color = AuDanger,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(12.dp),
                        )
                    }
                }

                // Botón Confirmar Turno
                Button(
                    onClick = viewModel::confirmBooking,
                    enabled = uiState.selectedDoctor != null && uiState.selectedSlot != null && !uiState.isBooking,
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = accentColor,
                        disabledContainerColor = AuSurfaceHover,
                        contentColor = Color.White,
                        disabledContentColor = AuTextTertiary,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                ) {
                    if (uiState.isBooking) {
                        CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(22.dp),
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text("Agendando turno...", fontWeight = FontWeight.SemiBold)
                    } else {
                        Icon(
                            imageVector = Icons.Default.CalendarMonth,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Confirmar Turno",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }

    // ── Diálogo de Éxito ──
    if (uiState.bookingSuccess) {
        val doc = uiState.selectedDoctor
        val slot = uiState.selectedSlot.orEmpty()
        val dateStr = uiState.selectedDate.format(DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", spanishLocale))
            .replaceFirstChar { it.uppercase() }

        AlertDialog(
            onDismissRequest = { viewModel.dismissSuccess() },
            icon = {
                Surface(
                    shape = CircleShape,
                    color = AuSuccess.copy(alpha = 0.16f),
                    modifier = Modifier.size(56.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CheckCircle,
                        contentDescription = null,
                        tint = AuSuccess,
                        modifier = Modifier.padding(12.dp),
                    )
                }
            },
            title = {
                Text(
                    text = "Turno confirmado",
                    style = MaterialTheme.typography.titleLarge,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = AuBackground,
                        border = BorderStroke(1.dp, AuBorder),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = doc?.name ?: "Especialista",
                                style = MaterialTheme.typography.titleSmall,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = "${doc?.specialty} · ${doc?.licenseNumber}",
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary,
                            )
                            Text(
                                text = "$dateStr a las $slot hs",
                                style = MaterialTheme.typography.bodySmall,
                                color = accentColor,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = "Videoconsulta",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextTertiary,
                            )
                        }
                    }
                    Text(
                        text = "Vas a poder ingresar desde tus turnos cuando llegue el horario.",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.dismissSuccess()
                        onNavigateToAgenda()
                    },
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = accentColor),
                ) {
                    Text("Ver mis turnos", fontWeight = FontWeight.Bold)
                }
            },
            containerColor = AuSurface,
            shape = RoundedCornerShape(20.dp),
        )
    }
}

@Composable
private fun SectionHeader(
    stepNumber: String,
    title: String,
    subtitle: String,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Surface(
            shape = CircleShape,
            color = PortalPatients.copy(alpha = 0.16f),
            modifier = Modifier.size(28.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    text = stepNumber,
                    style = MaterialTheme.typography.labelMedium,
                    color = PortalPatients,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        Column {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = AuTextPrimary,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
            )
        }
    }
}

@Composable
private fun SpecialtyChip(
    label: String,
    isSelected: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = if (isSelected) accentColor.copy(alpha = 0.18f) else AuSurface,
        border = BorderStroke(
            1.dp,
            if (isSelected) accentColor else AuBorder,
        ),
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = if (isSelected) accentColor else AuTextSecondary,
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun DoctorCard(
    doctor: DoctorBookingInfo,
    isSelected: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = if (isSelected) accentColor.copy(alpha = 0.08f) else AuSurface,
        border = BorderStroke(
            width = if (isSelected) 1.5.dp else 1.dp,
            color = if (isSelected) accentColor else AuBorder,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Avatar o iniciales
            Surface(
                shape = CircleShape,
                color = accentColor.copy(alpha = 0.16f),
                modifier = Modifier.size(48.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    val initials = doctor.name
                        .replace("Dr.", "")
                        .replace("Dra.", "")
                        .trim()
                        .split(" ")
                        .take(2)
                        .mapNotNull { it.firstOrNull()?.toString() }
                        .joinToString("")
                        .ifBlank { "MD" }

                    Text(
                        text = initials,
                        style = MaterialTheme.typography.titleMedium,
                        color = accentColor,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = doctor.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = doctor.specialty,
                    style = MaterialTheme.typography.bodySmall,
                    color = accentColor,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Mat: ${doctor.licenseNumber}",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                    )
                    Text(
                        text = "·",
                        color = AuTextTertiary,
                    )
                    Text(
                        text = if (doctor.consultationFee != null && doctor.consultationFee > 0) {
                            "Arancel: $${"%,.0f".format(doctor.consultationFee)}"
                        } else {
                            "Cubierto por plan"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextSecondary,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            if (isSelected) {
                Surface(
                    shape = CircleShape,
                    color = accentColor,
                    modifier = Modifier.size(24.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = "Seleccionado",
                        tint = Color.White,
                        modifier = Modifier.padding(4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun DateCard(
    date: LocalDate,
    isSelected: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    val dayName = date.format(DateTimeFormatter.ofPattern("EEE", spanishLocale)).uppercase()
    val dayNum = date.dayOfMonth.toString()
    val monthName = date.format(DateTimeFormatter.ofPattern("MMM", spanishLocale)).uppercase()

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = if (isSelected) accentColor.copy(alpha = 0.16f) else AuSurface,
        border = BorderStroke(
            1.dp,
            if (isSelected) accentColor else AuBorder,
        ),
        modifier = Modifier
            .width(68.dp)
            .clickable(onClick = onClick),
    ) {
        Column(
            modifier = Modifier.padding(vertical = 12.dp, horizontal = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = dayName,
                style = MaterialTheme.typography.labelSmall,
                color = if (isSelected) accentColor else AuTextTertiary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 11.sp,
            )
            Text(
                text = dayNum,
                style = MaterialTheme.typography.titleLarge,
                color = if (isSelected) AuTextPrimary else AuTextSecondary,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = monthName,
                style = MaterialTheme.typography.labelSmall,
                color = if (isSelected) accentColor else AuTextTertiary,
                fontSize = 10.sp,
            )
        }
    }
}

@Composable
private fun TimeSlotChip(
    slot: String,
    isSelected: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = if (isSelected) accentColor else AuSurface,
        border = BorderStroke(
            1.dp,
            if (isSelected) accentColor else AuBorder,
        ),
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                imageVector = Icons.Default.AccessTime,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = if (isSelected) Color.White else AuTextSecondary,
            )
            Text(
                text = "$slot hs",
                style = MaterialTheme.typography.labelMedium,
                color = if (isSelected) Color.White else AuTextPrimary,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun BookingSummaryCard(
    doctor: DoctorBookingInfo,
    date: LocalDate,
    slot: String,
    accentColor: Color,
) {
    val dateStr = date.format(DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", spanishLocale))
        .replaceFirstChar { it.uppercase() }

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = accentColor.copy(alpha = 0.08f),
        border = BorderStroke(1.dp, accentColor.copy(alpha = 0.3f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Videocam,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    text = "Resumen del Turno",
                    style = MaterialTheme.typography.titleSmall,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
            }
            Text(
                text = "${doctor.name} · ${doctor.specialty}",
                style = MaterialTheme.typography.bodyMedium,
                color = AuTextPrimary,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "$dateStr a las $slot hs",
                style = MaterialTheme.typography.bodySmall,
                color = accentColor,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = "Duración estimada: 45 minutos · Sala de telemedicina HD cifrada",
                style = MaterialTheme.typography.labelSmall,
                color = AuTextTertiary,
            )
        }
    }
}
