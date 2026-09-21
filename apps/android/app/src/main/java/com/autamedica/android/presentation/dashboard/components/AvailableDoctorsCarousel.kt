package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.autamedica.android.R
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs

@Composable
fun AvailableDoctorsCarousel(
    doctors: List<DoctorBookingInfo>,
    isLoading: Boolean,
    onDoctorClick: (DoctorBookingInfo) -> Unit,
    onViewAllClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    var isUserInteracting by remember { mutableStateOf(false) }

    // Pause auto-scroll when user touches or drags
    LaunchedEffect(listState.isScrollInProgress) {
        if (listState.isScrollInProgress) {
            isUserInteracting = true
            delay(3000L)
            isUserInteracting = false
        }
    }

    // Continuous smooth horizontal glide (matching Web speed of ~30px/s)
    LaunchedEffect(isUserInteracting, doctors.size, isLoading) {
        if (isUserInteracting || isLoading || doctors.isEmpty()) return@LaunchedEffect
        while (isActive) {
            listState.scrollBy(1.2f)
            delay(25L)
            if (!listState.canScrollForward) {
                listState.scrollToItem(0)
            }
        }
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Section Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = "Médicos disponibles",
                    style = MaterialTheme.typography.titleMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Atención inmediata",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
            }

            Text(
                text = "Ver todos",
                style = MaterialTheme.typography.labelMedium,
                color = AuAccent,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(
                        onClickLabel = "Ver todos los médicos disponibles",
                        onClick = onViewAllClick,
                    )
                    .padding(horizontal = 8.dp, vertical = 12.dp),
            )
        }

        if (doctors.isEmpty() && !isLoading) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = Color.White,
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "No hay profesionales disponibles para consulta inmediata en este momento.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = AuTextSecondary,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            }
        } else {
            // Horizontal Doctors Carousel with smooth glide
            LazyRow(
                state = listState,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 6.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                itemsIndexed(doctors, key = { _, doc -> doc.id }) { _, doctor ->
                    DoctorCard(
                        doctor = doctor,
                        onClick = { onDoctorClick(doctor) },
                    )
                }
            }
        }
    }
}

@Composable
private fun DoctorCard(
    doctor: DoctorBookingInfo,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .width(292.dp)
            .height(176.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(22.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        shadowElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            // Top: Photo / Initials + Name + Specialty + Rating
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Doctor Photo or Avatar
                val fallbackAvatarRes = getDoctorFallbackAvatar(doctor.id, doctor.name)
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFFE2E8F0)),
                    contentAlignment = Alignment.Center,
                ) {
                    if (!doctor.avatarUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = doctor.avatarUrl,
                            contentDescription = doctor.name,
                            contentScale = ContentScale.Crop,
                            placeholder = painterResource(id = fallbackAvatarRes),
                            error = painterResource(id = fallbackAvatarRes),
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        Image(
                            painter = painterResource(id = fallbackAvatarRes),
                            contentDescription = doctor.name,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }

                // Info
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = doctor.name,
                            style = MaterialTheme.typography.titleSmall.copy(
                                fontSize = 13.5.sp,
                                lineHeight = 17.sp,
                            ),
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        // Verified badge: solo si la matrícula está validada en SISA/REFEPS
                        val isVerified = doctor.sssValidationStatus == "valid" || doctor.sssValidationStatus == "exempt"
                        if (isVerified) {
                            Icon(
                                imageVector = Icons.Outlined.CheckCircle,
                                contentDescription = "Verificado",
                                tint = Color(0xFF0284C7),
                                modifier = Modifier.size(15.dp),
                            )
                        }
                    }

                    Text(
                        text = doctor.specialty,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF0284C7),
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )

                    val formattedLicense = formatLicenseDisplay(doctor.licenseNumber)
                    if (formattedLicense.isNotBlank()) {
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = formattedLicense,
                            fontSize = 11.sp,
                            color = AuTextTertiary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            // Divider
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(Color(0xFFF1F5F9))
            )

            // Bottom: Price + Action Button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "Consulta",
                        fontSize = 10.sp,
                        color = AuTextTertiary,
                    )
                    val feeText = doctor.consultationFee?.takeIf { it > 0 }?.let { fee ->
                        NumberFormat.getCurrencyInstance(Locale.getDefault()).apply {
                            maximumFractionDigits = 0
                        }.format(fee)
                    } ?: "A consultar"
                    Text(
                        text = feeText,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0F172A),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                // Agendar button (48dp min touch target)
                Button(
                    onClick = onClick,
                    shape = RoundedCornerShape(999.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF0F172A),
                        contentColor = Color.White,
                    ),
                    modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 44.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = "Agendar",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

private fun formatLicenseDisplay(rawLicense: String?): String {
    if (rawLicense.isNullOrBlank()) return "MN Colegiado"
    val trimmed = rawLicense.trim()
    if (trimmed.startsWith("PENDING", ignoreCase = true)) {
        return "MN Colegiado"
    }
    val isUuidOrHex = trimmed.contains(Regex("[0-9a-fA-F]{4,}-[0-9a-fA-F]{4,}")) ||
        trimmed.matches(Regex("^[0-9a-fA-F-]{16,}$"))
    if (isUuidOrHex) {
        return "MN Colegiado"
    }
    if (trimmed.matches(Regex("^\\d{4,8}$"))) {
        return "MN $trimmed"
    }
    return trimmed
}

private fun getDoctorFallbackAvatar(doctorId: String, name: String): Int {
    val clean = name.lowercase()
    val isFemale = clean.contains("dra.") ||
        clean.contains("doctora") ||
        clean.contains("amancay") ||
        clean.contains("layla") ||
        clean.contains("bianca") ||
        clean.contains("bárbara") ||
        clean.contains("barbara") ||
        clean.contains("julieta") ||
        clean.contains("leticia") ||
        clean.contains("camila") ||
        clean.contains("valentina") ||
        clean.contains("sofía") ||
        clean.contains("sofia") ||
        clean.contains("carolina") ||
        clean.contains("mariana") ||
        clean.contains("rachel") ||
        clean.contains("manuela") ||
        clean.contains("lucía") ||
        clean.contains("lucia") ||
        clean.contains("maría") ||
        clean.contains("maria") ||
        clean.contains("victoria") ||
        clean.contains("laura") ||
        clean.contains("ana") ||
        clean.contains("paula") ||
        clean.contains("claudia") ||
        clean.contains("andrea") ||
        clean.contains("natalia") ||
        clean.contains("gabriela") ||
        clean.contains("daniela") ||
        clean.contains("melisa") ||
        clean.contains("melissa")

    val isMale = clean.contains("dr.") ||
        clean.contains("doctor ") ||
        clean.contains("alejandro") ||
        clean.contains("carlos") ||
        clean.contains("lucas") ||
        clean.contains("martín") ||
        clean.contains("martin") ||
        clean.contains("nicolás") ||
        clean.contains("nicolas") ||
        clean.contains("lucio") ||
        clean.contains("laureiro") ||
        clean.contains("tomaz") ||
        clean.contains("davide") ||
        clean.contains("emilio") ||
        clean.contains("maximiliano")

    val hash = abs(doctorId.hashCode() xor name.hashCode())

    return when {
        isFemale && !isMale -> {
            when (hash % 3) {
                0 -> R.drawable.avatar_doctor_f1
                1 -> R.drawable.avatar_doctor_f2
                else -> R.drawable.avatar_doctor_f3
            }
        }
        isMale && !isFemale -> {
            when (hash % 3) {
                0 -> R.drawable.avatar_doctor_m1
                1 -> R.drawable.avatar_doctor_m2
                else -> R.drawable.avatar_doctor_m3
            }
        }
        else -> {
            when (hash % 6) {
                0 -> R.drawable.avatar_doctor_f1
                1 -> R.drawable.avatar_doctor_m1
                2 -> R.drawable.avatar_doctor_f2
                3 -> R.drawable.avatar_doctor_m2
                4 -> R.drawable.avatar_doctor_f3
                else -> R.drawable.avatar_doctor_m3
            }
        }
    }
}
