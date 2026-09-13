package com.autamedica.android.presentation.doctors.agenda.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Today
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.TextStyle
import java.util.Locale

@Composable
fun WeekDaySelectorStrip(
    selectedDate: LocalDate,
    appointments: List<Appointment>,
    onSelectDate: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = LocalHapticFeedback.current
    val today = remember { LocalDate.now() }
    val days = remember(today) {
        // -3 days to +17 days (3 weeks total window)
        (-3..17).map { today.plusDays(it.toLong()) }
    }

    val appointmentsByDate = remember(appointments) {
        appointments.groupBy { appt ->
            runCatching {
                OffsetDateTime.parse(appt.startTime).toLocalDate()
            }.getOrNull()
        }
    }

    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    // Auto-scroll to today or selected date on first launch
    LaunchedEffect(selectedDate) {
        val index = days.indexOf(selectedDate)
        if (index >= 0) {
            val targetIndex = (index - 2).coerceAtLeast(0)
            listState.animateScrollToItem(targetIndex)
        }
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = AuBackground,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LazyRow(
                state = listState,
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.weight(1f),
            ) {
                items(days, key = { it.toString() }) { date ->
                    val isSelected = date == selectedDate
                    val isToday = date == today
                    val count = appointmentsByDate[date]?.size ?: 0
                    val dayOfWeekName = when (date.dayOfWeek) {
                        DayOfWeek.MONDAY -> "LUN"
                        DayOfWeek.TUESDAY -> "MAR"
                        DayOfWeek.WEDNESDAY -> "MIÉ"
                        DayOfWeek.THURSDAY -> "JUE"
                        DayOfWeek.FRIDAY -> "VIE"
                        DayOfWeek.SATURDAY -> "SÁB"
                        DayOfWeek.SUNDAY -> "DOM"
                    }

                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = when {
                            isSelected -> PortalDoctors
                            isToday -> PortalDoctors.copy(alpha = 0.12f)
                            else -> Color.White
                        },
                        border = BorderStroke(
                            width = if (isSelected) 2.dp else 1.dp,
                            color = when {
                                isSelected -> PortalDoctors
                                isToday -> PortalDoctors.copy(alpha = 0.4f)
                                else -> Color(0xFFE2E8F0)
                            },
                        ),
                        shadowElevation = if (isSelected) 4.dp else 0.dp,
                        modifier = Modifier
                            .width(58.dp)
                            .height(76.dp)
                            .clickable {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                onSelectDate(date)
                            },
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                            modifier = Modifier.padding(4.dp),
                        ) {
                            Text(
                                text = dayOfWeekName,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp,
                                color = when {
                                    isSelected -> Color.White.copy(alpha = 0.9f)
                                    isToday -> PortalDoctors
                                    else -> AuTextTertiary
                                },
                            )

                            Spacer(modifier = Modifier.height(2.dp))

                            Text(
                                text = date.dayOfMonth.toString(),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 18.sp,
                                color = when {
                                    isSelected -> Color.White
                                    isToday -> PortalDoctors
                                    else -> AuTextPrimary
                                },
                            )

                            Spacer(modifier = Modifier.height(2.dp))

                            // Indicator dot or count badge
                            if (count > 0) {
                                Surface(
                                    shape = CircleShape,
                                    color = if (isSelected) Color.White else PortalDoctors,
                                    modifier = Modifier.size(16.dp),
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(
                                            text = count.toString(),
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (isSelected) PortalDoctors else Color.White,
                                        )
                                    }
                                }
                            } else {
                                Box(
                                    modifier = Modifier
                                        .size(6.dp)
                                        .padding(top = 2.dp),
                                ) {
                                    if (isToday) {
                                        Surface(
                                            shape = CircleShape,
                                            color = if (isSelected) Color.White.copy(alpha = 0.7f) else PortalDoctors.copy(alpha = 0.5f),
                                            modifier = Modifier.size(4.dp),
                                        ) {}
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Shortcut to Today
            if (selectedDate != today) {
                IconButton(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onSelectDate(today)
                        scope.launch {
                            val todayIndex = days.indexOf(today)
                            if (todayIndex >= 0) {
                                listState.animateScrollToItem((todayIndex - 2).coerceAtLeast(0))
                            }
                        }
                    },
                    modifier = Modifier.padding(end = 8.dp),
                ) {
                    Surface(
                        shape = CircleShape,
                        color = PortalDoctors.copy(alpha = 0.1f),
                        modifier = Modifier.size(36.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Today,
                            contentDescription = "Ir a hoy",
                            tint = PortalDoctors,
                            modifier = Modifier.padding(8.dp),
                        )
                    }
                }
            }
        }
    }
}
