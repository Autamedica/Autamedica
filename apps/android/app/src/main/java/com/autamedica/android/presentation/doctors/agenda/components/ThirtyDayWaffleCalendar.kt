package com.autamedica.android.presentation.doctors.agenda.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import com.autamedica.android.util.CountryContext

data class WaffleDay(
    val date: LocalDate,
    val dayNumber: Int,
    val isToday: Boolean,
    val appointmentsCount: Int,
    val label: String,
)

@Composable
fun ThirtyDayWaffleCalendar(
    appointments: List<Appointment>,
    selectedDate: LocalDate?,
    onSelectDate: (LocalDate?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val today = remember { LocalDate.now() }

    // Generate 30 rolling days
    val days = remember(appointments, today) {
        (0 until 30).map { offset ->
            val currentDate = today.plusDays(offset.toLong())
            val count = appointments.count { appt ->
                runCatching {
                    OffsetDateTime.parse(appt.startTime).toLocalDate() == currentDate
                }.getOrDefault(false)
            }
            val locale = CountryContext.getLocale()
            val pattern = if (CountryContext.isBrazil(locale = locale)) "EEEE, d 'de' MMMM" else "EEEE d 'de' MMMM"
            val formatter = DateTimeFormatter.ofPattern(pattern, locale)
            WaffleDay(
                date = currentDate,
                dayNumber = currentDate.dayOfMonth,
                isToday = offset == 0,
                appointmentsCount = count,
                label = currentDate.format(formatter).replaceFirstChar { it.uppercase() },
            )
        }
    }

    val activeDay = days.firstOrNull { it.date == selectedDate } ?: days.first()

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        shadowElevation = 1.dp,
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            // Header
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
                        modifier = Modifier.size(36.dp),
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFF09090B), // neutral-900
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.CalendarMonth,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.padding(8.dp),
                        )
                    }

                    Column {
                        Text(
                            text = "Agenda del Mes",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = "30 días rodantes de disponibilidad",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextTertiary,
                            fontSize = 11.sp,
                        )
                    }
                }

                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = Color(0xFFF1F5F9), // neutral-100
                ) {
                    Text(
                        text = "30 DÍAS",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF475569),
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // 6-Column Waffle Grid (30 blocks)
            LazyVerticalGrid(
                columns = GridCells.Fixed(6),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(190.dp),
                userScrollEnabled = false,
            ) {
                items(days) { day ->
                    val isSelected = selectedDate == day.date

                    val (bgColor, textColor, borderColor) = when {
                        day.isToday -> Triple(
                            Color(0xFF7C3AED), // purple-600
                            Color.White,
                            Color(0xFF6D28D9), // purple-700
                        )
                        day.appointmentsCount > 0 -> Triple(
                            Color(0xFF3B82F6), // blue-500
                            Color.White,
                            Color(0xFF2563EB), // blue-600
                        )
                        isSelected -> Triple(
                            Color(0xFFE0F2FE),
                            Color(0xFF0284C7),
                            Color(0xFF38BDF8),
                        )
                        else -> Triple(
                            Color(0xFFF8FAFC),
                            Color(0xFF334155),
                            Color(0xFFE2E8F0),
                        )
                    }

                    Surface(
                        modifier = Modifier
                            .aspectRatio(1f)
                            .clickable {
                                if (selectedDate == day.date) onSelectDate(null)
                                else onSelectDate(day.date)
                            },
                        shape = RoundedCornerShape(10.dp),
                        color = bgColor,
                        border = BorderStroke(if (isSelected && !day.isToday) 2.dp else 1.dp, borderColor),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = day.dayNumber.toString(),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = textColor,
                                fontSize = 12.sp,
                            )
                            // White dot indicator at bottom for consultations
                            if (day.appointmentsCount > 0) {
                                Surface(
                                    modifier = Modifier
                                        .align(Alignment.BottomCenter)
                                        .padding(bottom = 3.dp)
                                        .size(4.dp),
                                    shape = CircleShape,
                                    color = if (day.isToday || day.appointmentsCount > 0) Color.White.copy(alpha = 0.9f) else Color(0xFF0284C7),
                                ) {}
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))
            HorizontalDivider(color = Color(0xFFF1F5F9))
            Spacer(modifier = Modifier.height(10.dp))

            // Active Day Detail Info
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFF8FAFC), RoundedCornerShape(12.dp))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text(
                        text = if (activeDay.isToday) "Hoy" else activeDay.label.split(" ").firstOrNull().orEmpty(),
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                    )
                    Text(
                        text = activeDay.label,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Group,
                        contentDescription = null,
                        tint = if (activeDay.appointmentsCount > 0) Color(0xFF3B82F6) else AuTextTertiary,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = if (activeDay.appointmentsCount == 0) "Sin consultas"
                        else "${activeDay.appointmentsCount} consulta${if (activeDay.appointmentsCount > 1) "s" else ""}",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = if (activeDay.appointmentsCount > 0) Color(0xFF1D4ED8) else AuTextTertiary,
                    )
                }
            }

            // Legend
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Surface(modifier = Modifier.size(8.dp), shape = CircleShape, color = Color(0xFF7C3AED)) {}
                    Text("Hoy", style = MaterialTheme.typography.labelSmall, color = AuTextTertiary, fontSize = 10.sp)
                }
                Spacer(modifier = Modifier.width(16.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Surface(modifier = Modifier.size(8.dp), shape = CircleShape, color = Color(0xFF3B82F6)) {}
                    Text("Consultas", style = MaterialTheme.typography.labelSmall, color = AuTextTertiary, fontSize = 10.sp)
                }
                Spacer(modifier = Modifier.width(16.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Surface(modifier = Modifier.size(8.dp), shape = CircleShape, color = Color(0xFFE2E8F0)) {}
                    Text("Libre", style = MaterialTheme.typography.labelSmall, color = AuTextTertiary, fontSize = 10.sp)
                }
            }
        }
    }
}
