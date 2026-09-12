package com.autamedica.android.presentation.appointments

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.PortalPatients
import kotlin.math.abs

@Composable
fun DoctorAvatar(
    name: String,
    avatarUrl: String?,
    modifier: Modifier = Modifier,
    doctorId: String? = null,
    size: Dp = 42.dp,
    accentColor: Color = PortalPatients,
    border: BorderStroke? = null,
) {
    val fallbackRes = getDoctorFallbackAvatar(doctorId.orEmpty(), name)

    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .then(
                if (border != null) Modifier.border(border, CircleShape)
                else Modifier
            )
            .background(accentColor.copy(alpha = 0.16f)),
        contentAlignment = Alignment.Center,
    ) {
        if (!avatarUrl.isNullOrBlank()) {
            AsyncImage(
                model = avatarUrl,
                contentDescription = name,
                contentScale = ContentScale.Crop,
                placeholder = painterResource(id = fallbackRes),
                error = painterResource(id = fallbackRes),
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Image(
                painter = painterResource(id = fallbackRes),
                contentDescription = name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

internal fun getDoctorFallbackAvatar(doctorId: String, name: String): Int {
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
        clean.contains("maximiliano") ||
        clean.contains("eduardo")

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
