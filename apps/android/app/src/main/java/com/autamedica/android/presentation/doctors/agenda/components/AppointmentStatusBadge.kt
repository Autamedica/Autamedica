package com.autamedica.android.presentation.doctors.agenda.components

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.AppointmentStatus

data class StatusStyle(
    val label: String,
    val textColor: Color,
    val containerColor: Color,
)

fun AppointmentStatus.toWebStyle(): StatusStyle = when (this) {
    AppointmentStatus.SCHEDULED -> StatusStyle(
        label = "Programado",
        textColor = Color(0xFF475569), // am-surface-700
        containerColor = Color(0xFFF1F5F9), // am-surface-100
    )
    AppointmentStatus.CONFIRMED -> StatusStyle(
        label = "Confirmado",
        textColor = Color(0xFF047857), // emerald-700
        containerColor = Color(0xFFD1FAE5), // emerald-100
    )
    AppointmentStatus.IN_PROGRESS -> StatusStyle(
        label = "En curso",
        textColor = Color(0xFF0284C7), // sky-700
        containerColor = Color(0xFFE0F2FE), // sky-100
    )
    AppointmentStatus.COMPLETED -> StatusStyle(
        label = "Completado",
        textColor = Color(0xFF334155), // slate-700
        containerColor = Color(0xFFF1F5F9), // slate-100
    )
    AppointmentStatus.CANCELLED -> StatusStyle(
        label = "Cancelado",
        textColor = Color(0xFFB91C1C), // red-700
        containerColor = Color(0xFFFEE2E2), // red-100
    )
    AppointmentStatus.NO_SHOW -> StatusStyle(
        label = "Ausente",
        textColor = Color(0xFFB45309), // amber-700
        containerColor = Color(0xFFFEF3C7), // amber-100
    )
    AppointmentStatus.PAYMENT_PENDING -> StatusStyle(
        label = "Pago pendiente",
        textColor = Color(0xFFB45309),
        containerColor = Color(0xFFFEF3C7),
    )
}

@Composable
fun AppointmentStatusBadge(
    status: AppointmentStatus,
    modifier: Modifier = Modifier,
) {
    val style = status.toWebStyle()
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(6.dp),
        color = style.containerColor,
    ) {
        Text(
            text = style.label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = style.textColor,
            fontWeight = FontWeight.Bold,
            fontSize = 10.sp,
            letterSpacing = 0.5.sp,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
        )
    }
}
