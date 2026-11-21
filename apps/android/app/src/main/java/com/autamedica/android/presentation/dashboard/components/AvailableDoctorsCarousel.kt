package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.scrollBy
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.autamedica.android.R
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatientsAction
import com.autamedica.android.presentation.theme.SecondaryDark
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
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

    LaunchedEffect(listState.isScrollInProgress) {
        if (listState.isScrollInProgress) {
            isUserInteracting = true
            delay(3500L)
            isUserInteracting = false
        }
    }

    LaunchedEffect(isUserInteracting, doctors.size, isLoading) {
        if (isUserInteracting || isLoading || doctors.size <= 1) return@LaunchedEffect
        while (isActive) {
            listState.scrollBy(1.0f)
            delay(28L)
            if (!listState.canScrollForward) {
                listState.scrollToItem(0)
            }
        }
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 2.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.patient_home_doctors_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(R.string.patient_home_doctors_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
            }

            val viewAllLabel = stringResource(R.string.patient_home_doctors_view_all)
            Text(
                text = viewAllLabel,
                style = MaterialTheme.typography.labelLarge,
                color = PortalPatientsAction,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                softWrap = false,
                modifier = Modifier
                    .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(
                        onClickLabel = viewAllLabel,
                        onClick = onViewAllClick,
                    )
                    .padding(horizontal = 8.dp, vertical = 14.dp),
            )
        }

        if (doctors.isEmpty() && !isLoading) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                color = Color.White,
                border = BorderStroke(1.dp, AuBorder),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = stringResource(R.string.patient_home_doctors_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        color = AuTextSecondary,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        } else {
            LazyRow(
                state = listState,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(horizontal = 2.dp, vertical = 4.dp),
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
    val defaultLicenseLabel = stringResource(R.string.patient_home_doctor_license_default)
    val licensePrefix = stringResource(R.string.patient_home_doctor_license_prefix)
    val feeFallback = stringResource(R.string.patient_home_doctor_fee_tbd)

    Surface(
        modifier = modifier
            .width(284.dp)
            .height(172.dp)
            .clip(RoundedCornerShape(22.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(22.dp),
        color = Color.White,
        border = BorderStroke(1.dp, AuBorder),
        shadowElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                val fallbackAvatarRes = getDoctorFallbackAvatar(doctor.id, doctor.name)
                Box(
                    modifier = Modifier
                        .size(54.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFFE0F2FE)),
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

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = doctor.name,
                            style = MaterialTheme.typography.titleSmall.copy(
                                fontSize = 14.sp,
                                lineHeight = 18.sp,
                            ),
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        val isVerified = doctor.sssValidationStatus == "valid" || doctor.sssValidationStatus == "exempt"
                        if (isVerified) {
                            Spacer(modifier = Modifier.width(4.dp))
                            Icon(
                                imageVector = Icons.Outlined.CheckCircle,
                                contentDescription = stringResource(R.string.patient_home_doctor_verified),
                                tint = SecondaryDark,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }

                    Text(
                        text = doctor.specialty,
                        style = MaterialTheme.typography.bodySmall,
                        color = SecondaryDark,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )

                    val formattedLicense = formatLicenseDisplay(
                        rawLicense = doctor.licenseNumber,
                        defaultLabel = defaultLicenseLabel,
                        numericPrefix = licensePrefix,
                    )
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

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(Color(0xFFF1F5F9)),
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.patient_home_doctor_fee_label),
                        fontSize = 10.5.sp,
                        color = AuTextTertiary,
                    )
                    val feeText = doctor.consultationFee?.takeIf { it > 0 }?.let { fee ->
                        NumberFormat.getCurrencyInstance(Locale.getDefault()).apply {
                            maximumFractionDigits = 0
                        }.format(fee)
                    } ?: feeFallback
                    Text(
                        text = feeText,
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                Button(
                    onClick = onClick,
                    shape = RoundedCornerShape(999.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalPatientsAction,
                        contentColor = Color.White,
                    ),
                    modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 42.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = stringResource(R.string.patient_home_doctor_book_action),
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }
        }
    }
}

private fun formatLicenseDisplay(
    rawLicense: String?,
    defaultLabel: String,
    numericPrefix: String,
): String {
    if (rawLicense.isNullOrBlank()) return defaultLabel
    val trimmed = rawLicense.trim()
    if (trimmed.startsWith("PENDING", ignoreCase = true)) {
        return defaultLabel
    }
    val isUuidOrHex = trimmed.contains(Regex("[0-9a-fA-F]{4,}-[0-9a-fA-F]{4,}")) ||
        trimmed.matches(Regex("^[0-9a-fA-F-]{16,}$"))
    if (isUuidOrHex) {
        return defaultLabel
    }
    if (trimmed.matches(Regex("^\\d{4,8}$"))) {
        return "$numericPrefix $trimmed"
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
