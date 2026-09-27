package com.autamedica.android.presentation.ondemand

import android.media.AudioManager
import android.media.ToneGenerator
import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.domain.model.dispatchTierLabel
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors
import java.time.OffsetDateTime
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorOnDemandScreen(
    onBack: () -> Unit,
    onNavigateToCall: (roomId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DoctorOnDemandViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(viewModel.navigateToCall) {
        viewModel.navigateToCall.collect { claim ->
            if (claim != null && !claim.cloudflareRoomId.isNullOrBlank()) {
                onNavigateToCall(claim.cloudflareRoomId)
                viewModel.consumeNavigateToCall()
            }
        }
    }

    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var highlightedId by remember { mutableStateOf<String?>(null) }
    var flashStartedAt by remember { mutableLongStateOf(0L) }

    LaunchedEffect(uiState.searchingRequests.isEmpty()) {
        while (uiState.searchingRequests.isNotEmpty()) {
            delay(1_000)
            now = System.currentTimeMillis()
        }
    }

    LaunchedEffect(Unit) {
        viewModel.newRequestEvents.collect { requestId ->
            highlightedId = requestId
            flashStartedAt = System.currentTimeMillis()
            runCatching {
                val toneGen = ToneGenerator(AudioManager.STREAM_MUSIC, 60)
                toneGen.startTone(ToneGenerator.TONE_PROP_BEEP, 200)
                delay(300)
                toneGen.release()
            }
        }
    }

    val flashActive = highlightedId != null && System.currentTimeMillis() - flashStartedAt < 3_000

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Consultas On-Demand",
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = (-0.5).sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "Ofertas en vivo · 25 s de ventana",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
        ) {
            Spacer(modifier = Modifier.height(4.dp))

            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = PortalDoctors, strokeWidth = 2.dp)
                    }
                }

                else -> {
                    DutyToggleCard(
                        isOnDuty = uiState.isOnDuty,
                        isLoading = uiState.isDutyLoading,
                        onToggle = viewModel::toggleDuty,
                    )

                    uiState.error?.let { error ->
                        Spacer(modifier = Modifier.height(12.dp))
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFFFEF2F2),
                            border = BorderStroke(1.dp, Color(0xFFFECACA)),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = error,
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFFB91C1C),
                                modifier = Modifier.padding(12.dp),
                            )
                        }
                    }

                    uiState.activeRequestId?.let {
                        Spacer(modifier = Modifier.height(12.dp))
                        ActiveConsultBanner(onFinish = viewModel::finishCurrent)
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Consultas esperando",
                            style = MaterialTheme.typography.titleSmall,
                            color = AuTextSecondary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = if (uiState.searchingRequests.isNotEmpty()) Color(0xFF10B981) else Color(0xFFF1F5F9),
                        ) {
                            Text(
                                text = uiState.searchingRequests.size.toString(),
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                color = if (uiState.searchingRequests.isNotEmpty()) Color.White else AuTextTertiary,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    if (uiState.searchingRequests.isEmpty()) {
                        EmptyQueueCard(
                            isOnDuty = uiState.isOnDuty,
                        )
                    } else {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            contentPadding = PaddingValues(bottom = 24.dp),
                        ) {
                            items(count = uiState.searchingRequests.size, key = { index ->
                                uiState.searchingRequests[index].id
                            }) { index ->
                                val request = uiState.searchingRequests[index]
                                val remainingMs = requestRemainingMs(request, now)
                                DispatchRequestCard(
                                    request = request,
                                    isClaiming = uiState.claimingId == request.id,
                                    remainingSeconds = remainingMs
                                        ?.coerceAtLeast(0L)
                                        ?.div(1_000)
                                        ?.toInt()
                                        ?: 0,
                                    isFresh = remainingMs != null && remainingMs <= 12_000,
                                    isNewHighlight = flashActive && highlightedId == request.id,
                                    onAccept = { viewModel.accept(request) },
                                    onExpired = { viewModel.expireRequest(request.id) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DutyToggleCard(
    isOnDuty: Boolean,
    isLoading: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = if (isOnDuty) AuSuccess.copy(alpha = 0.12f) else Color(0xFFF8FAFC),
        border = BorderStroke(
            1.dp,
            if (isOnDuty) AuSuccess.copy(alpha = 0.4f) else Color(0xFFE2E8F0),
        ),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                modifier = Modifier.size(44.dp),
                shape = CircleShape,
                color = if (isOnDuty) AuSuccess.copy(alpha = 0.18f) else Color(0xFFF1F5F9),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            color = if (isOnDuty) AuSuccess else AuTextTertiary,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(20.dp),
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .clip(CircleShape)
                                .background(if (isOnDuty) AuSuccess else Color(0xFFCBD5E1)),
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (isOnDuty) "Guardia activa" else "Guardia en pausa",
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    color = AuTextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = if (isOnDuty) "Recibiendo consultas on-demand de farmacias" else "Tocá activar para recibir consultas",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Button(
                onClick = onToggle,
                enabled = !isLoading,
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isOnDuty) Color(0xFFE11D48) else PortalDoctors,
                    contentColor = Color.White,
                ),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Text(
                    text = if (isOnDuty) "Pausar" else "Activar",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun DispatchRequestCard(
    request: PharmacyDispatchRequest,
    isClaiming: Boolean,
    remainingSeconds: Int,
    isFresh: Boolean,
    isNewHighlight: Boolean,
    onAccept: () -> Unit,
    onExpired: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(remainingSeconds) {
        if (remainingSeconds <= 0 && !isClaiming) {
            onExpired()
        }
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable(enabled = !isClaiming, onClick = onAccept),
        shape = RoundedCornerShape(16.dp),
        color = if (isNewHighlight) Color(0xFFFFFBEB) else Color.White,
        border = BorderStroke(
            1.dp,
            when {
                isNewHighlight -> Color(0xFFF59E0B)
                isFresh -> Color(0xFFFCA5A5)
                else -> Color(0xFFE2E8F0)
            },
        ),
        shadowElevation = if (isNewHighlight) 4.dp else 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = PortalDoctors.copy(alpha = 0.12f),
                        border = BorderStroke(1.dp, PortalDoctors.copy(alpha = 0.3f)),
                    ) {
                        Text(
                            text = dispatchTierLabel(request.tierRequested),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                            color = PortalDoctors,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                    }
                    if (isNewHighlight) {
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = Color(0xFFF59E0B),
                        ) {
                            Text(
                                text = "NUEVA",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                ),
                                color = Color.White,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                            )
                        }
                    }
                    if (remainingSeconds > 0) {
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = if (isFresh) Color(0xFFFEF2F2) else Color(0xFFF1F5F9),
                            border = BorderStroke(
                                1.dp,
                                if (isFresh) Color(0xFFFCA5A5) else Color(0xFFE2E8F0),
                            ),
                        ) {
                            Text(
                                text = if (isFresh) "Cierra en ${remainingSeconds}s" else "Vence en ${remainingSeconds}s",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isFresh) Color(0xFFB91C1C) else AuTextTertiary,
                                ),
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                            )
                        }
                    }
                }
                Text(
                    text = relativeTime(request.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                )
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    modifier = Modifier.size(36.dp),
                    shape = CircleShape,
                    color = Color(0xFFEFF6FF),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = (request.patientName
                                ?: "P")
                                .take(1)
                                .uppercase(),
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                            color = PortalDoctors,
                        )
                    }
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = request.patientName?.takeIf { it.isNotBlank() }
                            ?: "Paciente en farmacia",
                        style = MaterialTheme.typography.bodyLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    request.symptomSummary?.takeIf { it.isNotBlank() }?.let { summary ->
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = summary,
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            Button(
                onClick = onAccept,
                enabled = !isClaiming,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF10B981),
                    contentColor = Color.White,
                ),
            ) {
                if (isClaiming) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp),
                    )
                } else {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Videocam,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(18.dp),
                        )
                        Text(
                            text = "Aceptar consulta",
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyQueueCard(
    isOnDuty: Boolean,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
        shape = RoundedCornerShape(16.dp),
        color = Color(0xFFF8FAFC),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(if (isOnDuty) Color(0xFFECFDF5) else Color(0xFFF1F5F9)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Outlined.MedicalServices,
                    contentDescription = null,
                    tint = if (isOnDuty) AuSuccess else AuTextTertiary,
                    modifier = Modifier.size(24.dp),
                )
            }
            Text(
                text = if (isOnDuty) "Sin consultas en este momento" else "Activa la guardia para empezar",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                color = AuTextPrimary,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            Text(
                text = if (isOnDuty) {
                    "Cuando un paciente solicite atención desde una farmacia, la consulta aparecerá aquí."
                } else {
                    "Las nuevas consultas aparecen automáticamente mientras estás en guardia."
                },
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
}

private fun relativeTime(iso: String): String {
    val instant = runCatching { java.time.OffsetDateTime.parse(iso) }.getOrNull() ?: return ""
    val seconds = java.time.Duration.between(instant, java.time.OffsetDateTime.now()).seconds
    return when {
        seconds < 60 -> "hace un momento"
        seconds < 3600 -> "hace ${(seconds / 60).toInt()} min"
        else -> "hace ${(seconds / 3600).toInt()} h"
    }
}

@Composable
private fun ActiveConsultBanner(
    onFinish: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = PortalDoctors.copy(alpha = 0.10f),
        border = BorderStroke(1.dp, PortalDoctors.copy(alpha = 0.35f)),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                modifier = Modifier.size(40.dp),
                shape = CircleShape,
                color = PortalDoctors.copy(alpha = 0.16f),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = null,
                        tint = PortalDoctors,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Consulta en curso",
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    color = AuTextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "La videollamada está activa. Finalizala al terminar para volver a recibir ofertas.",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Button(
                onClick = onFinish,
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = PortalDoctors,
                    contentColor = Color.White,
                ),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Text(
                    text = "Finalizar",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

private fun requestRemainingMs(request: PharmacyDispatchRequest, nowMillis: Long): Long? {
    val deadline = requestDeadlineMillis(request) ?: return null
    return deadline - nowMillis
}

private fun requestDeadlineMillis(request: PharmacyDispatchRequest): Long? {
    request.searchTimeoutAt?.takeIf { it.isNotBlank() }?.let { raw ->
        runCatching { OffsetDateTime.parse(raw).toInstant().toEpochMilli() }
            .getOrNull()
            ?.let { return it }
    }
    return runCatching {
        OffsetDateTime.parse(request.createdAt).plusSeconds(25).toInstant().toEpochMilli()
    }.getOrNull()
}